/// <reference lib="webworker" />

import { renderQRCodeImageData } from '@raptorqr/core/qr/qr_encoder_browser';
import { encodeRaptorQPackets } from '@raptorqr/core/fec/raptorq_wasm';
import { classifyRaptorQPackets } from '@raptorqr/core/sender/raptorq_packetizer';
import { createRaptorQPlaybackOrders } from '@raptorqr/core/sender/raptorq_playback';
import { prepareEncryptedTransfer } from '../crypto';
import { serializeBootstrap, serializeFrame, sessionIdToString } from '../protocol';
import { estimateSourcePackets } from '../profiles';
import type { SenderMetrics, TransferProfileConfig } from '../types';
import type { SenderWorkerRequest, SenderWorkerResponse } from '../worker-messages';

const scope = self as unknown as DedicatedWorkerGlobalScope;

interface WorkerState {
	profile: TransferProfileConfig;
	sessionId: Uint8Array;
	bootstrapFrame: Uint8Array;
	frames: Uint8Array[];
	order: number[];
	cursor: number;
	frameIndex: number;
	transmittedBytes: number;
	metrics: SenderMetrics;
}

let state: WorkerState | null = null;

scope.onmessage = async (event: MessageEvent<SenderWorkerRequest>) => {
	const request = event.data;
	try {
		switch (request.type) {
			case 'prepare':
				await prepare(request);
				break;
			case 'render-next':
				await renderNext(request.requestId);
				break;
			case 'dispose':
				state = null;
				post({ type: 'disposed', requestId: request.requestId });
		}
	} catch (error) {
		post({ type: 'error', requestId: request.requestId, message: errorMessage(error) });
	}
};

async function prepare(request: Extract<SenderWorkerRequest, { type: 'prepare' }>): Promise<void> {
	const originalBytes = new Uint8Array(request.file);
	const prepared = await prepareEncryptedTransfer({
		bytes: originalBytes,
		filename: request.filename,
		mimeType: request.mimeType,
		lastModified: request.lastModified,
		passphrase: request.passphrase,
		profile: request.profile
	});
	const encoded = await encodeRaptorQPackets(
		prepared.ciphertext,
		prepared.bootstrap.maxTransportPayloadSize,
		prepared.bootstrap.repairPercent
	);
	const classification = classifyRaptorQPackets(
		encoded,
		prepared.ciphertext.length,
		prepared.bootstrap.maxTransportPayloadSize
	);
	const orders = createRaptorQPlaybackOrders(
		classification.sourcePacketIndices,
		classification.repairPacketIndices,
		'balanced'
	);
	const frames = encoded.map((payload, sequence) =>
		serializeFrame({
			version: 1,
			kind: 'data',
			sessionId: prepared.sessionId,
			sequence,
			payload
		})
	);
	const bootstrapFrame = serializeFrame({
		version: 1,
		kind: 'bootstrap',
		sessionId: prepared.sessionId,
		sequence: 0,
		payload: serializeBootstrap(prepared.bootstrap)
	});
	const sourcePacketCount = estimateSourcePackets(
		prepared.ciphertext.length,
		prepared.bootstrap.maxTransportPayloadSize
	);
	const effectivePacketsPerSecond = Math.max(
		1,
		request.profile.tileCount * request.profile.fps - 1
	);
	const metrics: SenderMetrics = {
		state: 'ready',
		profile: request.profile,
		filename: prepared.manifest.filename,
		originalSize: prepared.manifest.originalSize,
		transmittedBytes: 0,
		packetCount: frames.length,
		sourcePacketCount,
		frameIndex: 0,
		fps: request.profile.fps,
		estimatedSeconds: Math.ceil(sourcePacketCount / effectivePacketsPerSecond)
	};
	state = {
		profile: request.profile,
		sessionId: prepared.sessionId,
		bootstrapFrame,
		frames,
		order: orders.loopOrder,
		cursor: 0,
		frameIndex: 0,
		transmittedBytes: 0,
		metrics
	};
	post({
		type: 'prepared',
		requestId: request.requestId,
		metrics,
		sessionId: sessionIdToString(prepared.sessionId)
	});
}

async function renderNext(requestId: number): Promise<void> {
	if (!state) throw new Error('Prepare a file before requesting optical frames.');
	const frameBytes: Uint8Array[] = [];
	const bootstrapDue = state.frameIndex % Math.max(1, state.profile.fps) === 0;
	if (bootstrapDue) frameBytes.push(state.bootstrapFrame);

	while (frameBytes.length < state.profile.tileCount) {
		const packetIndex = state.order[state.cursor % state.order.length];
		if (packetIndex === undefined) throw new Error('RaptorQ packet schedule is empty.');
		const frame = state.frames[packetIndex];
		if (!frame) throw new Error('RaptorQ packet schedule referenced a missing frame.');
		frameBytes.push(frame);
		state.cursor++;
		state.transmittedBytes += frame.length;
	}

	const images = await Promise.all(
		frameBytes.map((frame) =>
			renderQRCodeImageData(
				frame,
				state!.profile.version,
				state!.profile.eccLevel,
				4,
				'fast-qr-wasm'
			)
		)
	);
	state.frameIndex++;
	const tiles = images.map((image) => ({
		width: image.width,
		height: image.height,
		data: image.data.buffer
	}));
	post(
		{
			type: 'rendered',
			requestId,
			tiles,
			frameIndex: state.frameIndex,
			transmittedBytes: state.transmittedBytes
		},
		tiles.map((tile) => tile.data)
	);
}

function post(message: SenderWorkerResponse, transfer: Transferable[] = []): void {
	scope.postMessage(message, transfer);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export {};
