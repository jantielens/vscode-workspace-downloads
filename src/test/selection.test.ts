import * as assert from 'assert';
import { parseAdHocEntries, parseConfiguredEntries, validateEntries } from '../selection';

suite('Selection', () => {
	test('normalizes, discards blanks, and deduplicates entries without changing case', () => {
		assert.deepStrictEqual(parseAdHocEntries(' Reports//Result.json ; ; ./logs/*.txt;Reports/Result.json '), [
			{ value: 'Reports/Result.json', pattern: false },
			{ value: 'logs/*.txt', pattern: true },
		]);
		assert.deepStrictEqual(parseConfiguredEntries('one.txt\n\nTwo.txt\n'), [
			{ value: 'one.txt', pattern: false },
			{ value: 'Two.txt', pattern: false },
		]);
	});

	test('rejects absolute paths, traversal, separators, and directories', () => {
		const entries = parseAdHocEntries('/absolute.txt;folder/../file.txt;folder\\file.txt;folder/;.');
		assert.deepStrictEqual(validateEntries(entries), [
			'/absolute.txt',
			'folder/../file.txt',
			'folder\\file.txt',
			'folder/',
			'.',
		]);
	});
});