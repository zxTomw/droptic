import { describe, expect, it } from 'vitest';
import { classifyChangedFiles } from './change-classifier';
import { changedFileArgs } from './git-changes';
import { supplyChainErrors } from './supply-chain';

describe('classifyChangedFiles', () => {
	it('activates optical and browser gates for optical-core changes', () => {
		expect(classifyChangedFiles(['src/lib/optical/protocol.ts'])).toEqual({
			optical: true,
			browser: true,
			supplyChain: false,
			deployment: false
		});
	});

	it('classifies browser and deployment boundaries', () => {
		expect(classifyChangedFiles(['src/routes/send/+page.svelte', 'static/_headers'])).toEqual({
			optical: false,
			browser: true,
			supplyChain: false,
			deployment: true
		});
	});

	it('keeps documentation-only changes on the fast gate', () => {
		expect(classifyChangedFiles(['AGENTS.md'])).toEqual({
			optical: false,
			browser: false,
			supplyChain: false,
			deployment: false
		});
	});

	it('runs browser gates when browser tests or entry points change', () => {
		for (const path of ['tests/app.e2e.ts', 'src/app.html', 'package.json']) {
			expect(classifyChangedFiles([path]).browser).toBe(true);
		}
	});

	it('runs every specialist gate when the quality workflow changes', () => {
		expect(classifyChangedFiles(['.github/workflows/quality.yml'])).toEqual({
			optical: false,
			browser: true,
			supplyChain: true,
			deployment: true
		});
	});
});

describe('changedFileArgs', () => {
	it('includes root-commit files when the base SHA is zero', () => {
		expect(changedFileArgs('0000000000000000000000000000000000000000', 'abc123')).toEqual([
			'diff-tree',
			'--root',
			'--no-commit-id',
			'--name-only',
			'-r',
			'abc123'
		]);
	});
});

describe('supplyChainErrors', () => {
	it('rejects non-exact runtime dependencies', () => {
		for (const version of ['^1.2.3', '1.2.x', '1', 'next', 'git+https://example.test/x.git']) {
			expect(supplyChainErrors([], {}, { dependencies: { example: version } })).toContain(
				`Runtime dependency example must use an exact version, found ${version}.`
			);
		}
	});

	it('accepts exact stable and prerelease runtime versions', () => {
		for (const version of ['1.2.3', '1.2.3-beta.1', '1.2.3+build.4']) {
			expect(
				supplyChainErrors(
					['package.json', 'SBOM.md', 'THIRD_PARTY_NOTICES.md'],
					{ dependencies: { example: version } },
					{ dependencies: { example: version } }
				)
			).toEqual([]);
		}
	});

	it('requires attribution files for runtime dependency changes', () => {
		expect(
			supplyChainErrors(
				['package.json', 'bun.lock'],
				{ dependencies: { example: '1.0.0' } },
				{ dependencies: { example: '1.1.0' } }
			)
		).toEqual([
			'SBOM.md must change with runtime dependency, lockfile, or WASM changes.',
			'THIRD_PARTY_NOTICES.md must change with runtime dependency, lockfile, or WASM changes.'
		]);
	});

	it('accepts exact pins with updated attribution', () => {
		expect(
			supplyChainErrors(
				['package.json', 'bun.lock', 'SBOM.md', 'THIRD_PARTY_NOTICES.md'],
				{ dependencies: { example: '1.0.0' } },
				{ dependencies: { example: '1.1.0' } }
			)
		).toEqual([]);
	});
});
