import { describe, expect, it } from 'vitest';
import { decryptTransfer, deriveEncryptionKey, prepareEncryptedTransfer } from './crypto';
import { bootstrapAssociatedData } from './protocol';
import { resolveTransferProfile } from './profiles';

describe('encrypted transfer container', () => {
	it('authenticates, decrypts, decompresses, and verifies the original bytes', async () => {
		const original = new TextEncoder().encode('Droptic optical test data. '.repeat(100));
		const prepared = await prepareEncryptedTransfer({
			bytes: original,
			filename: '../field-notes.txt',
			mimeType: 'text/plain',
			lastModified: 1_700_000_000_000,
			protection: { mode: 'passphrase', passphrase: 'correct horse battery staple' },
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
			protection: { mode: 'passphrase', passphrase: 'correct horse battery staple' },
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

	it('opens a public transfer without a passphrase', async () => {
		const original = new TextEncoder().encode('Public optical data');
		const prepared = await prepareEncryptedTransfer({
			bytes: original,
			filename: 'public.txt',
			mimeType: 'text/plain',
			lastModified: 0,
			protection: { mode: 'public' },
			profile: resolveTransferProfile('reliable')
		});

		const opened = await decryptTransfer(
			prepared.ciphertext,
			undefined,
			prepared.sessionId,
			prepared.bootstrap
		);

		expect(prepared.bootstrap.protection).toBe('public');
		expect(opened.bytes).toEqual(original);
	});

	it('does not open a protected transfer without its passphrase', async () => {
		const prepared = await prepareEncryptedTransfer({
			bytes: new Uint8Array([1, 2, 3, 4]),
			filename: 'private.bin',
			mimeType: 'application/octet-stream',
			lastModified: 0,
			protection: { mode: 'passphrase', passphrase: 'correct horse battery staple' },
			profile: resolveTransferProfile('reliable'),
			kdf: { memoryKiB: 8 * 1024, iterations: 1, parallelism: 1, hashLength: 32 }
		});

		await expect(
			decryptTransfer(prepared.ciphertext, undefined, prepared.sessionId, prepared.bootstrap)
		).rejects.toThrow(/enter the passphrase/i);
	});

	it('rejects tampering with public ciphertext or bootstrap metadata', async () => {
		const prepared = await prepareEncryptedTransfer({
			bytes: new Uint8Array([1, 2, 3, 4]),
			filename: 'public.bin',
			mimeType: 'application/octet-stream',
			lastModified: 0,
			protection: { mode: 'public' },
			profile: resolveTransferProfile('reliable')
		});
		const corrupted = prepared.ciphertext.slice();
		corrupted[0] ^= 0xff;

		await expect(
			decryptTransfer(corrupted, undefined, prepared.sessionId, prepared.bootstrap)
		).rejects.toThrow(/integrity/i);
		await expect(
			decryptTransfer(prepared.ciphertext, undefined, prepared.sessionId, {
				...prepared.bootstrap,
				fps: prepared.bootstrap.fps === 10 ? 9 : 10
			})
		).rejects.toThrow(/integrity/i);
	});

	it('bounds decompression to the authenticated manifest size', async () => {
		const passphrase = 'correct horse battery staple';
		const prepared = await prepareEncryptedTransfer({
			bytes: new TextEncoder().encode('bounded output '.repeat(1000)),
			filename: 'compressed.txt',
			mimeType: 'text/plain',
			lastModified: 0,
			protection: { mode: 'passphrase', passphrase },
			profile: resolveTransferProfile('reliable'),
			kdf: { memoryKiB: 8 * 1024, iterations: 1, parallelism: 1, hashLength: 32 }
		});
		const key = await deriveEncryptionKey(
			passphrase,
			prepared.bootstrap.salt,
			prepared.bootstrap.kdf
		);
		const plaintext = new Uint8Array(
			await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv: cryptoBytes(prepared.bootstrap.nonce),
					additionalData: cryptoBytes(
						bootstrapAssociatedData(prepared.sessionId, prepared.bootstrap)
					)
				},
				key,
				cryptoBytes(prepared.ciphertext)
			)
		);
		const manifestLength = new DataView(
			plaintext.buffer,
			plaintext.byteOffset,
			plaintext.byteLength
		).getUint32(0, true);
		const manifest = JSON.parse(
			new TextDecoder().decode(plaintext.subarray(4, 4 + manifestLength))
		);
		manifest.originalSize = 1;
		const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
		const forgedPlaintext = new Uint8Array(
			4 + manifestBytes.length + plaintext.length - 4 - manifestLength
		);
		new DataView(forgedPlaintext.buffer).setUint32(0, manifestBytes.length, true);
		forgedPlaintext.set(manifestBytes, 4);
		forgedPlaintext.set(plaintext.subarray(4 + manifestLength), 4 + manifestBytes.length);
		const bootstrap = {
			...prepared.bootstrap,
			ciphertextLength: forgedPlaintext.length + 16
		};
		const ciphertext = new Uint8Array(
			await crypto.subtle.encrypt(
				{
					name: 'AES-GCM',
					iv: cryptoBytes(bootstrap.nonce),
					additionalData: cryptoBytes(bootstrapAssociatedData(prepared.sessionId, bootstrap))
				},
				key,
				cryptoBytes(forgedPlaintext)
			)
		);

		await expect(
			decryptTransfer(ciphertext, passphrase, prepared.sessionId, bootstrap)
		).rejects.toThrow(/decompressed data exceeds/i);
	});
});

function cryptoBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
	const copy = new Uint8Array(value.byteLength);
	copy.set(value);
	return copy;
}
