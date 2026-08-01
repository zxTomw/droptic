---
name: release-droptic
description: Verify Droptic release readiness without publishing. Use before a production release, release-candidate tag, performance claim, removal of experimental warnings, dependency/WASM rollout, or Cloudflare deployment approval.
---

# Release Droptic

## Collect automated evidence

Run `bun install --frozen-lockfile`, `bun run verify:fast`, `bun run verify:browser`, `bun run quality:supply-chain --base <release-base> --head <candidate>`, and `bun run verify:deploy`. Confirm the static build contains `/`, `/send`, `/receive`, workers, WASM, manifest, service worker, `_headers`, and per-page CSP hashes. Never publish from this skill.

## Check supply chain and security

Require exact runtime pins, a clean lockfile, matching `SBOM.md` and `THIRD_PARTY_NOTICES.md`, recorded WASM provenance, authenticated file completion, no third-party scripts or analytics, no plaintext persistence, and no user-file caching.

## Require manual release evidence

Record desktop-to-phone, phone-to-phone, and phone-to-desktop results on current and previous iOS Safari, current Android Chrome, and current desktop targets. Include transfer size, distance, profile, throughput, completion hash, memory/backlog observations, offline launch, permission recovery, and measured WCAG flash status. Do not remove experimental labels or claim 50–150 KB/s performance without this evidence.

For hosting-sensitive changes, verify a Cloudflare preview with fresh cache and service-worker state. Confirm the response header retains `frame-ancestors 'none'`, the generated HTML retains its hash CSP, hydration succeeds without console violations, and same-origin immutable assets load.

## Decide

Return `ready` only when every automated and applicable manual gate is evidenced. Otherwise return `blocked` with exact missing evidence and no deployment action.
