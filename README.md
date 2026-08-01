# Droptic

Droptic is a static SvelteKit PWA that transfers a file from a screen to a camera without uploading it. The sender encrypts and RaptorQ-encodes the file in a worker, then displays animated monochrome QR frames. A transfer can be protected by a passphrase or public, meaning anyone who scans the signal can receive it. The receiver scans frames in a bounded worker pipeline, reconstructs the ciphertext, verifies it, and only then offers the file for sharing or saving.

## Run with Bun

```sh
bun install
bun run dev
```

Production and verification commands:

```sh
bun run check
bun run test:unit
bun run test:e2e
bun run build
```

The static production site is written to `build/`. Serve it over HTTPS; camera access, service workers, screen wake lock, and file-system APIs are restricted or unavailable on insecure origins. Copy `static/_headers` semantics into the chosen host if it does not recognize that file.

## Architecture

- Svelte 5 + SvelteKit, TypeScript, `adapter-static`; `/`, `/send`, and `/receive` are prerendered.
- No backend routes, accounts, telemetry, network transfer, or third-party scripts.
- Sender worker: optional gzip, SHA-256 manifest, optional Argon2id passphrase protection (64 MiB, 3 iterations), AES-256-GCM, RaptorQ WASM, and fast-QR WASM.
- Receiver worker: ZXing WASM, Droptic frame/CRC32C validation, RaptorQ reconstruction, AES-GCM integrity checking, decompression, and SHA-256 verification.
- Main thread: file controls, playback pacing, canvas handoff, bounded camera capture, wake locks, and accessible status UI.
- IndexedDB stores only bootstrap/data ciphertext frames, batched in groups of up to 16. Partial sessions expire after 24 hours and are removed after save/share or cancellation.
- The service worker precaches only the versioned app shell, routes, workers, and WASM. User files and reconstructed output are never put in Cache Storage.

## Droptic protocol v1

Each binary frame contains `DRPT`, protocol version, bootstrap/data kind, a random 128-bit session ID, a 32-bit sequence/encoding-symbol ID, a 16-bit payload length, payload bytes, and CRC32C. The canonical 52-byte bootstrap carries the 32-bit ciphertext length, RaptorQ symbol parameters, optical profile, compression mode, Argon2id salt/parameters, AES-GCM nonce, and a capabilities bitmap. Capability bit 0 marks a public transfer; all unknown bits are rejected along with unknown versions, kinds, unsafe sizes, KDF parameters, and profiles.

The canonical bootstrap is AES-GCM associated data, so it cannot be changed without verification failure. Filename, MIME type, original size, modification time, compression state, and SHA-256 digest remain inside the encrypted container. For protected transfers, Argon2id derives the key and the passphrase is never encoded into the optical signal. Public transfers derive the key from domain-separated public session and bootstrap material, so they require no passphrase and open automatically. Public mode does not provide confidentiality or sender authenticity against an active observer; it is publicly scannable, not uploaded or published online.

The sender inserts a bootstrap at least once per second and loops a balanced, repair-interleaved RaptorQ packet set until manually stopped. Because the currently pinned RaptorQ WASM encoder emits a finite source/repair set, playback repeats those repair symbols rather than generating unbounded new encoding-symbol IDs.

## Scope and safety

- One file up to 25 MiB; protected transfers require a 12-character minimum passphrase.
- Reliable: QR v15-L, 1 tile, 10 FPS.
- Balanced: QR v20-L, 2 tiles, 20 FPS.
- Fast: QR v30-L, 4 tiles, 30 FPS; experimental and explicitly warned.
- Low flicker: QR v15-L, 1 tile, 3 FPS.

Playback always requires acknowledging the flicker warning, and pause/stop remain adjacent to the signal. This implementation has not yet completed the physical WCAG flash measurement or the cross-device 50–150 KB/s release benchmark; do not remove the experimental label until those gates pass.

## Supply chain

`bun.lock` is the authoritative dependency lock. Runtime optical dependencies are exact-pinned in `package.json`; see [SBOM.md](./SBOM.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Before a production release, rebuild and independently audit the pinned WASM sources, record source commit hashes and toolchains, and replace registry artifacts with reproducible checked-in builds if required by the deployment threat model.
