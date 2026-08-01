import { readFileSync } from 'node:fs';
import { initSync } from '@raptorqr/raptorq-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { encodeRaptorQPackets, RaptorQWasmDecoder } from '@raptorqr/core/fec/raptorq_wasm';
import { classifyRaptorQPackets } from '@raptorqr/core/sender/raptorq_packetizer';
import { parseFrame, serializeFrame } from './protocol';

beforeAll(() => {
	const bytes = readFileSync(
		new URL(
			'../../../node_modules/@raptorqr/raptorq-wasm/src/wasm/raptorqr_raptorq_wasm_bg.wasm',
			import.meta.url
		)
	);
	initSync({ module: bytes });
});

describe('RaptorQ optical recovery', () => {
	it('recovers from missing, shuffled, and duplicated source symbols', async () => {
		const original = Uint8Array.from({ length: 24_000 }, (_, index) => (index * 31) & 0xff);
		const transportSize = 500;
		const packets = await encodeRaptorQPackets(original, transportSize, 50);
		const classified = classifyRaptorQPackets(packets, original.length, transportSize);
		const omitted = new Set(classified.sourcePacketIndices.filter((_, index) => index % 7 === 0));
		const selected = packets
			.map((packet, index) => ({ packet, index }))
			.filter(({ index }) => !omitted.has(index))
			.reverse();
		selected.splice(4, 0, selected[3]!);

		const decoder = await RaptorQWasmDecoder.create(original.length, transportSize);
		const sessionId = new Uint8Array(16).fill(5);
		let decoded: Uint8Array | null = null;
		const seen = new Set<number>();
		for (const { packet, index } of selected) {
			const frameBytes = serializeFrame({
				version: 1,
				kind: 'data',
				sessionId,
				sequence: index,
				payload: packet
			});
			const frame = parseFrame(frameBytes);
			if (seen.has(frame.sequence)) continue;
			seen.add(frame.sequence);
			decoded = decoder.push(frame.payload) ?? decoded;
			if (decoded) break;
		}

		expect(decoded?.slice(0, original.length)).toEqual(original);
	});

	it('rejects a corrupted symbol at the optical framing boundary', async () => {
		const packet = (await encodeRaptorQPackets(new Uint8Array(100), 100, 10))[0]!;
		const frame = serializeFrame({
			version: 1,
			kind: 'data',
			sessionId: new Uint8Array(16),
			sequence: 0,
			payload: packet
		});
		frame[35] ^= 0x80;
		expect(() => parseFrame(frame)).toThrow(/CRC32C/);
	});
});
