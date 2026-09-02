import * as vscode from 'vscode';
import { reserveExport, selectSourceFolder, stateKey, taskDownloadFor, workspaceSetting } from './command-helpers';
import { parseAdHocEntries, parseConfiguredEntries, resolveEntries } from './selection';
import { chooseConflictForPolicy, ConflictAction, ConflictPolicy, transferFiles } from './transfer';

const output = vscode.window.createOutputChannel('Workspace Downloads');
const exportState = { inProgress: false };

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(output);
	context.subscriptions.push(vscode.tasks.onDidEndTaskProcess(({ execution, exitCode }) => {
		void downloadAfterSuccessfulTask(execution.task, exitCode);
	}));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-downloads.downloadFiles',
		(files?: string, destination?: string, sourceUri?: vscode.Uri) => runAdHocDownload(context, files, destination, sourceUri),
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-downloads.downloadConfiguredFiles',
		() => runConfiguredDownload(context),
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-downloads.clearRememberedValues',
		() => clearRememberedValues(context),
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-downloads.configureConflictPolicy',
		() => vscode.commands.executeCommand('workbench.action.openWorkspaceSettings', 'workspaceDownloads.conflictPolicy'),
	));
}

async function downloadAfterSuccessfulTask(task: vscode.Task, exitCode: number | undefined): Promise<void> {
	const sourceFolder = taskWorkspaceFolder(task);
	if (exitCode !== 0 || !sourceFolder) {
		return;
	}
	const configuration = vscode.workspace.getConfiguration('workspaceDownloads', sourceFolder.uri);
	const definition = taskDownloadFor(
		workspaceSetting<unknown>(configuration.inspect<unknown>('taskDownloads')),
		task.name,
	);
	if (!definition) {
		return;
	}
	await startDownload(sourceFolder, parseConfiguredEntries(definition.files), definition.destination, definition.conflictPolicy, async () => {});
}

// This method is called when your extension is deactivated

async function runAdHocDownload(
	context: vscode.ExtensionContext,
	filesArgument?: string,
	destinationArgument?: string,
	sourceUri?: vscode.Uri,
): Promise<void> {
	const sourceFolder = await selectWorkspaceFolder(sourceUri, filesArgument !== undefined || destinationArgument !== undefined);
	if (!sourceFolder) {
		return;
	}
	const rememberedFiles = context.workspaceState.get<string>(stateKey(sourceFolder, 'files'), '');
	const files = filesArgument ?? await vscode.window.showInputBox({
		prompt: 'Workspace-relative files or glob patterns, separated by semicolons',
		value: rememberedFiles,
		ignoreFocusOut: true,
	});
	if (files === undefined) {
		return;
	}
	const rememberedDestination = context.workspaceState.get<string>(stateKey(sourceFolder, 'destination'), '');
	const destination = destinationArgument ?? await vscode.window.showInputBox({
		prompt: 'Local destination folder (leave empty to choose a folder)',
		value: rememberedDestination,
		ignoreFocusOut: true,
	});
	if (destination === undefined) {
		return;
	}
	const configuration = vscode.workspace.getConfiguration('workspaceDownloads', sourceFolder.uri);
	const conflictPolicy = workspaceSetting<ConflictPolicy>(configuration.inspect<ConflictPolicy>('conflictPolicy')) ?? 'prompt';
	await startDownload(sourceFolder, parseAdHocEntries(files), destination, conflictPolicy, async () => {
		await context.workspaceState.update(stateKey(sourceFolder, 'files'), files);
		await context.workspaceState.update(stateKey(sourceFolder, 'destination'), destination);
	});
}

async function runConfiguredDownload(context: vscode.ExtensionContext): Promise<void> {
	const sourceFolder = await selectWorkspaceFolder();
	if (!sourceFolder) {
		return;
	}
	const configuration = vscode.workspace.getConfiguration('workspaceDownloads', sourceFolder.uri);
	const files = workspaceSetting<string>(configuration.inspect<string>('files'));
	if (files === undefined || files.trim().length === 0) {
		const action = await vscode.window.showErrorMessage(
			'Configure workspaceDownloads.files in Workspace or Workspace Folder settings. workspaceDownloads.destination is optional. User settings are not used.',
			'Open Workspace Settings',
		);
		if (action === 'Open Workspace Settings') {
			await vscode.commands.executeCommand('workbench.action.openWorkspaceSettings', 'workspaceDownloads');
		}
		return;
	}
	const configuredDestination = workspaceSetting<string>(configuration.inspect<string>('destination')) ?? '';
	const destination = configuredDestination || await configuredDownloadDestination(context, sourceFolder);
	if (destination === undefined) {
		return;
	}
	const conflictPolicy = workspaceSetting<ConflictPolicy>(configuration.inspect<ConflictPolicy>('conflictPolicy')) ?? 'prompt';
	await startDownload(sourceFolder, parseConfiguredEntries(files), destination, conflictPolicy, async () => {
		await context.workspaceState.update(stateKey(sourceFolder, 'destination'), destination);
	});
}

function taskWorkspaceFolder(task: vscode.Task): vscode.WorkspaceFolder | undefined {
	const scope = task.scope;
	return scope && typeof scope === 'object' && 'uri' in scope ? scope : undefined;
}

async function configuredDownloadDestination(
	context: vscode.ExtensionContext,
	sourceFolder: vscode.WorkspaceFolder,
): Promise<string | undefined> {
	const rememberedDestination = context.workspaceState.get<string>(stateKey(sourceFolder, 'destination'), '');
	return vscode.window.showInputBox({
		prompt: 'Local destination folder (leave empty to choose a folder)',
		value: rememberedDestination,
		ignoreFocusOut: true,
	});
}

async function clearRememberedValues(context: vscode.ExtensionContext): Promise<void> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) {
		void vscode.window.showInformationMessage('There are no open workspace folders with remembered download answers.');
		return;
	}
	await Promise.all(folders.flatMap((folder) => [
		context.workspaceState.update(stateKey(folder, 'files'), undefined),
		context.workspaceState.update(stateKey(folder, 'destination'), undefined),
	]));
	void vscode.window.showInformationMessage('Cleared remembered Workspace Downloads answers for all open workspace folders.');
}

async function startDownload(
	sourceFolder: vscode.WorkspaceFolder,
	entries: ReturnType<typeof parseAdHocEntries>,
	destinationValue: string,
	conflictPolicy: ConflictPolicy,
	onStart: () => Promise<void>,
): Promise<void> {
	if (!reserveExport(exportState)) {
		void vscode.window.showWarningMessage('A Workspace Downloads export is already in progress.');
		return;
	}
	try {
		const resolution = await resolveEntries(sourceFolder, entries);
		if (resolution.invalid.length > 0) {
			void vscode.window.showErrorMessage(`Invalid workspace paths: ${resolution.invalid.join(', ')}`);
			return;
		}
		if (resolution.files.length === 0) {
			void vscode.window.showInformationMessage('No workspace files matched the requested paths or patterns.');
			logUnmatched(resolution.unmatched);
			return;
		}
		const destination = await chooseDestination(destinationValue);
		if (!destination) {
			return;
		}
		await onStart();
		const result = await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: 'Workspace Downloads',
		cancellable: true,
		}, async (progress, token) => {
			logUnmatched(resolution.unmatched);
			return transferFiles({
				destination,
				files: resolution.files,
				isCancellationRequested: () => token.isCancellationRequested,
				chooseConflict: () => chooseConflictForPolicy(conflictPolicy, chooseConflict),
				report: (update) => progress.report({
					message: `${update.relativePath} (${update.completed} copied, ${update.skipped} skipped, ${update.failed} failed)`,
				}),
				log: (message) => output.appendLine(message),
			});
		});
		exportState.inProgress = false;
		const action = await vscode.window.showInformationMessage(
			`Workspace Downloads: ${result.completed} copied, ${result.skipped} skipped, ${result.failed} failed${result.cancelled ? ' (cancelled)' : ''}.`,
			'Open Destination',
			'Show Output',
		);
		if (action === 'Open Destination') {
			await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(destination));
		} else if (action === 'Show Output') {
			output.show();
		}
	} catch (error) {
		output.appendLine(`Export could not start: ${errorMessage(error)}`);
		void vscode.window.showErrorMessage(`Workspace Downloads could not start: ${errorMessage(error)}`);
	} finally {
		exportState.inProgress = false;
	}
}

async function selectWorkspaceFolder(sourceUri?: vscode.Uri, programmatic = false): Promise<vscode.WorkspaceFolder | undefined> {
	const selection = await selectSourceFolder({
		folders: vscode.workspace.workspaceFolders ?? [],
		sourceUri,
		programmatic,
		pickFolder: async (folders) => {
			const picked = await vscode.window.showQuickPick(folders.map((folder) => ({
				label: folder.name,
				description: folder.uri.toString(),
				folder,
			})), { placeHolder: 'Select the source workspace folder' });
			return picked?.folder;
		},
	});
	if (selection.kind === 'selected') {
		return selection.folder;
	}
	if (selection.kind === 'no-workspace') {
		void vscode.window.showErrorMessage('Open a workspace folder before downloading files.');
	} else if (selection.kind === 'invalid-source') {
		void vscode.window.showErrorMessage('The supplied source URI is not an open workspace folder.');
	} else if (selection.kind === 'ambiguous-programmatic') {
		void vscode.window.showErrorMessage('A source workspace-folder URI is required for programmatic downloads in a multi-root workspace.');
	}
	return undefined;
}

async function chooseDestination(value: string): Promise<string | undefined> {
	if (value.trim().length > 0) {
		return value.trim();
	}
	const selection = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		openLabel: 'Select Download Destination',
	});
	if (!selection || selection[0].scheme !== 'file') {
		return undefined;
	}
	return selection[0].fsPath;
}

async function chooseConflict(): Promise<ConflictAction> {
	const action = await vscode.window.showWarningMessage(
		'Destination file conflicts were found. Your choice applies to all remaining conflicts in this export. Change the default in workspaceDownloads.conflictPolicy.',
		{ modal: true },
		'Replace All',
		'Skip All',
	);
	return action === 'Replace All' ? 'replace' : action === 'Skip All' ? 'skip' : 'cancel';
}

function logUnmatched(entries: readonly string[]): void {
	for (const entry of entries) {
		output.appendLine(`Unmatched: ${entry}`);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
export function deactivate() {}
