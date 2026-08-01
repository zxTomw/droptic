# Droptic runtime SBOM

Generated from `bun.lock` for Droptic 0.0.1. Development-only tooling is fully resolved in the lockfile; this document highlights code shipped in the static browser bundle.

| Component                | Resolved version | Purpose                                          | License                                                | Source/build record                                    |
| ------------------------ | ---------------: | ------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| Svelte                   |           5.56.8 | UI runtime                                       | MIT                                                    | npm package locked by `bun.lock`                       |
| SvelteKit                |           2.70.2 | prerendered application runtime                  | MIT                                                    | npm package locked by `bun.lock`                       |
| `@raptorqr/core`         |            0.1.1 | CRC32C, profiles, RaptorQ/QR adapters            | MIT                                                    | published RaptorQR 0.1.1 source; exact application pin |
| `@raptorqr/fast-qr-wasm` |            0.1.1 | QR encoder WASM (57,422 bytes in verified build) | MIT                                                    | RaptorQR generated artifact; exact transitive pin      |
| `@raptorqr/raptorq-wasm` |            0.1.1 | RFC 6330 encoder/decoder WASM (199,567 bytes)    | MIT                                                    | RaptorQR generated artifact; exact transitive pin      |
| `zxing-wasm`             |            3.1.2 | ZXing-C++ QR reader WASM (1,065,856 bytes)       | MIT wrapper; bundled upstream notices apply            | resolved from `@raptorqr/core` by `bun.lock`           |
| `hash-wasm`              |           4.12.0 | Argon2id WASM                                    | MIT; embedded implementations carry permissive notices | exact application pin                                  |

The production build also emitted the unused ZXing writer WASM through the upstream package graph. It should be removed through a reader-only import or upstream tree-shaking improvement before a size-sensitive release.

Build verification date: 2026-08-01. Tooling: Bun 1.3.11, Vite 8.2.0, `@sveltejs/adapter-static` 3.0.10. Exact integrity data is in `bun.lock`.
