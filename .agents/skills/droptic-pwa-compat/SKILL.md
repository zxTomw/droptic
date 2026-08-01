---
name: droptic-pwa-compat
description: Check Droptic Svelte routes, camera capture, Web Workers, service worker, CSP, WebCrypto, wake lock, and file handoff for browser and PWA compatibility. Use for browser-facing changes, especially iOS Safari or WebKit failures, hydration issues, permission handling, offline behavior, or static-host configuration.
---

# Droptic PWA Compatibility

## Inspect platform boundaries

- Keep browser globals inside `onMount`, client-only modules, event handlers, or workers so prerendering remains safe.
- Detect secure-context and API availability before calling WebCrypto, camera, wake lock, share, or file-system APIs. Return actionable HTTPS/permission/compatibility errors instead of raw `undefined` failures.
- Prefer rear-camera constraints but retain fallback constraints. Bound decoder work and drop frames when workers are busy.
- Transfer frame buffers to workers rather than copying them, and release cameras, wake locks, workers, object URLs, and callbacks on stop or navigation.
- Cache only the versioned application shell. Never cache selected, reconstructed, or decrypted files.

## Preserve CSP and offline behavior

Let SvelteKit generate hash-based CSP for prerendered hydration. Keep Cloudflare's static CSP limited to response-only directives such as `frame-ancestors`; do not add `unsafe-inline` scripts. Preserve same-origin worker/WASM allowances and test a production build, not only Vite development mode.

## Verify

Run `bun run verify:fast` and `bun run verify:browser`. Ensure Chromium and WebKit cover hydration, sender worker output, and offline launch. Record any camera, save/share, rolling-shutter, flicker, or physical iOS behavior that still requires real-device validation.
