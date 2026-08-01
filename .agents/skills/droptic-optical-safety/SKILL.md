---
name: droptic-optical-safety
description: Guard Droptic protocol, cryptography, RaptorQ, QR framing, persistence, and worker-message changes. Use for any edit under src/lib/optical, optical dependency change, binary format change, encrypted file lifecycle change, or sender/receiver worker behavior change.
---

# Droptic Optical Safety

## Preserve invariants

Read the protocol and architecture sections of `README.md` plus the affected implementation and tests. Preserve these invariants:

- Reject unknown versions, algorithms, capabilities, unsafe sizes, KDF parameters, frame kinds, and invalid CRC32C before decoder input.
- Bind the canonical bootstrap as AES-GCM associated data. Never expose unauthenticated or partially reconstructed plaintext.
- Keep passphrases, keys, plaintext, and object URLs out of persistence; expire encrypted partial sessions.
- Keep large buffers worker-owned, transfer `ArrayBuffer` ownership, bound queues, and make cancellation/disposal idempotent.
- Treat serialized field order, widths, and endianness as compatibility contracts. Require a version decision and golden vector for any wire change.

## Verify adversarial behavior

Add or update Vitest coverage for round trips, golden vectors, truncation, corruption, duplication, shuffling, missing symbols, wrong passphrases, tampering, unsafe lengths, and cancellation as applicable. Run `bun run verify:fast` and `bun run verify:browser`. Do not claim cryptographic audit or physical throughput evidence from automated tests.

## Review output

State the protected invariants, compatibility impact, negative tests added, resource bounds, and residual risks. Block completion if verified output can be offered before size, digest, and AES-GCM authentication succeed.
