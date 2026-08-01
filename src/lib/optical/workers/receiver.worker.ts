/// <reference lib="webworker" />

import { RaptorQWasmDecoder } from '@raptorqr/core/fec/raptorq_wasm';
import { decodeQRCodesFromCanvas } from '@raptorqr/core/qr/qr_decode';
import { decryptTransfer } from '../crypto';
import {
	parseBootstrap,
	parseFrame,
	sessionIdFromString,
	sessionIdToString,
	type DropticFrameV1
} from '../protocol';
import { estimateSourcePackets } from '../profiles';
import {
	clearPersistedSession,
	flushPersistedFrames,
	listResumableSessions,
	loadPersistedSession,
	persistReceivedFrame,
	persistSession
} from '../persistence';
import type { DropticBootstrapV1, ReceiverMetrics } from '../types';
import type { ReceiverWorkerRequest, ReceiverWorkerResponse } from '../worker-messages';

const scope = self as unknown as DedicatedWorkerGlobalScope;

interface ReceiverState {
	sessionId: Uint8Array;
	sessionIdString: string;
	bootstrap: DropticBootstrapV1;
	bootstrapFrame: Uint8Array;
	decoder: RaptorQWasmDecoder;
	accepted: Set<number>;
	duplicates: number;
	rejected: number;
	ciphertext: Uint8Array | null;
	startedAt: number;
	acceptedBytes: number;
}

let state: ReceiverState | null = null;
const pending = new Map<string, Array<{ frame: DropticFrameV1; bytes: Uint8Array }>>();

scope.onmessage = async (event: MessageEvent<ReceiverWorkerRequest>) => {
	const request = event.data;
	try {
		switch (request.type) {
			case 'scan':
				await scan(request);
				break;
			case 'complete':
				await complete(request.requestId, request.passphrase);
				break;
			case 'list-sessions':
				post({
					type: 'sessions',
					requestId: request.requestId,
					sessions: await listResumableSessions()
				});
				break;
			case 'resume':
				await resume(request.requestId, request.sessionId);
				break;
			case 'clear':
				await clearPersistedSession(request.sessionId);
				if (state?.sessionIdString === request.sessionId) state = null;
				post({ type: 'cleared', requestId: request.requestId, sessionId: request.sessionId });
				break;
			case 'dispose':
				await flushPersistedFrames();
				state = null;
				pending.clear();
				post({ type: 'disposed', requestId: request.requestId });
		}
	} catch (error) {
		post({
			type: 'error',
			requestId: request.requestId,
			message: errorMessage(error),
			metrics: state ? metrics('error', errorMessage(error)) : undefined
		});
	}
};

async function scan(request: Extract<ReceiverWorkerRequest, { type: 'scan' }>): Promise<void> {
	const pixels = new Uint8ClampedArray(request.data);
	const image = new ImageData(pixels, request.width, request.height);
	const results = await decodeQRCodesFromCanvas(image, {
		maxSymbols: request.maxSymbols,
		tryHarder: false,
		tryRotate: true,
		tryInvert: false,
		tryDownscale: true
	});

	for (const result of results) {
		try {
			const frame = parseFrame(result.bytes);
			await acceptFrame(frame, result.bytes);
		} catch {
			if (state) state.rejected++;
		}
	}

	const current = state
		? metrics(state.ciphertext ? 'reconstructed' : 'receiving')
		: emptyMetrics();
	post({
		type: state?.ciphertext ? 'reconstructed' : 'scan-result',
		requestId: request.requestId,
		metrics: current
	});
}

async function acceptFrame(frame: DropticFrameV1, rawBytes: Uint8Array): Promise<void> {
	const sessionIdString = sessionIdToString(frame.sessionId);
	if (frame.kind === 'bootstrap') {
		if (state && state.sessionIdString !== sessionIdString) return;
		if (!state) {
			const bootstrap = parseBootstrap(frame.payload);
			const decoder = await RaptorQWasmDecoder.create(
				bootstrap.ciphertextLength,
				bootstrap.maxTransportPayloadSize
			);
			state = {
				sessionId: frame.sessionId,
				sessionIdString,
				bootstrap,
				bootstrapFrame: rawBytes.slice(),
				decoder,
				accepted: new Set(),
				duplicates: 0,
				rejected: 0,
				ciphertext: null,
				startedAt: performance.now(),
				acceptedBytes: 0
			};
			await persistSession(sessionRecord(), rawBytes);
			const waiting = pending.get(sessionIdString) ?? [];
			pending.delete(sessionIdString);
			for (const item of waiting) await acceptDataFrame(item.frame, item.bytes);
		}
		return;
	}

	if (!state) {
		const waiting = pending.get(sessionIdString) ?? [];
		if (waiting.length < 128) waiting.push({ frame, bytes: rawBytes.slice() });
		pending.set(sessionIdString, waiting);
		return;
	}
	if (state.sessionIdString !== sessionIdString || state.ciphertext) return;
	await acceptDataFrame(frame, rawBytes);
}

async function acceptDataFrame(frame: DropticFrameV1, rawBytes: Uint8Array): Promise<void> {
	if (!state) return;
	if (state.accepted.has(frame.sequence)) {
		state.duplicates++;
		return;
	}
	const decoded = state.decoder.push(frame.payload);
	state.accepted.add(frame.sequence);
	state.acceptedBytes += frame.payload.length;
	persistReceivedFrame(state.sessionIdString, frame.sequence, rawBytes);
	if (state.accepted.size % 16 === 0 || decoded)
		await persistSession(sessionRecord(), state.bootstrapFrame);
	if (decoded) {
		state.ciphertext = decoded.slice(0, state.bootstrap.ciphertextLength);
		await flushPersistedFrames();
	}
}

async function complete(requestId: number, passphrase: string): Promise<void> {
	if (!state?.ciphertext)
		throw new Error('Keep scanning until the encrypted file is fully reconstructed.');
	const decrypted = await decryptTransfer(
		state.ciphertext,
		passphrase,
		state.sessionId,
		state.bootstrap
	);
	const bytes = decrypted.bytes.slice().buffer;
	post(
		{
			type: 'completed',
			requestId,
			sessionId: state.sessionIdString,
			filename: decrypted.manifest.filename,
			mimeType: decrypted.manifest.mimeType,
			lastModified: decrypted.manifest.lastModified,
			manifest: JSON.stringify(decrypted.manifest),
			bytes
		},
		[bytes]
	);
}

async function resume(requestId: number, sessionId: string): Promise<void> {
	const persisted = await loadPersistedSession(sessionId);
	if (!persisted) throw new Error('That partial transfer is no longer available.');
	const bootstrapFrame = parseFrame(new Uint8Array(persisted.session.bootstrapFrame));
	const bootstrap = parseBootstrap(bootstrapFrame.payload);
	const decoder = await RaptorQWasmDecoder.create(
		bootstrap.ciphertextLength,
		bootstrap.maxTransportPayloadSize
	);
	state = {
		sessionId: sessionIdFromString(sessionId),
		sessionIdString: sessionId,
		bootstrap,
		bootstrapFrame: new Uint8Array(persisted.session.bootstrapFrame),
		decoder,
		accepted: new Set(),
		duplicates: 0,
		rejected: 0,
		ciphertext: null,
		startedAt: performance.now(),
		acceptedBytes: 0
	};
	for (const rawFrame of persisted.frames) {
		const frame = parseFrame(rawFrame);
		if (frame.kind !== 'data' || state.accepted.has(frame.sequence)) continue;
		const decoded = state.decoder.push(frame.payload);
		state.accepted.add(frame.sequence);
		state.acceptedBytes += frame.payload.length;
		if (decoded) {
			state.ciphertext = decoded.slice(0, bootstrap.ciphertextLength);
			break;
		}
	}
	post({
		type: 'resumed',
		requestId,
		metrics: metrics(state.ciphertext ? 'reconstructed' : 'receiving')
	});
}

function sessionRecord() {
	if (!state) throw new Error('No receiver session is active.');
	return {
		sessionId: state.sessionIdString,
		updatedAt: Date.now(),
		receivedPackets: state.accepted.size,
		estimatedPackets: estimateSourcePackets(
			state.bootstrap.ciphertextLength,
			state.bootstrap.maxTransportPayloadSize
		)
	};
}

function metrics(status: ReceiverMetrics['state'], error?: string): ReceiverMetrics {
	if (!state) return emptyMetrics();
	const elapsedSeconds = Math.max(0.001, (performance.now() - state.startedAt) / 1000);
	const expected = estimateSourcePackets(
		state.bootstrap.ciphertextLength,
		state.bootstrap.maxTransportPayloadSize
	);
	return {
		state: status,
		sessionId: state.sessionIdString,
		acceptedPackets: state.accepted.size,
		duplicatePackets: state.duplicates,
		rejectedPackets: state.rejected,
		decodeFps: state.accepted.size / elapsedSeconds,
		throughputBytesPerSecond: state.acceptedBytes / elapsedSeconds,
		progress: state.ciphertext ? 1 : Math.min(0.99, state.accepted.size / expected),
		ciphertextLength: state.bootstrap.ciphertextLength,
		error
	};
}

function emptyMetrics(): ReceiverMetrics {
	return {
		state: 'scanning',
		acceptedPackets: 0,
		duplicatePackets: 0,
		rejectedPackets: 0,
		decodeFps: 0,
		throughputBytesPerSecond: 0,
		progress: 0
	};
}

function post(message: ReceiverWorkerResponse, transfer: Transferable[] = []): void {
	scope.postMessage(message, transfer);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export {};
