import { resolveTransferProfile } from './profiles';
import { acquireScreenWakeLock, releaseScreenWakeLock } from './wake-lock';
import type { RenderedTile, SenderMetrics, TransferProfile, TransferProtection } from './types';
import { MAX_FILE_SIZE, MIN_PASSPHRASE_LENGTH } from './types';
import type { SenderWorkerRequest, SenderWorkerResponse } from './worker-messages';

export interface SenderUpdate {
	metrics: SenderMetrics;
	tiles?: RenderedTile[];
	sessionId?: string;
}

type Listener = (update: SenderUpdate) => void;
type SenderRequestWithoutId = SenderWorkerRequest extends infer Request
	? Request extends SenderWorkerRequest
		? Omit<Request, 'requestId'>
		: never
	: never;

export class SenderSession {
	private worker: Worker | null = null;
	private listeners = new Set<Listener>();
	private pending = new Map<number, (message: SenderWorkerResponse) => void>();
	private requestId = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private playing = false;
	private rendering = false;
	private file: File | null = null;
	private protection: TransferProtection | null = null;
	private selectedProfile: TransferProfile = 'auto';
	private metrics: SenderMetrics = {
		state: 'idle',
		profile: resolveTransferProfile('reliable'),
		protection: 'passphrase',
		transmittedBytes: 0,
		packetCount: 0,
		sourcePacketCount: 0,
		frameIndex: 0,
		fps: 0,
		estimatedSeconds: 0
	};

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		listener({ metrics: this.metrics });
		return () => this.listeners.delete(listener);
	}

	async prepare(
		file: File,
		protection: TransferProtection,
		profile: TransferProfile
	): Promise<void> {
		if (file.size > MAX_FILE_SIZE) throw new Error('Droptic supports files up to 25 MiB.');
		if (protection.mode === 'passphrase' && protection.passphrase.length < MIN_PASSPHRASE_LENGTH) {
			throw new Error(`Use a passphrase with at least ${MIN_PASSPHRASE_LENGTH} characters.`);
		}
		this.pause();
		this.file = file;
		this.protection = protection;
		this.selectedProfile = profile;
		const resolved = resolveTransferProfile(profile, browserCapabilities());
		this.metrics = {
			...this.metrics,
			state: 'preparing',
			profile: resolved,
			protection: protection.mode,
			error: undefined
		};
		this.emit();
		const bytes = await file.arrayBuffer();
		const response = await this.request(
			{
				type: 'prepare',
				file: bytes,
				filename: file.name,
				mimeType: file.type,
				lastModified: file.lastModified,
				protection,
				profile: resolved
			},
			[bytes]
		);
		if (response.type !== 'prepared')
			throw new Error('The sender worker returned an unexpected response.');
		this.metrics = response.metrics;
		this.emit(undefined, response.sessionId);
	}

	async start(): Promise<void> {
		if (this.metrics.state !== 'ready' && this.metrics.state !== 'paused') {
			throw new Error('Prepare a file before starting the optical signal.');
		}
		this.playing = true;
		this.metrics = { ...this.metrics, state: 'playing' };
		this.emit();
		await acquireScreenWakeLock();
		this.schedule(0);
	}

	pause(): void {
		this.playing = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (this.metrics.state === 'playing') {
			this.metrics = { ...this.metrics, state: 'paused' };
			this.emit();
		}
		void releaseScreenWakeLock();
	}

	async restart(profile: TransferProfile): Promise<void> {
		if (!this.file || !this.protection)
			throw new Error('There is no prepared transfer to restart.');
		await this.prepare(this.file, this.protection, profile);
	}

	async stop(): Promise<void> {
		this.pause();
		if (this.worker) {
			try {
				await this.request({ type: 'dispose' });
			} catch {
				// Termination below is authoritative.
			}
			this.worker.terminate();
		}
		this.worker = null;
		this.pending.clear();
		this.file = null;
		this.protection = null;
		this.metrics = { ...this.metrics, state: 'stopped' };
		this.emit();
		await releaseScreenWakeLock();
	}

	private schedule(delay: number): void {
		if (!this.playing) return;
		this.timer = setTimeout(() => void this.renderFrame(), delay);
	}

	private async renderFrame(): Promise<void> {
		if (!this.playing || this.rendering) return;
		this.rendering = true;
		const started = performance.now();
		try {
			const response = await this.request({ type: 'render-next' });
			if (response.type !== 'rendered')
				throw new Error('The QR renderer returned an unexpected response.');
			this.metrics = {
				...this.metrics,
				state: 'playing',
				frameIndex: response.frameIndex,
				transmittedBytes: response.transmittedBytes
			};
			this.emit(response.tiles);
		} catch (error) {
			this.playing = false;
			this.metrics = { ...this.metrics, state: 'error', error: message(error) };
			this.emit();
		} finally {
			this.rendering = false;
		}
		const frameDuration = 1000 / Math.max(1, this.metrics.profile.fps);
		this.schedule(Math.max(0, frameDuration - (performance.now() - started)));
	}

	private request(
		request: SenderRequestWithoutId,
		transfer: Transferable[] = []
	): Promise<SenderWorkerResponse> {
		const worker = this.ensureWorker();
		const requestId = ++this.requestId;
		return new Promise((resolve, reject) => {
			this.pending.set(requestId, (response) => {
				if (response.type === 'error') reject(new Error(response.message));
				else resolve(response);
			});
			worker.postMessage({ ...request, requestId } as SenderWorkerRequest, transfer);
		});
	}

	private ensureWorker(): Worker {
		if (this.worker) return this.worker;
		this.worker = new Worker(new URL('./workers/sender.worker.ts', import.meta.url), {
			type: 'module'
		});
		this.worker.onmessage = (event: MessageEvent<SenderWorkerResponse>) => {
			const callback = this.pending.get(event.data.requestId);
			if (!callback) return;
			this.pending.delete(event.data.requestId);
			callback(event.data);
		};
		this.worker.onerror = (event) => {
			this.metrics = {
				...this.metrics,
				state: 'error',
				error: event.message || 'Sender worker failed.'
			};
			this.emit();
		};
		return this.worker;
	}

	private emit(tiles?: RenderedTile[], sessionId?: string): void {
		const update = { metrics: this.metrics, tiles, sessionId };
		for (const listener of this.listeners) listener(update);
	}
}

function browserCapabilities() {
	const ratio = window.devicePixelRatio || 1;
	return {
		physicalWidth: window.innerWidth * ratio,
		physicalHeight: window.innerHeight * ratio,
		hardwareConcurrency: navigator.hardwareConcurrency || 2
	};
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
