import { describe, expect, it } from 'vitest';
import { decryptTransfer, prepareEncryptedTransfer } from './crypto';
import { resolveTransferProfile } from './profiles';

describe('encrypted transfer container', () => {
	it('authenticates, decrypts, decompresses, and verifies the original bytes', async () => {
		const original = new TextEncoder().encode('Droptic optical test data. '.repeat(100));
		const prepared = await prepareEncryptedTransfer({
			bytes: original,
			filename: '../field-notes.txt',
			mimeType: 'text/plain',
			lastModified: 1_700_000_000_000,
			passphrase: 'correct horse battery staple',
			profile: resolveTransferProfile('reliable'),
			kdf: { memoryKiB: 8 * 1024, iterations: 1, parallelism: 1, hashLength: 32 }
		});

		const decrypted = await decryptTransfer(
			prepared.ciphertext,
			'correct horse battery staple',
			prepared.sessionId,
			prepared.bootstrap
		);

		expect(decrypted.bytes).toEqual(original);
		expect(decrypted.manifest.filename).toBe('field-notes.txt');
		expect(decrypted.manifest.compression).toBe('gzip');
	});

	it('does not expose output with the wrong passphrase', async () => {
		const prepared = await prepareEncryptedTransfer({
			bytes: new Uint8Array([1, 2, 3, 4]),
			filename: 'data.bin',
			mimeType: 'application/octet-stream',
			lastModified: 0,
			passphrase: 'correct horse battery staple',
			profile: resolveTransferProfile('reliable'),
			kdf: { memoryKiB: 8 * 1024, iterations: 1, parallelism: 1, hashLength: 32 }
		});

		await expect(
			decryptTransfer(
				prepared.ciphertext,
				'incorrect passphrase',
				prepared.sessionId,
				prepared.bootstrap
			)
		).rejects.toThrow(/incorrect|modified/);
	});
});
