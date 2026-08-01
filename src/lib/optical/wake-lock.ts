let sentinel: WakeLockSentinel | null = null;

export async function acquireScreenWakeLock(): Promise<boolean> {
	if (!('wakeLock' in navigator)) return false;
	try {
		sentinel = await navigator.wakeLock.request('screen');
		return true;
	} catch {
		return false;
	}
}

export async function releaseScreenWakeLock(): Promise<void> {
	try {
		await sentinel?.release();
	} finally {
		sentinel = null;
	}
}
