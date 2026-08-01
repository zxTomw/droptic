import { acquireScreenWakeLock, releaseScreenWakeLock } from './wake-lock';
import type { ReceivedFile, ReceiverMetrics, ResumableSession } from './types';
import type { ReceiverWorkerRequest, ReceiverWorkerResponse } from './worker-messages';

export interface ReceiverUpdate {
	metrics: ReceiverMetrics;
	receivedFile?: ReceivedFile;
}

type Listener = (update: ReceiverUpdate) => void;
type ReceiverRequestWithoutId = ReceiverWorkerRequest extends infer Request
	? Request extends ReceiverWorkerRequest
		? Omit<Request, 'requestId'>
		: never
	: never;

export class ReceiverSession {
	private worker: Worker | null = null;
	private listeners = new Set<Listener>();
	private pending = new Map<number, (message: ReceiverWorkerResponse) => void>();
	private requestId = 0;
	private stream: MediaStream | null = null;
	private video: HTMLVideoElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private scanBusy = false;
	private scanning = false;
	private callbackHandle: number | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private metrics: ReceiverMetrics = emptyMetrics('idle');

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		listener({ metrics: this.metrics });
		return () => this.listeners.delete(listener);
	}

	attachVideo(video: HTMLVideoElement): void {
		this.video = video;
	}

	async startCamera(): Promise<void> {
		if (!this.video) throw new Error('Attach the camera preview before starting the receiver.');
		this.metrics = { ...emptyMetrics('requesting-camera') };
		this.emit();
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 1920 },
					height: { ideal: 1080 },
					frameRate: { ideal: 30, max: 60 }
				}
			});
			this.video.srcObject = this.stream;
			this.video.playsInline = true;
			await this.video.play();
			this.canvas = document.createElement('canvas');
			this.scanning = true;
			this.metrics = { ...this.metrics, state: 'scanning' };
			this.emit();
			await acquireScreenWakeLock();
			this.scheduleScan();
		} catch (error) {
			this.metrics = { ...this.metrics, state: 'error', error: cameraError(error) };
			this.emit();
			throw error;
		}
	}

	async stopCamera(): Promise<void> {
		this.scanning = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (this.callbackHandle !== null && this.video) {
			this.video.cancelVideoFrameCallback(this.callbackHandle);
		}
		this.callbackHandle = null;
		for (const track of this.stream?.getTracks() ?? []) track.stop();
		this.stream = null;
		if (this.video) this.video.srcObject = null;
		await releaseScreenWakeLock();
	}

	async complete(passphrase: string): Promise<ReceivedFile> {
		this.metrics = { ...this.metrics, state: 'decrypting', error: undefined };
		this.emit();
		const response = await this.request({ type: 'complete', passphrase });
		if (response.type !== 'completed')
			throw new Error('The receiver returned an unexpected response.');
		const manifest = JSON.parse(response.manifest);
		const file = new File([response.bytes], response.filename, {
			type: response.mimeType || 'application/octet-stream',
			lastModified: response.lastModified
		});
		const receivedFile = { file, manifest, sessionId: response.sessionId } as ReceivedFile;
		this.metrics = { ...this.metrics, state: 'complete', progress: 1 };
		this.emit(receivedFile);
		return receivedFile;
	}

	async listSessions(): Promise<ResumableSession[]> {
		const response = await this.request({ type: 'list-sessions' });
		if (response.type !== 'sessions') throw new Error('Could not read partial transfers.');
		return response.sessions;
	}

	async resume(sessionId: string): Promise<void> {
		const response = await this.request({ type: 'resume', sessionId });
		if (response.type !== 'resumed') throw new Error('Could not resume the transfer.');
		this.metrics = response.metrics;
		this.emit();
	}

	async clear(sessionId: string): Promise<void> {
		await this.request({ type: 'clear', sessionId });
	}

	async dispose(): Promise<void> {
		await this.stopCamera();
		if (this.worker) {
			try {
				await this.request({ type: 'dispose' });
			} catch {
				// Worker termination below is authoritative.
			}
			this.worker.terminate();
		}
		this.worker = null;
		this.pending.clear();
	}

	private scheduleScan(): void {
		if (!this.scanning || !this.video) return;
		if (this.video.requestVideoFrameCallback) {
			this.callbackHandle = this.video.requestVideoFrameCallback(() => {
				void this.captureFrame();
				this.scheduleScan();
			});
		} else {
			this.timer = setTimeout(() => {
				void this.captureFrame();
				this.scheduleScan();
			}, 33);
		}
	}

	private async captureFrame(): Promise<void> {
		if (!this.scanning || this.scanBusy || !this.video || !this.canvas) return;
		if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
		const videoWidth = this.video.videoWidth;
		const videoHeight = this.video.videoHeight;
		if (!videoWidth || !videoHeight) return;
		const scale = Math.min(1, 1280 / Math.max(videoWidth, videoHeight));
		const width = Math.max(1, Math.round(videoWidth * scale));
		const height = Math.max(1, Math.round(videoHeight * scale));
		this.canvas.width = width;
		this.canvas.height = height;
		const context = this.canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return;
		context.drawImage(this.video, 0, 0, width, height);
		const image = context.getImageData(0, 0, width, height);
		const data = image.data.buffer;
		this.scanBusy = true;
		try {
			const response = await this.request({ type: 'scan', data, width, height, maxSymbols: 4 }, [
				data
			]);
			if (response.type === 'scan-result' || response.type === 'reconstructed') {
				this.metrics = response.metrics;
				this.emit();
			}
		} catch (error) {
			this.metrics = { ...this.metrics, state: 'error', error: message(error) };
			this.emit();
		} finally {
			this.scanBusy = false;
		}
	}

	private request(
		request: ReceiverRequestWithoutId,
		transfer: Transferable[] = []
	): Promise<ReceiverWorkerResponse> {
		const worker = this.ensureWorker();
		const requestId = ++this.requestId;
		return new Promise((resolve, reject) => {
			this.pending.set(requestId, (response) => {
				if (response.type === 'error') reject(new Error(response.message));
				else resolve(response);
			});
			worker.postMessage({ ...request, requestId } as ReceiverWorkerRequest, transfer);
		});
	}

	private ensureWorker(): Worker {
		if (this.worker) return this.worker;
		this.worker = new Worker(new URL('./workers/receiver.worker.ts', import.meta.url), {
			type: 'module'
		});
		this.worker.onmessage = (event: MessageEvent<ReceiverWorkerResponse>) => {
			const callback = this.pending.get(event.data.requestId);
			if (!callback) return;
			this.pending.delete(event.data.requestId);
			callback(event.data);
		};
		this.worker.onerror = (event) => {
			this.metrics = {
				...this.metrics,
				state: 'error',
				error: event.message || 'Receiver worker failed.'
			};
			this.emit();
		};
		return this.worker;
	}

	private emit(receivedFile?: ReceivedFile): void {
		const update = { metrics: this.metrics, receivedFile };
		for (const listener of this.listeners) listener(update);
	}
}

function emptyMetrics(state: ReceiverMetrics['state']): ReceiverMetrics {
	return {
		state,
		acceptedPackets: 0,
		duplicatePackets: 0,
		rejectedPackets: 0,
		decodeFps: 0,
		throughputBytesPerSecond: 0,
		progress: 0
	};
}

function cameraError(error: unknown): string {
	if (error instanceof DOMException) {
		if (error.name === 'NotAllowedError')
			return 'Camera access was denied. Allow it in browser settings and try again.';
		if (error.name === 'NotFoundError') return 'No camera is available on this device.';
		if (error.name === 'NotReadableError') return 'The camera is already in use by another app.';
	}
	return message(error);
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
