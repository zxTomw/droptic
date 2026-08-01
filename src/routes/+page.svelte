<script lang="ts">
	import { resolve } from '$app/paths';

	const capabilities = [
		['01', 'Encrypted', 'AES-GCM before the first frame'],
		['02', 'Offline', 'No Wi-Fi, Bluetooth, or account'],
		['03', 'Resilient', 'RaptorQ rebuilds missed frames']
	];
	const gridCells = Array.from({ length: 49 }, (_, index) => index);
</script>

<svelte:head>
	<title>Droptic — Send files through light</title>
</svelte:head>

<section class="hero">
	<div class="hero-copy">
		<p class="eyebrow">Optical file transfer</p>
		<h1 class="display-title">Send files<br />through <em>light.</em></h1>
		<p class="lede">
			One screen. One camera. Your file crosses the air as an encrypted stream of light—without an
			upload, pairing ritual, or radio connection.
		</p>
		<div class="hero-actions">
			<a class="btn primary" href={resolve('/send')}
				>Send a file <span aria-hidden="true">↗</span></a
			>
			<a class="btn" href={resolve('/receive')}>Open receiver <span aria-hidden="true">⌁</span></a>
		</div>
	</div>

	<div class="signal-demo" aria-label="Illustration of a file moving between a screen and camera">
		<div class="device sender-device">
			<div class="device-top"><span></span><span></span></div>
			<div class="optical-grid" aria-hidden="true">
				{#each gridCells as index (index)}
					<i class:filled={index % 3 === 0 || index % 7 === 1 || index === 34}></i>
				{/each}
			</div>
			<strong>document.zip</strong>
			<small>8.4 MB · encrypted</small>
		</div>
		<div class="beam" aria-hidden="true">
			<span></span><span></span><span></span>
		</div>
		<div class="device receiver-device">
			<div class="lens"><span></span></div>
			<strong>Receiving</strong>
			<div class="mini-progress"><i></i></div>
			<small>Light → bytes</small>
		</div>
		<p class="demo-caption"><b>84 KB/s</b><span>live optical channel</span></p>
	</div>
</section>

<section class="capability-strip" aria-label="Droptic capabilities">
	{#each capabilities as item (item[0])}
		<article>
			<span>{item[0]}</span>
			<div><strong>{item[1]}</strong><small>{item[2]}</small></div>
		</article>
	{/each}
</section>

<section class="choice-section">
	<div>
		<p class="eyebrow">Choose a mode</p>
		<h2>Ready when<br />the network isn’t.</h2>
	</div>
	<div class="choice-grid">
		<a href={resolve('/send')} class="choice-card send-card">
			<span class="choice-number">A</span>
			<div class="choice-icon upload-icon" aria-hidden="true">↑</div>
			<h3>Sender</h3>
			<p>Choose a file, lock it with a passphrase, and turn your screen into the transmitter.</p>
			<strong>Start sending <span>→</span></strong>
		</a>
		<a href={resolve('/receive')} class="choice-card receive-card">
			<span class="choice-number">B</span>
			<div class="choice-icon camera-icon" aria-hidden="true"><i></i></div>
			<h3>Receiver</h3>
			<p>
				Point your camera at the signal. Droptic rebuilds and verifies every byte before saving.
			</p>
			<strong>Start receiving <span>→</span></strong>
		</a>
	</div>
</section>

<style>
	.hero {
		display: grid;
		grid-template-columns: 1.08fr 0.92fr;
		align-items: center;
		gap: 50px;
		min-height: 690px;
		padding: 72px 0 64px;
	}

	.hero-copy em {
		color: transparent;
		font-style: normal;
		-webkit-text-stroke: 2px var(--ink);
	}

	.hero-copy .lede {
		max-width: 560px;
		margin-top: 32px;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 34px;
	}

	.signal-demo {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 62px 0.78fr;
		align-items: center;
		min-height: 470px;
		padding: 35px 28px 70px;
		border: 1px solid var(--line);
		border-radius: 28px;
		background: #142526;
		box-shadow: 20px 24px 0 rgba(114, 148, 255, 0.3);
		color: white;
		overflow: hidden;
	}

	.signal-demo::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
		background-size: 20px 20px;
	}

	.device {
		position: relative;
		z-index: 1;
		display: grid;
		justify-items: center;
		padding: 16px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 20px;
		background: #f8f7f0;
		color: var(--ink);
		box-shadow: 0 14px 40px rgba(0, 0, 0, 0.3);
	}

	.sender-device {
		transform: rotate(-4deg);
	}

	.receiver-device {
		padding-block: 30px;
		transform: rotate(5deg);
	}

	.device-top {
		display: flex;
		gap: 4px;
		justify-self: start;
		margin-bottom: 12px;
	}

	.device-top span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--coral);
	}

	.optical-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
		width: min(100%, 170px);
		aspect-ratio: 1;
		padding: 9px;
		border: 6px solid white;
		background: white;
	}

	.optical-grid i {
		background: #e5e5df;
	}

	.optical-grid i.filled {
		background: var(--ink);
	}

	.device strong {
		margin-top: 14px;
		font-size: 0.8rem;
	}

	.device small {
		margin-top: 3px;
		color: var(--muted);
		font-size: 0.61rem;
	}

	.beam {
		position: relative;
		z-index: 2;
		display: grid;
		gap: 10px;
	}

	.beam span {
		display: block;
		height: 2px;
		background: var(--acid);
		box-shadow: 0 0 10px var(--acid);
		animation: beam 1.2s ease-in-out infinite alternate;
	}

	.beam span:nth-child(2) {
		width: 72%;
		animation-delay: 150ms;
	}
	.beam span:nth-child(3) {
		width: 42%;
		animation-delay: 300ms;
	}

	.lens {
		display: grid;
		place-items: center;
		width: 66px;
		height: 66px;
		border: 2px solid var(--ink);
		border-radius: 50%;
		box-shadow: 0 0 0 7px var(--blue);
	}

	.lens span {
		width: 23px;
		height: 23px;
		border-radius: 50%;
		background: var(--ink);
		box-shadow: inset 5px 5px 0 #52666a;
	}

	.mini-progress {
		width: 80%;
		height: 5px;
		margin-top: 12px;
		border-radius: 9px;
		background: #dfe1d9;
	}

	.mini-progress i {
		display: block;
		width: 68%;
		height: 100%;
		border-radius: inherit;
		background: var(--coral);
	}

	.demo-caption {
		position: absolute;
		z-index: 2;
		bottom: 22px;
		left: 28px;
		display: flex;
		gap: 12px;
		align-items: baseline;
		margin: 0;
	}

	.demo-caption b {
		color: var(--acid);
		font-size: 1.2rem;
	}
	.demo-caption span {
		color: rgba(255, 255, 255, 0.55);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
	}

	.capability-strip {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border-block: 1px solid var(--line);
	}

	.capability-strip article {
		display: flex;
		gap: 18px;
		padding: 27px;
		border-right: 1px solid var(--line);
	}

	.capability-strip article:last-child {
		border-right: 0;
	}
	.capability-strip article > span {
		color: var(--coral);
		font-size: 0.68rem;
		font-weight: 850;
	}
	.capability-strip div {
		display: grid;
		gap: 4px;
	}
	.capability-strip strong {
		font-size: 0.9rem;
	}
	.capability-strip small {
		color: var(--muted);
		font-size: 0.72rem;
	}

	.choice-section {
		display: grid;
		grid-template-columns: 0.7fr 1.3fr;
		gap: 60px;
		padding: 115px 0;
	}

	.choice-section h2 {
		margin: 18px 0 0;
		font-size: clamp(2.4rem, 5vw, 4.5rem);
		line-height: 0.94;
		letter-spacing: -0.065em;
	}

	.choice-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
	}

	.choice-card {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 390px;
		padding: 28px;
		border: 1.5px solid var(--ink);
		border-radius: 22px;
		color: var(--ink);
		text-decoration: none;
		transition:
			transform 180ms ease,
			box-shadow 180ms ease;
	}

	.choice-card:hover {
		transform: translateY(-6px);
		box-shadow: 10px 12px 0 var(--ink);
	}
	.send-card {
		background: var(--acid);
	}
	.receive-card {
		background: var(--blue);
	}
	.choice-number {
		align-self: flex-end;
		font-size: 0.68rem;
		font-weight: 900;
	}
	.choice-icon {
		display: grid;
		place-items: center;
		width: 62px;
		height: 62px;
		margin-top: 18px;
		border: 2px solid var(--ink);
		border-radius: 50%;
		font-size: 2rem;
	}
	.camera-icon {
		border-radius: 17px;
	}
	.camera-icon i {
		width: 22px;
		height: 22px;
		border: 3px solid var(--ink);
		border-radius: 50%;
	}
	.choice-card h3 {
		margin: 28px 0 10px;
		font-size: 2rem;
		letter-spacing: -0.05em;
	}
	.choice-card p {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.55;
	}
	.choice-card > strong {
		margin-top: auto;
		padding-top: 28px;
		font-size: 0.8rem;
	}
	.choice-card > strong span {
		float: right;
		font-size: 1.2rem;
	}

	@keyframes beam {
		from {
			opacity: 0.25;
			transform: translateX(-8px);
		}
		to {
			opacity: 1;
			transform: translateX(8px);
		}
	}

	@media (max-width: 900px) {
		.hero {
			grid-template-columns: 1fr;
			min-height: auto;
		}
		.signal-demo {
			min-height: 430px;
		}
		.choice-section {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 620px) {
		.hero {
			padding-top: 50px;
		}
		.signal-demo {
			grid-template-columns: 1fr 42px 0.8fr;
			padding-inline: 14px;
			min-height: 380px;
			box-shadow: 8px 10px 0 rgba(114, 148, 255, 0.3);
		}
		.device {
			padding: 10px;
		}
		.optical-grid {
			padding: 5px;
			border-width: 3px;
		}
		.capability-strip {
			grid-template-columns: 1fr;
		}
		.capability-strip article {
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
		.capability-strip article:last-child {
			border-bottom: 0;
		}
		.choice-section {
			padding: 80px 0;
		}
		.choice-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.beam span {
			animation: none;
		}
	}
</style>
