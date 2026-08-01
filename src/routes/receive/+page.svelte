<script lang="ts">
	import { onMount } from 'svelte';
	import { ReceiverSession } from '$lib/optical/receiver-session';
	import { saveReceivedFile, shareReceivedFile } from '$lib/optical/file-handoff';
	import type { ReceivedFile, ReceiverMetrics, ResumableSession } from '$lib/optical/types';

	let session: ReceiverSession | null = null;
	let unsubscribe: (() => void) | undefined;
	let video: HTMLVideoElement;
	let metrics = $state<ReceiverMetrics>({
		state: 'idle',
		acceptedPackets: 0,
		duplicatePackets: 0,
		rejectedPackets: 0,
		decodeFps: 0,
		throughputBytesPerSecond: 0,
		progress: 0
	});
	let resumable = $state<ResumableSession[]>([]);
	let received = $state<ReceivedFile | null>(null);
	let passphrase = $state('');
	let error = $state('');
	let saving = $state(false);

	const cameraActive = $derived(
		['requesting-camera', 'scanning', 'receiving', 'reconstructed', 'decrypting'].includes(
			metrics.state
		)
	);
	const reconstructed = $derived(
		metrics.state === 'reconstructed' || metrics.state === 'decrypting'
	);

	onMount(() => {
		session = new ReceiverSession();
		session.attachVideo(video);
		unsubscribe = session.subscribe((update) => {
			metrics = update.metrics;
			if (update.receivedFile) received = update.receivedFile;
			if (update.metrics.error) error = update.metrics.error;
		});
		void refreshSessions();
		return () => {
			unsubscribe?.();
			void session?.dispose();
		};
	});

	async function startCamera(): Promise<void> {
		error = '';
		try {
			await session?.startCamera();
		} catch (cause) {
			error = message(cause);
		}
	}

	async function stopCamera(): Promise<void> {
		await session?.stopCamera();
		metrics = { ...metrics, state: 'idle' };
	}

	async function unlock(): Promise<void> {
		error = '';
		try {
			received = (await session?.complete(passphrase)) ?? null;
		} catch (cause) {
			error = message(cause);
			metrics = { ...metrics, state: 'reconstructed' };
		}
	}

	async function resume(item: ResumableSession): Promise<void> {
		error = '';
		try {
			await session?.resume(item.sessionId);
			await startCamera();
		} catch (cause) {
			error = message(cause);
		}
	}

	async function forget(item: ResumableSession): Promise<void> {
		await session?.clear(item.sessionId);
		await refreshSessions();
	}

	async function refreshSessions(): Promise<void> {
		try {
			resumable = (await session?.listSessions()) ?? [];
		} catch {
			resumable = [];
		}
	}

	async function share(): Promise<void> {
		if (!received) return;
		saving = true;
		try {
			const shared = await shareReceivedFile(received);
			if (!shared) await save();
			else await session?.clear(received.sessionId);
		} catch (cause) {
			if (!(cause instanceof DOMException && cause.name === 'AbortError')) error = message(cause);
		} finally {
			saving = false;
		}
	}

	async function save(): Promise<void> {
		if (!received) return;
		saving = true;
		try {
			await saveReceivedFile(received);
			await session?.clear(received.sessionId);
		} catch (cause) {
			if (!(cause instanceof DOMException && cause.name === 'AbortError')) error = message(cause);
		} finally {
			saving = false;
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
		return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
	}

	function message(cause: unknown): string {
		return cause instanceof Error ? cause.message : String(cause);
	}
</script>

<svelte:head><title>Receive a file — Droptic</title></svelte:head>

<section class="workflow-heading">
	<div>
		<p class="eyebrow">Receiver mode</p>
		<h1 class="page-title">Catch the<br />signal.</h1>
	</div>
	<p class="lede">
		Point this device at a Droptic signal. Missed frames are fine—the file appears only after
		decryption and a byte-for-byte integrity check.
	</p>
</section>

<section class="receiver-layout">
	<div class="panel camera-panel">
		<div class="camera-stage" class:active={cameraActive}>
			<video bind:this={video} muted playsinline aria-label="Rear camera preview"></video>
			<div class="scan-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
			{#if !cameraActive}
				<div class="camera-placeholder">
					<span class="lens-icon"><i></i></span><strong>Camera is off</strong><small
						>Droptic needs camera access only while receiving.</small
					>
				</div>
			{/if}
			<div class="camera-status">
				<span
					class:active={metrics.state === 'scanning' || metrics.state === 'receiving'}
					class="status-pill">{metrics.state.replace('-', ' ')}</span
				>
			</div>
		</div>
		<div class="camera-actions">
			{#if cameraActive}<button class="btn coral" type="button" onclick={stopCamera}
					>Stop camera</button
				>{:else}<button class="btn primary" type="button" onclick={startCamera}
					>Start rear camera</button
				>{/if}
		</div>
		<p class="camera-tip">
			<strong>Alignment tip</strong> Fill the guide with the sender’s complete white QR area. Reduce the
			sender profile or move closer if the rate stays low.
		</p>
	</div>

	<div class="right-stack">
		<div class="panel receive-status">
			<div class="status-heading">
				<div>
					<p class="eyebrow">Live channel</p>
					<h2>
						{received
							? 'File verified'
							: reconstructed
								? 'Signal complete'
								: metrics.acceptedPackets
									? 'Receiving frames'
									: 'Waiting for light'}
					</h2>
				</div>
				<strong>{Math.round(metrics.progress * 100)}%</strong>
			</div>
			<div class="progress-track"><span style={`width:${metrics.progress * 100}%`}></span></div>
			<div class="metric-cards">
				<div><small>Accepted</small><strong>{metrics.acceptedPackets}</strong></div>
				<div><small>Decode rate</small><strong>{metrics.decodeFps.toFixed(1)} FPS</strong></div>
				<div>
					<small>Throughput</small><strong>{formatBytes(metrics.throughputBytesPerSecond)}/s</strong
					>
				</div>
			</div>
			{#if metrics.sessionId}<p class="session-code">
					Session <code>{metrics.sessionId.slice(0, 8)}</code> · {metrics.duplicatePackets} duplicates
					· {metrics.rejectedPackets} rejected
				</p>{/if}
			{#if reconstructed && !received}
				<div class="unlock-box">
					<div>
						<strong>Frames reconstructed.</strong>
						<p>Enter the out-of-band passphrase to authenticate and decrypt.</p>
					</div>
					<div class="field">
						<label for="receive-passphrase">Passphrase</label><input
							id="receive-passphrase"
							type="password"
							bind:value={passphrase}
							autocomplete="current-password"
						/>
					</div>
					<button
						class="btn dark"
						type="button"
						onclick={unlock}
						disabled={!passphrase || metrics.state === 'decrypting'}
						>{metrics.state === 'decrypting' ? 'Verifying…' : 'Unlock and verify'}</button
					>
				</div>
			{/if}
			{#if error}<div class="error-box" role="alert">{error}</div>{/if}
		</div>

		{#if received}
			<div class="panel file-card">
				<div class="file-icon" aria-hidden="true">
					<span>{received.file.name.split('.').pop()?.slice(0, 4) || 'FILE'}</span>
				</div>
				<div class="file-copy">
					<p class="eyebrow">Ready to save</p>
					<h2>{received.file.name}</h2>
					<p>
						{formatBytes(received.file.size)} · {received.file.type || 'application/octet-stream'} · SHA-256
						verified
					</p>
				</div>
				<div class="file-actions">
					<button class="btn primary" type="button" onclick={share} disabled={saving}>Share</button
					><button class="btn" type="button" onclick={save} disabled={saving}
						>{saving ? 'Saving…' : 'Save locally'}</button
					>
				</div>
			</div>
		{/if}

		{#if resumable.length && !received}
			<div class="panel resume-panel">
				<div>
					<p class="eyebrow">Continue later</p>
					<h2>Saved partial signals</h2>
				</div>
				{#each resumable as item (item.sessionId)}<article>
						<div>
							<strong>{item.sessionId.slice(0, 8)}</strong><small
								>{item.receivedPackets} frames · {new Date(item.updatedAt).toLocaleString()}</small
							>
						</div>
						<button type="button" onclick={() => resume(item)}>Resume</button><button
							class="forget"
							type="button"
							onclick={() => forget(item)}>Forget</button
						>
					</article>{/each}
			</div>
		{/if}
	</div>
</section>

<aside class="privacy-note">
	<span aria-hidden="true">◎</span>
	<p>
		<strong>Encrypted recovery only.</strong> Partial optical frames may be stored for 24 hours. Passphrases,
		plaintext, and completed files are never persisted.
	</p>
</aside>

<style>
	.workflow-heading {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 40px;
		padding: 72px 0 44px;
	}
	.workflow-heading .lede {
		max-width: 490px;
		margin-bottom: 8px;
	}
	.receiver-layout {
		display: grid;
		grid-template-columns: minmax(420px, 1.08fr) minmax(0, 0.92fr);
		gap: 24px;
		align-items: start;
		padding-bottom: 30px;
	}
	.camera-panel {
		padding: 18px;
		background: #122122;
	}
	.camera-stage {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 530px;
		border-radius: 17px;
		background: radial-gradient(circle, rgba(114, 148, 255, 0.13), transparent 48%), #0b1718;
		overflow: hidden;
	}
	.camera-stage video {
		position: absolute;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
	}
	.camera-stage.active video {
		opacity: 1;
	}
	.camera-placeholder {
		display: grid;
		place-items: center;
		gap: 11px;
		max-width: 280px;
		color: white;
		text-align: center;
	}
	.camera-placeholder small {
		color: rgba(255, 255, 255, 0.48);
		line-height: 1.45;
	}
	.lens-icon {
		display: grid;
		place-items: center;
		width: 76px;
		height: 60px;
		margin-bottom: 8px;
		border: 2px solid white;
		border-radius: 14px;
	}
	.lens-icon i {
		width: 34px;
		height: 34px;
		border: 7px solid var(--blue);
		border-radius: 50%;
		background: #132526;
	}
	.scan-frame {
		position: absolute;
		z-index: 2;
		width: min(75%, 410px);
		aspect-ratio: 1;
	}
	.scan-frame i {
		position: absolute;
		width: 42px;
		height: 42px;
		border-color: var(--acid);
		border-style: solid;
	}
	.scan-frame i:nth-child(1) {
		top: 0;
		left: 0;
		border-width: 3px 0 0 3px;
	}
	.scan-frame i:nth-child(2) {
		top: 0;
		right: 0;
		border-width: 3px 3px 0 0;
	}
	.scan-frame i:nth-child(3) {
		bottom: 0;
		right: 0;
		border-width: 0 3px 3px 0;
	}
	.scan-frame i:nth-child(4) {
		bottom: 0;
		left: 0;
		border-width: 0 0 3px 3px;
	}
	.camera-status {
		position: absolute;
		z-index: 3;
		top: 16px;
		left: 16px;
		color: white;
	}
	.camera-status .status-pill {
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(8px);
	}
	.camera-actions {
		display: flex;
		justify-content: center;
		margin: 17px 0 4px;
	}
	.camera-tip {
		margin: 15px 4px 4px;
		padding-top: 15px;
		border-top: 1px solid rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.55);
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.camera-tip strong {
		color: white;
	}
	.right-stack {
		display: grid;
		gap: 18px;
	}
	.receive-status,
	.file-card,
	.resume-panel {
		padding: 26px;
	}
	.status-heading {
		display: flex;
		justify-content: space-between;
		align-items: start;
		margin-bottom: 19px;
	}
	.status-heading h2,
	.resume-panel h2 {
		margin: 9px 0 0;
		font-size: 1.55rem;
		letter-spacing: -0.04em;
	}
	.status-heading > strong {
		font-size: 2.2rem;
		letter-spacing: -0.06em;
	}
	.metric-cards {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-top: 17px;
	}
	.metric-cards div {
		display: grid;
		gap: 5px;
		padding: 13px;
		border-radius: 12px;
		background: rgba(16, 32, 33, 0.05);
	}
	.metric-cards small {
		color: var(--muted);
		font-size: 0.65rem;
		text-transform: uppercase;
	}
	.metric-cards strong {
		font-size: 0.82rem;
	}
	.session-code {
		color: var(--muted);
		font-size: 0.7rem;
	}
	.unlock-box {
		display: grid;
		gap: 15px;
		margin-top: 22px;
		padding: 18px;
		border-radius: 15px;
		background: rgba(114, 148, 255, 0.12);
	}
	.unlock-box p {
		margin: 4px 0 0;
		color: var(--muted);
		font-size: 0.76rem;
		line-height: 1.4;
	}
	.unlock-box .btn {
		justify-self: start;
	}
	.file-card {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 18px;
		align-items: center;
		border-color: rgba(73, 140, 41, 0.35);
		background: linear-gradient(135deg, rgba(203, 255, 87, 0.27), rgba(255, 254, 248, 0.9));
	}
	.file-icon {
		display: grid;
		place-items: end center;
		width: 74px;
		height: 88px;
		padding: 10px 5px;
		border: 2px solid var(--ink);
		border-radius: 8px;
		background: white;
		box-shadow: 7px 7px 0 var(--acid);
	}
	.file-icon span {
		max-width: 100%;
		font-size: 0.58rem;
		font-weight: 900;
		text-transform: uppercase;
		overflow: hidden;
	}
	.file-copy {
		min-width: 0;
	}
	.file-copy h2 {
		margin: 8px 0 5px;
		font-size: 1.25rem;
		overflow-wrap: anywhere;
	}
	.file-copy > p:last-child {
		margin: 0;
		color: var(--muted);
		font-size: 0.72rem;
		line-height: 1.4;
	}
	.file-actions {
		grid-column: 1/-1;
		display: flex;
		gap: 10px;
	}
	.resume-panel {
		display: grid;
		gap: 15px;
	}
	.resume-panel article {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 9px;
		align-items: center;
		padding-top: 13px;
		border-top: 1px solid var(--line);
	}
	.resume-panel article div {
		display: grid;
		gap: 3px;
	}
	.resume-panel article small {
		color: var(--muted);
		font-size: 0.68rem;
	}
	.resume-panel article button {
		padding: 7px 10px;
		border: 1px solid var(--line);
		border-radius: 99px;
		background: white;
		font-size: 0.7rem;
		font-weight: 800;
		cursor: pointer;
	}
	.resume-panel article .forget {
		border: 0;
		background: transparent;
		color: #9e3f32;
	}
	.privacy-note {
		display: flex;
		gap: 14px;
		align-items: center;
		margin: 16px 0 70px;
		padding: 18px 22px;
		border-block: 1px solid var(--line);
		color: var(--muted);
		font-size: 0.82rem;
	}
	.privacy-note span {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--blue);
		color: var(--ink);
		font-weight: 900;
	}
	.privacy-note p {
		margin: 0;
	}
	@media (max-width: 900px) {
		.workflow-heading {
			align-items: start;
			flex-direction: column;
		}
		.receiver-layout {
			grid-template-columns: 1fr;
		}
		.camera-stage {
			min-height: min(75vh, 600px);
		}
	}
	@media (max-width: 600px) {
		.workflow-heading {
			padding-top: 45px;
		}
		.camera-panel,
		.receive-status,
		.file-card,
		.resume-panel {
			padding: 16px;
		}
		.camera-stage {
			min-height: 430px;
		}
		.receiver-layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.metric-cards {
			grid-template-columns: 1fr;
		}
		.resume-panel article {
			grid-template-columns: 1fr auto;
		}
		.resume-panel article .forget {
			grid-column: 2;
		}
		.file-card {
			grid-template-columns: 1fr;
		}
		.file-icon {
			width: 60px;
			height: 70px;
		}
	}
</style>
