import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ResolvedFile } from './selection';

export type ConflictAction = 'replace' | 'skip' | 'cancel';
export type ConflictPolicy = Exclude<ConflictAction, 'cancel'> | 'prompt';

export interface TransferUpdate {
	readonly relativePath: string;
	readonly completed: number;
	readonly skipped: number;
	readonly failed: number;
}

export interface TransferResult {
	readonly completed: number;
	readonly skipped: number;
	readonly failed: number;
	readonly cancelled: boolean;
}

export interface TransferOptions {
	readonly destination: string;
	readonly files: readonly ResolvedFile[];
	readonly isCancellationRequested: () => boolean;
	readonly chooseConflict: (relativePath: string) => Promise<ConflictAction>;
	readonly report: (update: TransferUpdate) => void;
	readonly log: (message: string) => void;
}

interface PlannedFile extends ResolvedFile {
	readonly outputPath: string;
	readonly collision: boolean;
	readonly collisionWinner: boolean;
}

export function chooseConflictForPolicy(
	policy: ConflictPolicy,
	chooseConflict: () => Promise<ConflictAction>,
): Promise<ConflictAction> {
	return policy === 'prompt' ? chooseConflict() : Promise.resolve(policy);
}

export async function transferFiles(options: TransferOptions): Promise<TransferResult> {
	const destination = await fs.realpath(options.destination);
	const plannedFiles = await planFiles(destination, options.files, options.log);
	let policy: ConflictAction | undefined;
	let completed = 0;
	let skipped = 0;
	let failed = 0;

	for (const file of plannedFiles) {
		if (options.isCancellationRequested()) {
			return { completed, skipped, failed, cancelled: true };
		}
		if (file.collision && !file.collisionWinner && policy === 'skip') {
			skipped++;
			report(options, file.relativePath, completed, skipped, failed);
			continue;
		}

		const exists = await existingFile(file.outputPath);
		if (file.collision || exists) {
			policy ??= await options.chooseConflict(file.relativePath);
			if (policy === 'cancel') {
				return { completed, skipped, failed, cancelled: true };
			}
			if (policy === 'skip' && (exists || !file.collision || !file.collisionWinner)) {
				skipped++;
				report(options, file.relativePath, completed, skipped, failed);
				continue;
			}
		}

		try {
			await copyFile(file, exists && policy === 'replace');
			completed++;
		} catch (error) {
			failed++;
			options.log(`Failed ${file.relativePath}: ${errorMessage(error)}`);
		}
		report(options, file.relativePath, completed, skipped, failed);
	}
	return { completed, skipped, failed, cancelled: false };
}

async function planFiles(destination: string, files: readonly ResolvedFile[], log: (message: string) => void): Promise<PlannedFile[]> {
	const collisionGroups = new Map<string, ResolvedFile[]>();
	for (const file of files) {
		const key = file.relativePath.toLocaleLowerCase('en-US');
		const group = collisionGroups.get(key) ?? [];
		group.push(file);
		collisionGroups.set(key, group);
	}
	for (const group of collisionGroups.values()) {
		if (group.length > 1) {
			log(`Destination collision: ${group.map((file) => file.relativePath).join(', ')}`);
		}
	}

	return Promise.all(files.map(async (file) => {
		const group = collisionGroups.get(file.relativePath.toLocaleLowerCase('en-US')) ?? [];
		const outputPath = await safeOutputPath(destination, group[0].relativePath);
		return {
			...file,
			outputPath,
			collision: group.length > 1,
			collisionWinner: group.length === 1 || group[0] === file,
		};
	}));
}

async function safeOutputPath(destination: string, relativePath: string): Promise<string> {
	const outputPath = path.resolve(destination, ...relativePath.split('/'));
	if (!isContained(destination, outputPath)) {
		throw new Error(`Output path escapes destination: ${relativePath}`);
	}
	let current = destination;
	for (const segment of relativePath.split('/')) {
		current = path.join(current, segment);
		try {
			const stat = await fs.lstat(current);
			if (stat.isSymbolicLink()) {
				throw new Error(`Output path contains a symbolic link: ${relativePath}`);
			}
			const canonical = await fs.realpath(current);
			if (!isContained(destination, canonical)) {
				throw new Error(`Output path escapes destination: ${relativePath}`);
			}
		} catch (error) {
			if (isNotFound(error)) {
				break;
			}
			throw error;
		}
	}
	return outputPath;
}

async function copyFile(file: PlannedFile, replace: boolean): Promise<void> {
	const parent = path.dirname(file.outputPath);
	const temporaryPath = path.join(parent, `.${path.basename(file.outputPath)}.workspace-downloads-${randomUUID()}.tmp`);
	await fs.mkdir(parent, { recursive: true });
	try {
		const content = await vscode.workspace.fs.readFile(file.uri);
		await fs.writeFile(temporaryPath, content);
		if (replace) {
			await fs.rm(file.outputPath);
		}
		await fs.rename(temporaryPath, file.outputPath);
	} finally {
		await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

async function existingFile(filePath: string): Promise<boolean> {
	try {
		return (await fs.lstat(filePath)).isFile();
	} catch (error) {
		if (isNotFound(error)) {
			return false;
		}
		throw error;
	}
}

function isContained(root: string, candidate: string): boolean {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function report(options: TransferOptions, relativePath: string, completed: number, skipped: number, failed: number): void {
	options.report({ relativePath, completed, skipped, failed });
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}