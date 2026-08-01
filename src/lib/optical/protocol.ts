import { crc32c } from '@raptorqr/core/protocol/crc32c';
import type { DropticBootstrapV1 } from './types';

export const PROTOCOL_MAGIC = new Uint8Array([0x44, 0x52, 0x50, 0x54]); // DRPT
export const PROTOCOL_VERSION = 1;
export const FRAME_HEADER_SIZE = 28;
export const FRAME_CRC_SIZE = 4;
export const FRAME_OVERHEAD = FRAME_HEADER_SIZE + FRAME_CRC_SIZE;
export const BOOTSTRAP_PAYLOAD_SIZE = 52;
export const PUBLIC_TRANSFER_CAPABILITY = 1;
const MAX_CIPHERTEXT_LENGTH = 25 * 1024 * 1024 + 64 * 1024;

export type DropticFrameKind = 'bootstrap' | 'data';

export interface DropticFrameV1 {
	version: 1;
	kind: DropticFrameKind;
	sessionId: Uint8Array;
	sequence: number;
	payload: Uint8Array;
}

const textEncoder = new TextEncoder();

export function serializeFrame(frame: DropticFrameV1): Uint8Array {
	if (frame.sessionId.length !== 16) throw new Error('Session ID must contain 16 bytes.');
	if (frame.payload.length > 0xffff) throw new Error('Frame payload exceeds 65,535 bytes.');

	const bytes = new Uint8Array(FRAME_OVERHEAD + frame.payload.length);
	bytes.set(PROTOCOL_MAGIC, 0);
	bytes[4] = PROTOCOL_VERSION;
	bytes[5] = frame.kind === 'bootstrap' ? 1 : 2;
	bytes.set(frame.sessionId, 6);
	const view = new DataView(bytes.buffer);
	view.setUint32(22, frame.sequence, true);
	view.setUint16(26, frame.payload.length, true);
	bytes.set(frame.payload, FRAME_HEADER_SIZE);
	view.setUint32(FRAME_HEADER_SIZE + frame.payload.length, crc32c(bytes.subarray(0, -4)), true);
	return bytes;
}

export function parseFrame(bytes: Uint8Array): DropticFrameV1 {
	if (bytes.length < FRAME_OVERHEAD) throw new Error('Droptic frame is too short.');
	for (let index = 0; index < PROTOCOL_MAGIC.length; index++) {
		if (bytes[index] !== PROTOCOL_MAGIC[index]) throw new Error('Unrecognized optical frame.');
	}
	if (bytes[4] !== PROTOCOL_VERSION) throw new Error(`Unsupported protocol version ${bytes[4]}.`);
	const kindByte = bytes[5];
	if (kindByte !== 1 && kindByte !== 2) throw new Error(`Unsupported frame kind ${kindByte}.`);

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const payloadLength = view.getUint16(26, true);
	if (bytes.length !== FRAME_OVERHEAD + payloadLength)
		throw new Error('Frame length does not match its header.');
	const expected = view.getUint32(FRAME_HEADER_SIZE + payloadLength, true);
	const actual = crc32c(bytes.subarray(0, FRAME_HEADER_SIZE + payloadLength));
	if (actual !== expected) throw new Error('Frame CRC32C check failed.');

	return {
		version: 1,
		kind: kindByte === 1 ? 'bootstrap' : 'data',
		sessionId: bytes.slice(6, 22),
		sequence: view.getUint32(22, true),
		payload: bytes.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + payloadLength)
	};
}

export function serializeBootstrap(value: DropticBootstrapV1): Uint8Array {
	if (value.salt.length !== 16) throw new Error('Argon2 salt must contain 16 bytes.');
	if (value.nonce.length !== 12) throw new Error('AES-GCM nonce must contain 12 bytes.');
	const bytes = new Uint8Array(BOOTSTRAP_PAYLOAD_SIZE);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, value.ciphertextLength, true);
	view.setUint16(4, value.maxTransportPayloadSize, true);
	bytes[6] = value.repairPercent;
	bytes[7] = value.compression === 'gzip' ? 1 : 0;
	bytes[8] = value.qrVersion;
	bytes[9] = value.tileCount;
	bytes[10] = value.fps;
	bytes[11] = value.kdf.iterations;
	view.setUint32(12, value.kdf.memoryKiB, true);
	bytes[16] = value.kdf.parallelism;
	bytes[17] = value.kdf.hashLength;
	bytes.set(value.salt, 20);
	bytes.set(value.nonce, 36);
	view.setUint32(48, value.protection === 'public' ? PUBLIC_TRANSFER_CAPABILITY : 0, true);
	return bytes;
}

export function parseBootstrap(bytes: Uint8Array): DropticBootstrapV1 {
	if (bytes.length !== BOOTSTRAP_PAYLOAD_SIZE) throw new Error('Invalid bootstrap payload size.');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const compressionByte = bytes[7];
	if (compressionByte !== 0 && compressionByte !== 1)
		throw new Error('Unsupported compression mode.');
	const hashLength = bytes[17];
	if (hashLength !== 32) throw new Error('Unsupported encryption key length.');
	const ciphertextLength = view.getUint32(0, true);
	const transportSize = view.getUint16(4, true);
	const repairPercent = bytes[6]!;
	const qrVersion = bytes[8]!;
	const tileCount = bytes[9]!;
	const fps = bytes[10]!;
	const iterations = bytes[11]!;
	const memoryKiB = view.getUint32(12, true);
	const parallelism = bytes[16]!;
	const capabilities = view.getUint32(48, true);
	if (ciphertextLength < 16 || ciphertextLength > MAX_CIPHERTEXT_LENGTH)
		throw new Error('Unsupported ciphertext length.');
	if (transportSize <= 64 || transportSize > 4096)
		throw new Error('Unsupported RaptorQ symbol size.');
	if (repairPercent > 100) throw new Error('Unsupported RaptorQ repair percentage.');
	if (![15, 20, 30].includes(qrVersion) || ![1, 2, 4].includes(tileCount) || fps < 1 || fps > 30)
		throw new Error('Unsupported optical profile.');
	if (iterations !== 3 || memoryKiB !== 64 * 1024 || parallelism !== 1)
		throw new Error('Unsupported Argon2id parameters.');
	if ((capabilities & ~PUBLIC_TRANSFER_CAPABILITY) !== 0)
		throw new Error('Unsupported protocol capabilities.');
	return {
		version: 1,
		protection: capabilities === PUBLIC_TRANSFER_CAPABILITY ? 'public' : 'passphrase',
		ciphertextLength,
		maxTransportPayloadSize: transportSize,
		repairPercent,
		compression: compressionByte === 1 ? 'gzip' : 'none',
		qrVersion,
		tileCount,
		fps,
		kdf: {
			iterations,
			memoryKiB,
			parallelism,
			hashLength
		},
		salt: bytes.slice(20, 36),
		nonce: bytes.slice(36, 48)
	};
}

export function bootstrapAssociatedData(
	sessionId: Uint8Array,
	bootstrap: DropticBootstrapV1
): Uint8Array {
	const payload = serializeBootstrap(bootstrap);
	const output = new Uint8Array(PROTOCOL_MAGIC.length + 1 + sessionId.length + payload.length);
	output.set(PROTOCOL_MAGIC, 0);
	output[4] = PROTOCOL_VERSION;
	output.set(sessionId, 5);
	output.set(payload, 21);
	return output;
}

export function sessionIdToString(sessionId: Uint8Array): string {
	return Array.from(sessionId, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function sessionIdFromString(value: string): Uint8Array {
	if (!/^[0-9a-f]{32}$/i.test(value)) throw new Error('Invalid session ID.');
	return new Uint8Array(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

export function sanitizeFilename(value: string): string {
	const leaf = value.split(/[\\/]/).at(-1) ?? value;
	const safeCharacters = Array.from(leaf, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 31 || codePoint === 127 || character === ':' ? '_' : character;
	}).join('');
	const sanitized = safeCharacters.replace(/_+/g, '_').replace(/^\.+/, '').trim().slice(0, 180);
	return sanitized || 'received-file';
}

export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function utf8(value: string): Uint8Array {
	return textEncoder.encode(value);
}
