/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `droptic-shell-${version}`;
const SHELL = [...build, ...files, ...prerendered];

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(SHELL))
			.then(() => worker.skipWaiting())
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith('droptic-shell-') && key !== CACHE)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => worker.clients.claim())
	);
});

worker.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.origin !== worker.location.origin) return;

	event.respondWith(
		caches.match(event.request).then(async (cached) => {
			if (cached) return cached;
			try {
				return await fetch(event.request);
			} catch {
				if (event.request.mode === 'navigate') return (await caches.match('/')) ?? Response.error();
				return Response.error();
			}
		})
	);
});
