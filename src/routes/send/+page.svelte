<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SenderSession } from '$lib/optical/sender-session';
	import { TRANSFER_PROFILES } from '$lib/optical/profiles';
	import type { RenderedTile, SenderMetrics, TransferProfile } from '$lib/optical/types';
	import { MAX_FILE_SIZE, MIN_PASSPHRASE_LENGTH } from '$lib/optical/types';

	let session: SenderSession | null = null;
	let unsubscribe: (() => void) | undefined;
	let file = $state<File | null>(null);
	let passphrase = $state('');
	let confirmation = $state('');
	let profile = $state<TransferProfile>('auto');
	let metrics = $state<SenderMetrics | null>(null);
	let tiles = $state<RenderedTile[]>([]);
	let canvases: HTMLCanvasElement[] = [];
	let error = $state('');
	let warningOpen = $state(false);
	let preparing = $state(false);
	let dragging = $state(false);
	let signalPanel: HTMLElement;

	const ready = $derived(metrics?.state === 'ready' || metrics?.state === 'paused');
	const playing = $derived(metrics?.state === 'playing');
	const prepared = $derived(Boolean(metrics?.filename) && metrics?.state !== 'stopped');

	onMount(() => {
		session = new SenderSession();
		unsubscribe = session.subscribe(async (update) => {
			metrics = update.metrics;
			if (update.tiles) {
				tiles = update.tiles;
				await tick();
				drawTiles();
			}
			if (update.metrics.error) error = update.metrics.error;
		});
		return () => {
			unsubscribe?.();
			void session?.stop();
		};
	});

	function chooseFile(next: File | undefined): void {
		error = '';
		if (!next) return;
		if (next.size > MAX_FILE_SIZE) {
			file = null;
			error = 'That file is larger than the 25 MiB limit.';
			return;
		}
		file = next;
	}

	function inputChanged(event: Event): void {
		chooseFile((event.currentTarget as HTMLInputElement).files?.[0]);
	}

	function dropped(event: DragEvent): void {
		event.preventDefault();
		dragging = false;
		chooseFile(event.dataTransfer?.files[0]);
	}

	async function prepare(): Promise<void> {
		error = '';
		if (!file) return void (error = 'Choose one file to send.');
		if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
			return void (error = `Use at least ${MIN_PASSPHRASE_LENGTH} characters for the passphrase.`);
		}
		if (passphrase !== confirmation)
			return void (error = 'The passphrase confirmation does not match.');
		preparing = true;
		try {
			await session?.prepare(file, passphrase, profile);
		} catch (cause) {
			error = message(cause);
		} finally {
			preparing = false;
		}
	}

	async function confirmPlayback(): Promise<void> {
		warningOpen = false;
		error = '';
		try {
			await session?.start();
		} catch (cause) {
			error = message(cause);
		}
	}

	async function profileChanged(): Promise<void> {
		if (!prepared) return;
		tiles = [];
		preparing = true;
		try {
			await session?.restart(profile);
		} catch (cause) {
			error = message(cause);
		} finally {
			preparing = false;
		}
	}

	function drawTiles(): void {
		tiles.forEach((tile, index) => {
			const canvas = canvases[index];
			if (!canvas) return;
			canvas.width = tile.width;
			canvas.height = tile.height;
			const context = canvas.getContext('2d');
			if (!context) return;
			context.imageSmoothingEnabled = false;
			context.putImageData(
				new ImageData(new Uint8ClampedArray(tile.data), tile.width, tile.height),
				0,
				0
			);
		});
	}

	async function enterFullscreen(): Promise<void> {
		if (!document.fullscreenElement) await signalPanel.requestFullscreen();
		else await document.exitFullscreen();
	}

	function stop(): void {
		void session?.stop();
		tiles = [];
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

<svelte:head>
	<title>Send a file — Droptic</title>
</svelte:head>

<section class="workflow-heading">
	<div>
		<p class="eyebrow">Sender mode</p>
		<h1 class="page-title">Turn a file<br />into light.</h1>
	</div>
	<p class="lede">
		Everything stays on this device. Droptic compresses, encrypts, and encodes your file before the
		first frame appears.
	</p>
</section>

<section class="sender-layout">
	<div class="panel setup-panel">
		<div class="step-heading">
			<span>01</span>
			<div>
				<h2>Choose a file</h2>
				<p>One file, up to 25 MiB.</p>
			</div>
		</div>
		<label
			class:dragging
			class="drop-zone"
			ondragover={(event) => {
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={dropped}
		>
			<input type="file" onchange={inputChanged} />
			<span class="drop-icon" aria-hidden="true">↑</span>
			{#if file}
				<strong>{file.name}</strong><small>{formatBytes(file.size)} · click to replace</small>
			{:else}
				<strong>Drop a file here</strong><small>or click to browse this device</small>
			{/if}
		</label>

		<div class="section-rule"></div>
		<div class="step-heading">
			<span>02</span>
			<div>
				<h2>Lock it</h2>
				<p>This secret is never transmitted.</p>
			</div>
		</div>
		<div class="field-grid">
			<div class="field">
				<label for="passphrase">Passphrase</label>
				<input
					id="passphrase"
					type="password"
					bind:value={passphrase}
					minlength={MIN_PASSPHRASE_LENGTH}
					autocomplete="new-password"
					placeholder="At least 12 characters"
				/>
			</div>
			<div class="field">
				<label for="confirmation">Confirm passphrase</label>
				<input
					id="confirmation"
					type="password"
					bind:value={confirmation}
					autocomplete="new-password"
					placeholder="Type it again"
				/>
			</div>
		</div>

		<div class="section-rule"></div>
		<div class="step-heading">
			<span>03</span>
			<div>
				<h2>Choose a signal</h2>
				<p>Auto adapts to this display.</p>
			</div>
		</div>
		<div class="field">
			<label for="profile">Transfer profile</label>
			<select
				id="profile"
				bind:value={profile}
				onchange={profileChanged}
				disabled={preparing || playing}
			>
				<option value="auto">Auto — recommended for this screen</option>
				{#each Object.values(TRANSFER_PROFILES) as option (option.id)}
					<option value={option.id}
						>{option.label} — {option.fps} FPS, {option.tileCount}
						{option.tileCount === 1 ? 'tile' : 'tiles'}</option
					>
				{/each}
			</select>
			<small
				>Safe mode limits the signal to 3 FPS. Fast mode is opt-in and may produce visible flicker.</small
			>
		</div>

		{#if error}<div class="error-box" role="alert">{error}</div>{/if}

		<div class="setup-actions">
			<button class="btn primary" type="button" onclick={prepare} disabled={preparing || playing}>
				{preparing ? 'Preparing on device…' : prepared ? 'Prepare again' : 'Prepare signal'}
			</button>
			{#if ready}<button class="btn dark" type="button" onclick={() => (warningOpen = true)}
					>Start playback</button
				>{/if}
		</div>
	</div>

	<div class="panel signal-panel" class:playing bind:this={signalPanel}>
		<div class="signal-toolbar">
			<span class:active={playing} class="status-pill">{metrics?.state ?? 'idle'}</span>
			<button
				class="icon-button"
				type="button"
				onclick={enterFullscreen}
				aria-label="Toggle fullscreen">⛶</button
			>
		</div>
		<div class="qr-stage" class:empty={!tiles.length} data-tiles={tiles.length}>
			{#if tiles.length}
				{#each tiles as tile, index (index)}
					<canvas
						bind:this={canvases[index]}
						aria-label={`Optical tile ${index + 1}`}
						width={tile.width}
						height={tile.height}
					></canvas>
				{/each}
			{:else}
				<div class="signal-placeholder">
					<i></i><strong>Your optical signal<br />will appear here.</strong><small
						>Prepare a file to begin.</small
					>
				</div>
			{/if}
		</div>
		<div class="metrics-grid">
			<div><small>Profile</small><strong>{metrics?.profile.label ?? '—'}</strong></div>
			<div><small>Frame</small><strong>{metrics?.frameIndex ?? 0}</strong></div>
			<div><small>Signal rate</small><strong>{metrics?.profile.fps ?? 0} FPS</strong></div>
			<div>
				<small>Optical output</small><strong>{formatBytes(metrics?.transmittedBytes ?? 0)}</strong>
			</div>
		</div>
		<div class="playback-actions">
			{#if playing}
				<button class="btn" type="button" onclick={() => session?.pause()}>Pause</button>
			{:else if metrics?.state === 'paused'}
				<button class="btn primary" type="button" onclick={() => (warningOpen = true)}
					>Resume</button
				>
			{/if}
			{#if prepared}<button class="btn coral" type="button" onclick={stop}>Stop</button>{/if}
		</div>
	</div>
</section>

<aside class="privacy-note">
	<span aria-hidden="true">◎</span>
	<p>
		<strong>No upload occurs.</strong> Large buffers live in a dedicated worker and the passphrase is
		discarded when you stop.
	</p>
</aside>

{#if warningOpen}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && (warningOpen = false)}
	>
		<div
			class="warning-modal"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="warning-title"
			tabindex="-1"
		>
			<span class="warning-mark" aria-hidden="true">!</span>
			<p class="eyebrow">Before playback</p>
			<h2 id="warning-title">This signal may flicker.</h2>
			<p>
				Rapid black-and-white changes can affect people with photosensitive epilepsy. Keep pause and
				stop within reach, or select the 3 FPS Safe profile.
			</p>
			{#if metrics?.profile.experimental}<div class="error-box">
					Fast is an experimental high-speed profile and remains opt-in.
				</div>{/if}
			<div class="modal-actions">
				<button class="btn" type="button" onclick={() => (warningOpen = false)}>Go back</button
				><button class="btn dark" type="button" onclick={confirmPlayback}
					>I understand — play</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.workflow-heading {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 40px;
		padding: 72px 0 44px;
	}
	.workflow-heading .lede {
		max-width: 480px;
		margin-bottom: 8px;
	}
	.sender-layout {
		display: grid;
		grid-template-columns: minmax(0, 0.92fr) minmax(400px, 1.08fr);
		gap: 24px;
		align-items: start;
		padding-bottom: 32px;
	}
	.setup-panel,
	.signal-panel {
		padding: 28px;
	}
	.step-heading {
		display: flex;
		gap: 15px;
		align-items: start;
		margin-bottom: 18px;
	}
	.step-heading > span {
		display: grid;
		place-items: center;
		width: 31px;
		height: 31px;
		border-radius: 50%;
		background: var(--ink);
		color: white;
		font-size: 0.68rem;
		font-weight: 850;
	}
	.step-heading h2 {
		margin: 0;
		font-size: 1.08rem;
	}
	.step-heading p {
		margin: 3px 0 0;
		color: var(--muted);
		font-size: 0.76rem;
	}
	.drop-zone {
		display: grid;
		place-items: center;
		min-height: 175px;
		padding: 24px;
		border: 2px dashed rgba(16, 32, 33, 0.25);
		border-radius: 16px;
		background: rgba(203, 255, 87, 0.08);
		text-align: center;
		cursor: pointer;
		transition: 160ms;
	}
	.drop-zone.dragging,
	.drop-zone:hover {
		border-color: var(--ink);
		background: rgba(203, 255, 87, 0.2);
	}
	.drop-zone input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.drop-zone strong {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.drop-zone small {
		margin-top: 4px;
		color: var(--muted);
	}
	.drop-icon {
		display: grid;
		place-items: center;
		width: 43px;
		height: 43px;
		margin-bottom: 10px;
		border: 1.5px solid var(--ink);
		border-radius: 50%;
		background: var(--acid);
		font-size: 1.35rem;
	}
	.section-rule {
		height: 1px;
		margin: 27px 0;
		background: var(--line);
	}
	.field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.setup-actions,
	.playback-actions,
	.modal-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 11px;
		margin-top: 22px;
	}
	.setup-actions .btn:first-child {
		flex: 1;
	}
	.signal-panel {
		position: sticky;
		top: 20px;
		background: #122122;
		color: white;
	}
	.signal-panel:fullscreen {
		display: grid;
		grid-template-rows: auto 1fr auto auto;
		width: 100%;
		height: 100%;
		border-radius: 0;
	}
	.signal-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 18px;
	}
	.signal-panel .status-pill {
		background: rgba(255, 255, 255, 0.1);
	}
	.icon-button {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 50%;
		background: transparent;
		color: white;
		cursor: pointer;
	}
	.qr-stage {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
		place-content: center;
		min-height: 430px;
		padding: 12px;
		border-radius: 17px;
		background: #fff;
		overflow: hidden;
	}
	.qr-stage[data-tiles='1'] {
		grid-template-columns: minmax(0, 1fr);
	}
	.qr-stage.empty {
		background:
			radial-gradient(circle at center, rgba(203, 255, 87, 0.08), transparent 50%), #1a2b2c;
	}
	.qr-stage canvas {
		display: block;
		width: 100%;
		max-height: min(62vh, 540px);
		aspect-ratio: 1;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.signal-placeholder {
		display: grid;
		place-items: center;
		gap: 12px;
		color: rgba(255, 255, 255, 0.85);
		text-align: center;
	}
	.signal-placeholder i {
		width: 92px;
		height: 92px;
		border: 2px dashed rgba(255, 255, 255, 0.25);
		background: linear-gradient(
			45deg,
			transparent 48%,
			rgba(203, 255, 87, 0.3) 49%,
			rgba(203, 255, 87, 0.3) 51%,
			transparent 52%
		);
	}
	.signal-placeholder small {
		color: rgba(255, 255, 255, 0.45);
	}
	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1px;
		margin-top: 18px;
		background: rgba(255, 255, 255, 0.12);
	}
	.metrics-grid div {
		display: grid;
		gap: 4px;
		padding: 13px 9px;
		background: #122122;
	}
	.metrics-grid small {
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.64rem;
		text-transform: uppercase;
	}
	.metrics-grid strong {
		font-size: 0.76rem;
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
	.modal-backdrop {
		position: fixed;
		z-index: 20;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(4, 13, 14, 0.78);
		backdrop-filter: blur(8px);
	}
	.warning-modal {
		width: min(500px, 100%);
		padding: 32px;
		border-radius: 24px;
		background: var(--surface);
		box-shadow: var(--shadow);
	}
	.warning-modal h2 {
		margin: 10px 0 12px;
		font-size: 2rem;
		letter-spacing: -0.045em;
	}
	.warning-modal > p:not(.eyebrow) {
		color: var(--muted);
		line-height: 1.55;
	}
	.warning-mark {
		float: right;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		border: 2px solid var(--ink);
		border-radius: 50%;
		background: var(--coral);
		font-size: 1.5rem;
		font-weight: 900;
	}
	.modal-actions {
		justify-content: flex-end;
	}
	@media (max-width: 900px) {
		.workflow-heading {
			align-items: start;
			flex-direction: column;
		}
		.sender-layout {
			grid-template-columns: 1fr;
		}
		.signal-panel {
			position: relative;
			top: 0;
		}
	}
	@media (max-width: 600px) {
		.workflow-heading {
			padding-top: 45px;
		}
		.setup-panel,
		.signal-panel {
			padding: 18px;
		}
		.field-grid {
			grid-template-columns: 1fr;
		}
		.metrics-grid {
			grid-template-columns: 1fr 1fr;
		}
		.qr-stage {
			min-height: 320px;
		}
		.sender-layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
