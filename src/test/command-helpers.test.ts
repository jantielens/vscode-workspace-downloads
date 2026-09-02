import * as assert from 'assert';
import * as vscode from 'vscode';
import { reserveExport, selectSourceFolder, stateKey, taskDownloadFor, workspaceSetting } from '../command-helpers';

suite('Command helpers', () => {
	const firstFolder = folder('first');
	const secondFolder = folder('second');

	test('requires an exact source URI for programmatic multi-root downloads', async () => {
		const ambiguous = await selectSourceFolder({
			folders: [firstFolder, secondFolder],
			programmatic: true,
			pickFolder: async () => assert.fail('The picker must not run for programmatic invocation'),
		});
		assert.deepStrictEqual(ambiguous, { kind: 'ambiguous-programmatic' });

		const selected = await selectSourceFolder({
			folders: [firstFolder, secondFolder],
			sourceUri: secondFolder.uri,
			programmatic: true,
			pickFolder: async () => assert.fail('The picker must not run when a URI is supplied'),
		});
		assert.deepStrictEqual(selected, { kind: 'selected', folder: secondFolder });
	});

	test('prompts for an interactive multi-root source and preserves cancellation', async () => {
		let receivedFolders: readonly vscode.WorkspaceFolder[] = [];
		const selected = await selectSourceFolder({
			folders: [firstFolder, secondFolder],
			programmatic: false,
			pickFolder: async (folders) => {
				receivedFolders = folders;
				return secondFolder;
			},
		});
		assert.deepStrictEqual(receivedFolders, [firstFolder, secondFolder]);
		assert.deepStrictEqual(selected, { kind: 'selected', folder: secondFolder });
	});

	test('uses only folder and workspace configuration values', () => {
		assert.strictEqual(workspaceSetting({ defaultValue: 'default', globalValue: 'user' }), undefined);
		assert.strictEqual(workspaceSetting({ workspaceValue: 'workspace', globalValue: 'user' }), 'workspace');
		assert.strictEqual(workspaceSetting({ workspaceFolderValue: 'folder', workspaceValue: 'workspace' }), 'folder');
	});

	test('finds the download definition for an exact task label', () => {
		const downloads = [
			{ task: 'Build firmware', files: 'build/firmware.bin', destination: '/artifacts', conflictPolicy: 'replace' },
			{ task: 'Export diagnostics', files: 'reports/*.json', destination: '/reports', conflictPolicy: 'skip' },
		];
		assert.deepStrictEqual(taskDownloadFor(downloads, 'Export diagnostics'), downloads[1]);
		assert.strictEqual(taskDownloadFor(downloads, 'Build'), undefined);
	});

	test('ignores invalid task download definitions', () => {
		assert.strictEqual(taskDownloadFor({ task: 'Build firmware' }, 'Build firmware'), undefined);
		assert.strictEqual(taskDownloadFor([
			{ task: 'Build firmware', files: 'build/firmware.bin', destination: '', conflictPolicy: 'replace' },
		], 'Build firmware'), undefined);
	});

	test('reserves an export before asynchronous work begins', () => {
		const state = { inProgress: false };
		assert.strictEqual(reserveExport(state), true);
		assert.strictEqual(reserveExport(state), false);
		assert.strictEqual(state.inProgress, true);
	});

	test('scopes remembered ad hoc values by source workspace URI', () => {
		assert.notStrictEqual(stateKey(firstFolder, 'files'), stateKey(secondFolder, 'files'));
		assert.strictEqual(stateKey(firstFolder, 'destination'), 'adHoc.file:///first.destination');
	});

	function folder(name: string): vscode.WorkspaceFolder {
		return { uri: vscode.Uri.file(`/${name}`), name, index: name === 'first' ? 0 : 1 };
	}
});