import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ResolvedFile } from '../selection';
import { chooseConflictForPolicy, transferFiles } from '../transfer';

suite('Transfer', () => {
	let root: string;

	setup(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-downloads-'));
	});

	teardown(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	test('uses the configured replace policy without prompting', async () => {
		let prompted = false;
		const action = await chooseConflictForPolicy('replace', async () => {
			prompted = true;
			return 'cancel';
		});
		assert.strictEqual(action, 'replace');
		assert.strictEqual(prompted, false);
	});

	test('uses the configured skip policy without prompting', async () => {
		let prompted = false;
		const action = await chooseConflictForPolicy('skip', async () => {
			prompted = true;
			return 'cancel';
		});
		assert.strictEqual(action, 'skip');
		assert.strictEqual(prompted, false);
	});

	test('uses the prompt policy to select a conflict action', async () => {
		const action = await chooseConflictForPolicy('prompt', async () => 'skip');
		assert.strictEqual(action, 'skip');
	});

	test('keeps the first case-insensitive collision when skipping', async () => {
		const files = await createSources(['Readme.md', 'README.md']);
		const result = await transferFiles({
			destination: root,
			files,
			isCancellationRequested: () => false,
			chooseConflict: async () => 'skip',
			report: () => undefined,
			log: () => undefined,
		});
		assert.strictEqual(result.completed, 1);
		assert.strictEqual(result.skipped, 1);
		assert.deepStrictEqual(result.copiedFiles, [{ relativePath: 'Readme.md', outputPath: path.join(root, 'Readme.md') }]);
		assert.strictEqual(await fs.readFile(path.join(root, 'Readme.md'), 'utf8'), 'Readme.md');
	});

	test('skips an existing collision winner when skipping', async () => {
		const files = await createSources(['Readme.md', 'README.md']);
		await fs.writeFile(path.join(root, 'Readme.md'), 'existing result');
		const result = await transferFiles({
			destination: root,
			files,
			isCancellationRequested: () => false,
			chooseConflict: async () => 'skip',
			report: () => undefined,
			log: () => undefined,
		});
		assert.strictEqual(result.completed, 0);
		assert.strictEqual(result.skipped, 2);
		assert.strictEqual(await fs.readFile(path.join(root, 'Readme.md'), 'utf8'), 'existing result');
	});

	test('keeps the last case-insensitive collision when replacing', async () => {
		const files = await createSources(['Readme.md', 'README.md']);
		const result = await transferFiles({
			destination: root,
			files,
			isCancellationRequested: () => false,
			chooseConflict: async () => 'replace',
			report: () => undefined,
			log: () => undefined,
		});
		assert.strictEqual(result.completed, 2);
		assert.strictEqual(await fs.readFile(path.join(root, 'Readme.md'), 'utf8'), 'README.md');
		await assert.rejects(fs.stat(path.join(root, 'README.md')));
	});

	test('replaces an existing destination file after confirmation', async () => {
		const files = await createSources(['result.txt']);
		await fs.writeFile(path.join(root, 'result.txt'), 'old result');
		const result = await transferFiles({
			destination: root,
			files,
			isCancellationRequested: () => false,
			chooseConflict: async () => 'replace',
			report: () => undefined,
			log: () => undefined,
		});
		assert.strictEqual(result.completed, 1);
		assert.strictEqual(await fs.readFile(path.join(root, 'result.txt'), 'utf8'), 'result.txt');
	});

	test('logs the resolved destination and copied output path', async () => {
		const files = await createSources(['result.txt']);
		const logs: string[] = [];
		await transferFiles({
			destination: root,
			files,
			isCancellationRequested: () => false,
			chooseConflict: async () => 'replace',
			report: () => undefined,
			log: (message) => logs.push(message),
		});
		assert.ok(logs.some((message) => message.includes(`input=${JSON.stringify(root)}`)));
		assert.ok(logs.includes(`Copied result.txt to ${JSON.stringify(path.join(root, 'result.txt'))}`));
	});

	test('rejects an output path that traverses a symbolic link', async () => {
		const files = await createSources(['linked/result.txt']);
		const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-downloads-outside-'));
		await fs.symlink(outside, path.join(root, 'linked'));
		await assert.rejects(transferFiles({
			destination: root,
			files,
			isCancellationRequested: () => false,
			chooseConflict: async () => 'replace',
			report: () => undefined,
			log: () => undefined,
		}));
		await fs.rm(outside, { recursive: true, force: true });
	});

	test('stops before copying a file when cancelled', async () => {
		const files = await createSources(['result.txt']);
		const result = await transferFiles({
			destination: root,
			files,
			isCancellationRequested: () => true,
			chooseConflict: async () => 'replace',
			report: () => undefined,
			log: () => undefined,
		});
		assert.deepStrictEqual(result, { completed: 0, skipped: 0, failed: 0, cancelled: true, copiedFiles: [] });
		await assert.rejects(fs.stat(path.join(root, 'result.txt')));
	});

	async function createSources(relativePaths: readonly string[]): Promise<ResolvedFile[]> {
		const sourceRoot = path.join(root, 'source');
		return Promise.all(relativePaths.map(async (relativePath) => {
			const sourcePath = path.join(sourceRoot, relativePath);
			await fs.mkdir(path.dirname(sourcePath), { recursive: true });
			await fs.writeFile(sourcePath, relativePath);
			return { uri: vscode.Uri.file(sourcePath), relativePath };
		}));
	}
});