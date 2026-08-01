import type {
	ReceiverMetrics,
	RenderedTile,
	ResumableSession,
	SenderMetrics,
	TransferProtection,
	TransferProfileConfig
} from './types';

export type SenderWorkerRequest =
	| {
			type: 'prepare';
			requestId: number;
			file: ArrayBuffer;
			filename: string;
			mimeType: string;
			lastModified: number;
			protection: TransferProtection;
			profile: TransferProfileConfig;
	  }
	| { type: 'render-next'; requestId: number }
	| { type: 'dispose'; requestId: number };

export type SenderWorkerResponse =
	| { type: 'prepared'; requestId: number; metrics: SenderMetrics; sessionId: string }
	| {
			type: 'rendered';
			requestId: number;
			tiles: RenderedTile[];
			frameIndex: number;
			transmittedBytes: number;
	  }
	| { type: 'disposed'; requestId: number }
	| { type: 'error'; requestId: number; message: string };

export type ReceiverWorkerRequest =
	| {
			type: 'scan';
			requestId: number;
			data: ArrayBuffer;
			width: number;
			height: number;
			maxSymbols: number;
	  }
	| { type: 'complete'; requestId: number; passphrase?: string }
	| { type: 'list-sessions'; requestId: number }
	| { type: 'resume'; requestId: number; sessionId: string }
	| { type: 'clear'; requestId: number; sessionId: string }
	| { type: 'dispose'; requestId: number };

export type ReceiverWorkerResponse =
	| { type: 'scan-result'; requestId: number; metrics: ReceiverMetrics }
	| { type: 'reconstructed'; requestId: number; metrics: ReceiverMetrics }
	| {
			type: 'completed';
			requestId: number;
			sessionId: string;
			filename: string;
			mimeType: string;
			lastModified: number;
			manifest: string;
			bytes: ArrayBuffer;
	  }
	| { type: 'sessions'; requestId: number; sessions: ResumableSession[] }
	| { type: 'resumed'; requestId: number; metrics: ReceiverMetrics }
	| { type: 'cleared'; requestId: number; sessionId: string }
	| { type: 'disposed'; requestId: number }
	| { type: 'error'; requestId: number; message: string; metrics?: ReceiverMetrics };
