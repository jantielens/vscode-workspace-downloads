import * as path from 'node:path';
import * as vscode from 'vscode';

export interface SelectionEntry {
	readonly value: string;
	readonly pattern: boolean;
}

export interface ResolvedFile {
	readonly uri: vscode.Uri;
	readonly relativePath: string;
}

export interface ResolutionResult {
	readonly files: readonly ResolvedFile[];
	readonly unmatched: readonly string[];
	readonly invalid: readonly string[];
}

const globCharacters = /[*?\[\]{}]/;

export function parseAdHocEntries(value: string): SelectionEntry[] {
	return parseEntries(value.split(';'));
}

export function parseConfiguredEntries(value: string): SelectionEntry[] {
	return parseEntries(value.split(/\r?\n/));
}

export function parseEntries(values: readonly string[]): SelectionEntry[] {
	const entries = new Map<string, SelectionEntry>();
	for (const rawValue of values) {
		const value = normalizeEntry(rawValue.trim());
		if (value.length > 0 && !entries.has(value)) {
			entries.set(value, { value, pattern: globCharacters.test(value) });
		}
	}
	return [...entries.values()];
}

export function validateEntries(entries: readonly SelectionEntry[]): string[] {
	const invalid: string[] = [];
	for (const entry of entries) {
		if (entry.value.length === 0 || entry.value.includes('\\') || path.posix.isAbsolute(entry.value)
			|| entry.value.split('/').includes('..') || entry.value.endsWith('/') || entry.value === '.') {
			invalid.push(entry.value || '(empty path)');
		}
	}
	return invalid;
}

export async function resolveEntries(
	workspaceFolder: vscode.WorkspaceFolder,
	entries: readonly SelectionEntry[],
): Promise<ResolutionResult> {
	const invalid = validateEntries(entries);
	if (entries.length === 0) {
		invalid.push('(no paths supplied)');
	}
	if (invalid.length > 0) {
		return { files: [], unmatched: [], invalid };
	}

	const files = new Map<string, ResolvedFile>();
	const unmatched: string[] = [];
	for (const entry of entries) {
		const exact = entry.pattern ? undefined : await resolveExactFile(workspaceFolder, entry.value);
		if (exact?.directory) {
			invalid.push(entry.value);
			continue;
		}
		const matches = entry.pattern
			? await vscode.workspace.findFiles(new vscode.RelativePattern(workspaceFolder, entry.value))
			: exact?.files ?? [];
		if (matches.length === 0) {
			unmatched.push(entry.value);
			continue;
		}
		for (const uri of matches) {
			const relativePath = relativeWorkspacePath(workspaceFolder.uri, uri);
			if (relativePath.length === 0) {
				continue;
			}
			files.set(uri.toString(), { uri, relativePath });
		}
	}

	return {
		files: [...files.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en', { sensitivity: 'variant' })),
		unmatched,
		invalid,
	};
}

async function resolveExactFile(
	workspaceFolder: vscode.WorkspaceFolder,
	entry: string,
): Promise<{ files: vscode.Uri[]; directory: boolean }> {
	const uri = vscode.Uri.joinPath(workspaceFolder.uri, ...entry.split('/'));
	try {
		const stat = await vscode.workspace.fs.stat(uri);
		return { files: stat.type === vscode.FileType.File ? [uri] : [], directory: stat.type === vscode.FileType.Directory };
	} catch (error) {
		if (error instanceof vscode.FileSystemError && error.code !== 'FileNotFound') {
			throw error;
		}
		return { files: [], directory: false };
	}
}

function normalizeEntry(value: string): string {
	return value.replace(/^\.\//, '').replace(/\/+/g, '/');
}

function relativeWorkspacePath(folder: vscode.Uri, file: vscode.Uri): string {
	const relative = path.posix.relative(folder.path, file.path);
	return relative.startsWith('../') || relative === '..' ? '' : relative;
}