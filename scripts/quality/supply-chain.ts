export interface PackageManifest {
	dependencies?: Record<string, string>;
}

const EXACT_SEMVER =
	/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

function stableDependencies(manifest: PackageManifest | undefined): string {
	return JSON.stringify(
		Object.entries(manifest?.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))
	);
}

export function supplyChainErrors(
	files: readonly string[],
	baseManifest: PackageManifest | undefined,
	headManifest: PackageManifest
): string[] {
	const errors: string[] = [];
	for (const [name, version] of Object.entries(headManifest.dependencies ?? {})) {
		if (!EXACT_SEMVER.test(version)) {
			errors.push(`Runtime dependency ${name} must use an exact version, found ${version}.`);
		}
	}

	const runtimeChanged = stableDependencies(baseManifest) !== stableDependencies(headManifest);
	const lockChanged = files.includes('bun.lock');
	const wasmChanged = files.some((path) => path.endsWith('.wasm') || path.includes('/wasm/'));
	if (runtimeChanged || lockChanged || wasmChanged) {
		for (const required of ['SBOM.md', 'THIRD_PARTY_NOTICES.md']) {
			if (!files.includes(required)) {
				errors.push(`${required} must change with runtime dependency, lockfile, or WASM changes.`);
			}
		}
	}

	return errors;
}
