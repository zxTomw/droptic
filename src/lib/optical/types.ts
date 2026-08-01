export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MIN_PASSPHRASE_LENGTH = 12;

export type ProtectionMode = 'passphrase' | 'public';
export type TransferProtection = { mode: 'passphrase'; passphrase: string } | { mode: 'public' };

export type TransferProfile = 'auto' | 'reliable' | 'balanced' | 'fast' | 'safe';
export type ResolvedTransferProfile = Exclude<TransferProfile, 'auto'>;

export interface TransferProfileConfig {
	id: ResolvedTransferProfile;
	label: string;
	description: string;
	version: 15 | 20 | 30;
	eccLevel: 'L';
	tileCount: 1 | 2 | 4;
	fps: number;
	repairPercent: number;
	experimental?: boolean;
}

export interface EncryptedManifestV1 {
	version: 1;
	filename: string;
	mimeType: string;
	originalSize: number;
	lastModified: number;
	sha256: string;
	compression: 'none' | 'gzip';
}

export interface Argon2Parameters {
	memoryKiB: number;
	iterations: number;
	parallelism: number;
	hashLength: number;
}

export interface DropticBootstrapV1 {
	version: 1;
	protection: ProtectionMode;
	ciphertextLength: number;
	maxTransportPayloadSize: number;
	repairPercent: number;
	compression: 'none' | 'gzip';
	qrVersion: number;
	tileCount: number;
	fps: number;
	kdf: Argon2Parameters;
	salt: Uint8Array;
	nonce: Uint8Array;
}

export interface PreparedTransfer {
	sessionId: Uint8Array;
	bootstrap: DropticBootstrapV1;
	bootstrapFrame: Uint8Array;
	ciphertext: Uint8Array;
	manifest: EncryptedManifestV1;
}

export interface SenderMetrics {
	state: 'idle' | 'preparing' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';
	profile: TransferProfileConfig;
	protection: ProtectionMode;
	filename?: string;
	originalSize?: number;
	transmittedBytes: number;
	packetCount: number;
	sourcePacketCount: number;
	frameIndex: number;
	fps: number;
	estimatedSeconds: number;
	error?: string;
}

export interface RenderedTile {
	width: number;
	height: number;
	data: ArrayBuffer;
}

export interface ReceiverMetrics {
	state:
		| 'idle'
		| 'requesting-camera'
		| 'scanning'
		| 'receiving'
		| 'reconstructed'
		| 'decrypting'
		| 'complete'
		| 'error';
	sessionId?: string;
	acceptedPackets: number;
	duplicatePackets: number;
	rejectedPackets: number;
	decodeFps: number;
	throughputBytesPerSecond: number;
	progress: number;
	ciphertextLength?: number;
	protection?: ProtectionMode;
	error?: string;
}

export interface ReceivedFile {
	file: File;
	manifest: EncryptedManifestV1;
	sessionId: string;
}

export interface ResumableSession {
	sessionId: string;
	updatedAt: number;
	receivedPackets: number;
	estimatedPackets: number;
}
