<script lang="ts">
	import './app.css';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head>
	<title>Droptic — Send files through light</title>
	<meta
		name="description"
		content="Encrypted, offline file transfer from one screen to another camera. No accounts, radios, or uploads."
	/>
	<meta name="theme-color" content="#101b1c" />
	<meta name="color-scheme" content="light" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="icon" href="/icon-192.png" />
	<link rel="apple-touch-icon" href="/icon-192.png" />
</svelte:head>

<div class="site-shell">
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="Droptic home">
			<span class="brand-mark" aria-hidden="true"><span></span></span>
			<span>droptic</span>
		</a>
		<nav aria-label="Primary navigation">
			<a href={resolve('/send')}>Send</a>
			<a href={resolve('/receive')}>Receive</a>
		</nav>
		<span class="local-badge"><i></i> Local only</span>
	</header>

	<main>{@render children()}</main>

	<footer>
		<p>Files move as light. Nothing is uploaded.</p>
		<p>Droptic protocol v1 · Encrypted on device</p>
	</footer>
</div>
