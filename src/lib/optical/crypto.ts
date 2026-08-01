import { argon2id } from 'hash-wasm';
import {
	bootstrapAssociatedData,
	bytesToHex,
	sanitizeFilename,
	serializeBootstrap,
	utf8
} from './protocol';
import type {
	Argon2Parameters,
	DropticBootstrapV1,
	EncryptedManifestV1,
	PreparedTransfer,
	TransferProtection,
	TransferProfileConfig
} from './types';
import { MAX_FILE_SIZE } from './types';
import { raptorTransportSize } from './profiles';

export const DEFAULT_KDF_PARAMETERS: Argon2Parameters = {
	memoryKiB: 64 * 1024,
	iterations: 3,
	parallelism: 1,
	hashLength: 32
};

export interface PrepareEncryptedTransferInput {
	bytes: Uint8Array;
	filename: string;
	mimeType: string;
	lastModified: number;
	protection: TransferProtection;
	profile: TransferProfileConfig;
	kdf?: Argon2Parameters;
}

export async function prepareEncryptedTransfer(
	input: PrepareEncryptedTransferInput
): Promise<PreparedTransfer> {
	const sessionId = crypto.getRandomValues(new Uint8Array(16));
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', cryptoBytes(input.bytes)));
	const compressed = await maybeCompress(input.bytes, input.mimeType, input.filename);
	const manifest: EncryptedManifestV1 = {
		version: 1,
		filename: sanitizeFilename(input.filename),
		mimeType: input.mimeType || 'application/octet-stream',
		originalSize: input.bytes.length,
		lastModified: input.lastModified,
		sha256: bytesToHex(digest),
		compression: compressed.compression
	};
	const plaintext = serializeContainer(manifest, compressed.bytes);
	const kdf = input.kdf ?? DEFAULT_KDF_PARAMETERS;
	const bootstrap: DropticBootstrapV1 = {
		version: 1,
		protection: input.protection.mode,
		ciphertextLength: plaintext.length + 16,
		maxTransportPayloadSize: raptorTransportSize(input.profile),
		repairPercent: input.profile.repairPercent,
		compression: compressed.compression,
		qrVersion: input.profile.version,
		tileCount: input.profile.tileCount,
		fps: input.profile.fps,
		kdf,
		salt,
		nonce
	};
	const key =
		input.protection.mode === 'passphrase'
			? await deriveEncryptionKey(input.protection.passphrase, salt, kdf)
			: await derivePublicKey(sessionId, salt);
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv: cryptoBytes(nonce),
				additionalData: cryptoBytes(bootstrapAssociatedData(sessionId, bootstrap))
			},
			key,
			cryptoBytes(plaintext)
		)
	);

	return {
		sessionId,
		bootstrap,
		bootstrapFrame: serializeBootstrap(bootstrap),
		ciphertext,
		manifest
	};
}

export async function decryptTransfer(
	ciphertext: Uint8Array,
	passphrase: string | undefined,
	sessionId: Uint8Array,
	bootstrap: DropticBootstrapV1
): Promise<{ manifest: EncryptedManifestV1; bytes: Uint8Array }> {
	if (bootstrap.protection === 'passphrase' && !passphrase)
		throw new Error('Enter the passphrase to unlock this transfer.');
	const key =
		bootstrap.protection === 'passphrase'
			? await deriveEncryptionKey(passphrase!, bootstrap.salt, bootstrap.kdf)
			: await derivePublicKey(sessionId, bootstrap.salt);
	let plaintext: Uint8Array;
	try {
		plaintext = new Uint8Array(
			await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv: cryptoBytes(bootstrap.nonce),
					additionalData: cryptoBytes(bootstrapAssociatedData(sessionId, bootstrap))
				},
				key,
				cryptoBytes(ciphertext)
			)
		);
	} catch {
		throw new Error(
			bootstrap.protection === 'passphrase'
				? 'The passphrase is incorrect or the optical transfer was modified.'
				: 'The public transfer failed its integrity check.'
		);
	}

	const parsed = parseContainer(plaintext);
	const bytes =
		parsed.manifest.compression === 'gzip'
			? await decompress(parsed.bytes, parsed.manifest.originalSize)
			: parsed.bytes;
	if (bytes.length !== parsed.manifest.originalSize)
		throw new Error('Received file size does not match its manifest.');
	const digest = bytesToHex(
		new Uint8Array(await crypto.subtle.digest('SHA-256', cryptoBytes(bytes)))
	);
	if (digest !== parsed.manifest.sha256)
		throw new Error('Received file failed its SHA-256 integrity check.');
	return { manifest: parsed.manifest, bytes };
}

async function derivePublicKey(sessionId: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
	const domain = utf8('Droptic public transfer key v1\0');
	const material = new Uint8Array(domain.length + sessionId.length + salt.length);
	material.set(domain, 0);
	material.set(sessionId, domain.length);
	material.set(salt, domain.length + sessionId.length);
	const keyBytes = await crypto.subtle.digest('SHA-256', cryptoBytes(material));
	return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function deriveEncryptionKey(
	passphrase: string,
	salt: Uint8Array,
	parameters: Argon2Parameters
): Promise<CryptoKey> {
	const keyBytes = await argon2id({
		password: passphrase,
		salt,
		iterations: parameters.iterations,
		parallelism: parameters.parallelism,
		memorySize: parameters.memoryKiB,
		hashLength: parameters.hashLength,
		outputType: 'binary'
	});
	return crypto.subtle.importKey('raw', cryptoBytes(keyBytes), 'AES-GCM', false, [
		'encrypt',
		'decrypt'
	]);
}

function serializeContainer(manifest: EncryptedManifestV1, bytes: Uint8Array): Uint8Array {
	const manifestBytes = utf8(JSON.stringify(manifest));
	const output = new Uint8Array(4 + manifestBytes.length + bytes.length);
	new DataView(output.buffer).setUint32(0, manifestBytes.length, true);
	output.set(manifestBytes, 4);
	output.set(bytes, 4 + manifestBytes.length);
	return output;
}

function parseContainer(value: Uint8Array): { manifest: EncryptedManifestV1; bytes: Uint8Array } {
	if (value.length < 4) throw new Error('Encrypted container is incomplete.');
	const manifestLength = new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(
		0,
		true
	);
	if (manifestLength < 2 || manifestLength > value.length - 4)
		throw new Error('Encrypted manifest is invalid.');
	const decoded = new TextDecoder().decode(value.subarray(4, 4 + manifestLength));
	const manifest = JSON.parse(decoded) as EncryptedManifestV1;
	validateManifest(manifest);
	return { manifest, bytes: value.slice(4 + manifestLength) };
}

function validateManifest(value: EncryptedManifestV1): void {
	if (
		value.version !== 1 ||
		typeof value.filename !== 'string' ||
		typeof value.mimeType !== 'string' ||
		!Number.isInteger(value.originalSize) ||
		value.originalSize < 0 ||
		value.originalSize > MAX_FILE_SIZE ||
		!/^[0-9a-f]{64}$/.test(value.sha256) ||
		(value.compression !== 'none' && value.compression !== 'gzip')
	) {
		throw new Error('Encrypted manifest is unsupported or malformed.');
	}
	value.filename = sanitizeFilename(value.filename);
}

async function maybeCompress(
	bytes: Uint8Array,
	mimeType: string,
	filename: string
): Promise<{ bytes: Uint8Array; compression: 'none' | 'gzip' }> {
	if (
		bytes.length <= 64 ||
		!isLikelyCompressible(mimeType, filename) ||
		!('CompressionStream' in globalThis)
	) {
		return { bytes: bytes.slice(), compression: 'none' };
	}
	const compressed = await streamTransform(bytes, new CompressionStream('gzip'));
	return compressed.length < bytes.length * 0.95
		? { bytes: compressed, compression: 'gzip' }
		: { bytes: bytes.slice(), compression: 'none' };
}

async function decompress(bytes: Uint8Array, expectedSize: number): Promise<Uint8Array> {
	if (!('DecompressionStream' in globalThis))
		throw new Error('This browser cannot decompress the received file.');
	return streamTransform(bytes, new DecompressionStream('gzip'), expectedSize);
}

async function streamTransform(
	bytes: Uint8Array,
	transform: CompressionStream | DecompressionStream,
	maxOutputBytes?: number
): Promise<Uint8Array> {
	const source = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
	const reader = source.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.byteLength;
		if (maxOutputBytes !== undefined && length > maxOutputBytes) {
			await reader.cancel();
			throw new Error('Decompressed data exceeds the declared file size.');
		}
		chunks.push(value);
	}
	const output = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}
	return output;
}

function isLikelyCompressible(mimeType: string, filename: string): boolean {
	if (mimeType.startsWith('text/')) return true;
	if (/\b(json|xml|yaml|csv|javascript|svg)\b/i.test(mimeType)) return true;
	return /\.(txt|md|markdown|json|jsonl|csv|tsv|xml|svg|log|yaml|yml)$/i.test(filename);
}

function cryptoBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
	const copy = new Uint8Array(value.byteLength);
	copy.set(value);
	return copy;
}
