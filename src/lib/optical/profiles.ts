import { createQRTransferProfile } from '@raptorqr/core/protocol/profiles';
import type { ResolvedTransferProfile, TransferProfile, TransferProfileConfig } from './types';
import { FRAME_OVERHEAD } from './protocol';

export const TRANSFER_PROFILES: Record<ResolvedTransferProfile, TransferProfileConfig> = {
	reliable: {
		id: 'reliable',
		label: 'Reliable',
		description: 'One larger code for difficult cameras and longer distances.',
		version: 15,
		eccLevel: 'L',
		tileCount: 1,
		fps: 10,
		repairPercent: 45
	},
	balanced: {
		id: 'balanced',
		label: 'Balanced',
		description: 'Two codes with a strong speed and readability tradeoff.',
		version: 20,
		eccLevel: 'L',
		tileCount: 2,
		fps: 20,
		repairPercent: 35
	},
	fast: {
		id: 'fast',
		label: 'Fast',
		description: 'Four dense codes for large, bright displays and recent cameras.',
		version: 30,
		eccLevel: 'L',
		tileCount: 4,
		fps: 30,
		repairPercent: 30,
		experimental: true
	},
	safe: {
		id: 'safe',
		label: 'Low flicker',
		description: 'One code capped at three frames per second.',
		version: 15,
		eccLevel: 'L',
		tileCount: 1,
		fps: 3,
		repairPercent: 50
	}
};

export function resolveTransferProfile(
	profile: TransferProfile,
	capabilities?: { physicalWidth: number; physicalHeight: number; hardwareConcurrency: number }
): TransferProfileConfig {
	if (profile !== 'auto') return TRANSFER_PROFILES[profile];

	const physicalWidth = capabilities?.physicalWidth ?? 0;
	const physicalHeight = capabilities?.physicalHeight ?? 0;
	const shortestSide = Math.min(physicalWidth, physicalHeight);
	const cores = capabilities?.hardwareConcurrency ?? 2;

	if (shortestSide >= 1600 && cores >= 6) return TRANSFER_PROFILES.fast;
	if (shortestSide >= 900 && cores >= 4) return TRANSFER_PROFILES.balanced;
	return TRANSFER_PROFILES.reliable;
}

export function raptorTransportSize(profile: TransferProfileConfig): number {
	const qrProfile = createQRTransferProfile(profile.version, profile.eccLevel);
	const size = qrProfile.maxPacketSize - FRAME_OVERHEAD;
	if (size <= 64) throw new Error(`QR profile ${profile.label} is too small for Droptic framing.`);
	return size;
}

export function estimateSourcePackets(ciphertextLength: number, transportSize: number): number {
	return Math.max(1, Math.ceil(ciphertextLength / Math.max(1, transportSize - 4)));
}
