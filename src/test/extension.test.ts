import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { formatDownloadResult } from '../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('explains that copied files retain source-relative folders', () => {
		const message = formatDownloadResult({
			completed: 2,
			skipped: 0,
			failed: 0,
			cancelled: false,
			copiedFiles: [
				{ relativePath: 'build/a.txt', outputPath: 'C:\\temp\\build\\a.txt' },
				{ relativePath: 'logs/b.txt', outputPath: 'C:\\temp\\logs\\b.txt' },
			],
		});
		assert.strictEqual(message, 'Workspace Downloads: 2 copied, 0 skipped, 0 failed. Source-relative folders were preserved below the selected destination.');
	});
});
