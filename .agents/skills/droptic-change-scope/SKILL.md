---
name: droptic-change-scope
description: Classify Droptic repository changes and select mandatory specialist skills, automated gates, and manual evidence. Use before implementing or reviewing any code, configuration, dependency, PWA, protocol, worker, storage, or deployment change in this repository.
---

# Droptic Change Scope

## Classify the diff

1. Read `AGENTS.md`, then inspect `git status` and the complete diff.
2. Run `bun run quality:classify --base <base> --head <head>` for committed changes. For working-tree changes, classify the listed paths using the same rules in `scripts/quality/change-classifier.ts`.
3. Record the resulting `optical`, `browser`, `supplyChain`, and `deployment` flags. Do not downgrade a flag based on the apparent size of the edit.

## Route the work

- Apply `$droptic-optical-safety` when `optical` is true.
- Apply `$droptic-pwa-compat` when `browser` is true.
- Inspect exact pins, `bun.lock`, `SBOM.md`, and `THIRD_PARTY_NOTICES.md` when `supplyChain` is true.
- Run the Cloudflare dry run when `deployment` is true.
- Assign `$droptic-peer-review` to a separate agent for optical, security, dependency, storage, or browser-platform changes.

## Require evidence

Always require `bun run verify:fast`. Add `bun run verify:browser`, `bun run quality:supply-chain`, and `bun run verify:deploy` according to the flags. Report scope, risks, selected skills, commands run, results, and any remaining physical-device or release evidence.
