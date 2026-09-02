import * as vscode from 'vscode';

export interface WorkspaceSettingInspection<T> {
	readonly defaultValue?: T;
	readonly globalValue?: T;
	readonly globalLanguageValue?: T;
	readonly workspaceFolderValue?: T;
	readonly workspaceValue?: T;
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

export function stateKey(folder: vscode.WorkspaceFolder, field: string): string {
	return `adHoc.${folder.uri.toString()}.${field}`;
}