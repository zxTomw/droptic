import { describe, expect, it } from 'vitest';
import {
	BOOTSTRAP_PAYLOAD_SIZE,
	bytesToHex,
	parseBootstrap,
	parseFrame,
	sanitizeFilename,
	serializeBootstrap,
	serializeFrame,
	sessionIdFromString,
	sessionIdToString
} from './protocol';
import { estimateSourcePackets, resolveTransferProfile } from './profiles';
import type { DropticBootstrapV1 } from './types';

const sessionId = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 255]);

describe('DropticFrameV1', () => {
	it('round-trips an explicitly serialized data frame', () => {
		const bytes = serializeFrame({
			version: 1,
			kind: 'data',
			sessionId,
			sequence: 0xdeadbeef,
			payload: new Uint8Array([4, 8, 15, 16, 23, 42])
		});
		const parsed = parseFrame(bytes);

		expect(parsed.kind).toBe('data');
		expect(parsed.sequence).toBe(0xdeadbeef);
		expect(parsed.sessionId).toEqual(sessionId);
		expect(parsed.payload).toEqual(new Uint8Array([4, 8, 15, 16, 23, 42]));
	});

	it('rejects a corrupted frame before decoding', () => {
		const bytes = serializeFrame({
			version: 1,
			kind: 'data',
			sessionId,
			sequence: 7,
			payload: new Uint8Array([1, 2, 3])
		});
		bytes[29] ^= 0xff;
		expect(() => parseFrame(bytes)).toThrow(/CRC32C/);
	});
});

describe('DropticBootstrapV1', () => {
	it('round-trips 32-bit file sizes and cryptographic parameters', () => {
		const value: DropticBootstrapV1 = {
			version: 1,
			protection: 'passphrase',
			ciphertextLength: 25 * 1024 * 1024 + 419,
			maxTransportPayloadSize: 910,
			repairPercent: 35,
			compression: 'gzip',
			qrVersion: 20,
			tileCount: 2,
			fps: 20,
			kdf: { memoryKiB: 65536, iterations: 3, parallelism: 1, hashLength: 32 },
			salt: new Uint8Array(16).fill(7),
			nonce: new Uint8Array(12).fill(9)
		};
		const encoded = serializeBootstrap(value);
		expect(encoded).toHaveLength(BOOTSTRAP_PAYLOAD_SIZE);
		expect(parseBootstrap(encoded)).toEqual(value);
	});

	it.each([
		['passphrase', '00000000'],
		['public', '01000000']
	] as const)('preserves the canonical %s bootstrap vector', (protection, capabilityHex) => {
		const encoded = serializeBootstrap({
			version: 1,
			protection,
			ciphertextLength: 0x01020304,
			maxTransportPayloadSize: 902,
			repairPercent: 35,
			compression: 'gzip',
			qrVersion: 20,
			tileCount: 2,
			fps: 20,
			kdf: { memoryKiB: 65536, iterations: 3, parallelism: 1, hashLength: 32 },
			salt: new Uint8Array(16).fill(7),
			nonce: new Uint8Array(12).fill(9)
		});
		expect(bytesToHex(encoded)).toBe(
			'0403020186032301140214030000010001200000' +
				'07070707070707070707070707070707' +
				'090909090909090909090909' +
				capabilityHex
		);
		expect(parseBootstrap(encoded).protection).toBe(protection);
	});

	it('rejects truncated, unsafe, and unknown bootstrap values', () => {
		const encoded = serializeBootstrap({
			version: 1,
			protection: 'public',
			ciphertextLength: 1024,
			maxTransportPayloadSize: 902,
			repairPercent: 35,
			compression: 'none',
			qrVersion: 15,
			tileCount: 1,
			fps: 10,
			kdf: { memoryKiB: 65536, iterations: 3, parallelism: 1, hashLength: 32 },
			salt: new Uint8Array(16),
			nonce: new Uint8Array(12)
		});
		expect(() => parseBootstrap(encoded.slice(0, -1))).toThrow(/payload size/i);
		const unsafeKdf = encoded.slice();
		unsafeKdf[11] = 2;
		expect(() => parseBootstrap(unsafeKdf)).toThrow(/Argon2id parameters/i);
		const unknownCapability = encoded.slice();
		unknownCapability[48] = 2;
		expect(() => parseBootstrap(unknownCapability)).toThrow(/capabilities/i);
	});
});

describe('protocol helpers', () => {
	it('sanitizes path-like and control-heavy filenames', () => {
		expect(sanitizeFilename('../../secret\u0000/notes.txt')).toBe('notes.txt');
		expect(sanitizeFilename('...')).toBe('received-file');
	});

	it('round-trips session identifiers', () => {
		expect(sessionIdFromString(sessionIdToString(sessionId))).toEqual(sessionId);
	});

	it('selects profiles from physical display constraints', () => {
		expect(
			resolveTransferProfile('auto', {
				physicalWidth: 1920,
				physicalHeight: 1800,
				hardwareConcurrency: 8
			}).id
		).toBe('fast');
		expect(
			resolveTransferProfile('auto', {
				physicalWidth: 1200,
				physicalHeight: 900,
				hardwareConcurrency: 4
			}).id
		).toBe('balanced');
		expect(
			resolveTransferProfile('auto', {
				physicalWidth: 800,
				physicalHeight: 600,
				hardwareConcurrency: 2
			}).id
		).toBe('reliable');
		expect(estimateSourcePackets(1800, 904)).toBe(2);
	});
});
