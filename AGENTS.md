# Repository Guidelines

## Project Structure & Module Organization

Droptic is a static SvelteKit PWA. Route UI lives in `src/routes/`: `/`, `/send`, and `/receive`. Transport-independent code belongs in `src/lib/optical/`; keep protocol, crypto, persistence, worker messages, and session orchestration separate from Svelte components. `src/service-worker.ts` caches the application shell only. Public PWA assets and Cloudflare headers live in `static/`. Unit tests are colocated as `*.spec.ts`; browser tests live in `tests/*.e2e.ts`. Production output is generated in `build/` and must not be edited.

## Build, Test, and Development Commands

Use Bun and preserve `bun.lock`.

- `bun install` installs exact locked dependencies.
- `bun run dev` starts the Vite development server.
- `bun run check` runs SvelteKit synchronization and type diagnostics.
- `bun run lint` checks Prettier formatting and ESLint rules.
- `bun run test:unit` runs Vitest unit tests.
- `bun run test:e2e` builds the app, starts the preview server, and runs Playwright.
- `bun run build` creates the static production site in `build/`.
- `bun run quality:classify --base <sha> --head <sha>` selects tiered gates.
- `bun run verify:fast`, `verify:browser`, and `verify:deploy` run the standardized gates.

Run `bun run check`, `bun run lint`, and relevant tests before submitting changes.

## Agent Quality Workflow

Before changing code or configuration, use `.agents/skills/droptic-change-scope` to classify the diff. Apply `droptic-optical-safety` when optical code changes and `droptic-pwa-compat` for routes, browser APIs, workers, CSP, or offline behavior. Run the selected `verify:*` commands, then assign `droptic-peer-review` to a separate agent for optical, security, dependency, storage, or browser-platform work. The implementing agent must not self-approve. Use `release-droptic` before releases; it verifies evidence but never deploys.

## Coding Style & Naming Conventions

Use TypeScript and Svelte 5 runes. Prettier enforces tabs, single quotes, no trailing commas, a 100-column width, and Svelte formatting. Use `camelCase` for variables/functions, `PascalCase` for classes and exported types, and kebab-case for route or asset names. Keep large byte buffers in workers or session objects, not reactive Svelte state. Access camera, WebCrypto, IndexedDB, wake locks, and other browser globals only in client-side code or workers.

## Testing Guidelines

Use Vitest for protocol and optical-core behavior and Playwright for complete browser flows. Name tests `feature.spec.ts` or `feature.e2e.ts`. Cover rejection paths as well as success: corrupted frames, tampering, wrong passphrases, worker cancellation, CSP hydration, and offline launch. Never offer unverified plaintext as test output.

## Commit & Pull Request Guidelines

History uses short, imperative subjects such as `add csp generation`; keep commits focused and avoid generated artifacts. Pull requests should explain behavior and security impact, list commands run, link relevant issues, and include screenshots for visible UI changes. Call out protocol, dependency, WASM, CSP, or storage changes explicitly.

## Security & Configuration

Do not add uploads, analytics, third-party scripts, or passphrase persistence. Keep runtime dependencies pinned, update `SBOM.md` and `THIRD_PARTY_NOTICES.md` when dependencies change, and preserve hash-based CSP generation plus Cloudflare headers.
