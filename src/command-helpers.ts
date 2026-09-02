import * as vscode from 'vscode';

export interface WorkspaceSettingInspection<T> {
	readonly defaultValue?: T;
	readonly globalValue?: T;
	readonly globalLanguageValue?: T;
	readonly workspaceFolderValue?: T;
	readonly workspaceValue?: T;
}

export interface TaskDownload {
	readonly task: string;
	readonly files: string;
	readonly destination: string;
	readonly conflictPolicy: 'replace' | 'skip' | 'prompt';
}

export function reserveExport(state: { inProgress: boolean }): boolean {
	if (state.inProgress) {
		return false;
	}
	state.inProgress = true;
	return true;
}

export type SourceFolderSelection =
	| { readonly kind: 'selected'; readonly folder: vscode.WorkspaceFolder }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'no-workspace' }
	| { readonly kind: 'invalid-source' }
	| { readonly kind: 'ambiguous-programmatic' };

export interface SourceFolderOptions {
	readonly folders: readonly vscode.WorkspaceFolder[];
	readonly sourceUri?: vscode.Uri;
	readonly programmatic: boolean;
	readonly pickFolder: (folders: readonly vscode.WorkspaceFolder[]) => Promise<vscode.WorkspaceFolder | undefined>;
}

export async function selectSourceFolder(options: SourceFolderOptions): Promise<SourceFolderSelection> {
	if (options.folders.length === 0) {
		return { kind: 'no-workspace' };
	}
	if (options.folders.length === 1) {
		return { kind: 'selected', folder: options.folders[0] };
	}
	if (options.sourceUri) {
		const folder = options.folders.find((candidate) => candidate.uri.toString() === options.sourceUri?.toString());
		return folder ? { kind: 'selected', folder } : { kind: 'invalid-source' };
	}
	if (options.programmatic) {
		return { kind: 'ambiguous-programmatic' };
	}
	const folder = await options.pickFolder(options.folders);
	return folder ? { kind: 'selected', folder } : { kind: 'cancelled' };
}

export function workspaceSetting<T>(inspection: WorkspaceSettingInspection<T> | undefined): T | undefined {
	return inspection?.workspaceFolderValue ?? inspection?.workspaceValue;
}

export function taskDownloadFor(
	value: unknown,
	taskName: string,
): TaskDownload | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value.find((candidate): candidate is TaskDownload => (
		isTaskDownload(candidate) && candidate.task === taskName
	));
}

export function stateKey(folder: vscode.WorkspaceFolder, field: string): string {
	return `adHoc.${folder.uri.toString()}.${field}`;
}

function isTaskDownload(value: unknown): value is TaskDownload {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Partial<TaskDownload>;
	return typeof candidate.task === 'string' && candidate.task.length > 0
		&& typeof candidate.files === 'string' && candidate.files.trim().length > 0
		&& typeof candidate.destination === 'string' && candidate.destination.trim().length > 0
		&& (candidate.conflictPolicy === 'replace' || candidate.conflictPolicy === 'skip' || candidate.conflictPolicy === 'prompt');
}