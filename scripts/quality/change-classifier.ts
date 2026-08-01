export interface QualityScope {
	optical: boolean;
	browser: boolean;
	supplyChain: boolean;
	deployment: boolean;
}

const QUALITY_WORKFLOW = '.github/workflows/quality.yml';
const BROWSER_FILES = new Set([
	'package.json',
	'bun.lock',
	'vite.config.ts',
	'playwright.config.ts',
	'src/app.html',
	'src/service-worker.ts',
	QUALITY_WORKFLOW
]);
const SUPPLY_CHAIN_FILES = new Set([
	'package.json',
	'bun.lock',
	'SBOM.md',
	'THIRD_PARTY_NOTICES.md'
]);
const DEPLOYMENT_FILES = new Set([
	'wrangler.jsonc',
	'vite.config.ts',
	'src/service-worker.ts',
	'static/_headers'
]);

function normalizePath(path: string): string {
	return path.trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

export function classifyChangedFiles(paths: readonly string[]): QualityScope {
	const files = paths.map(normalizePath).filter(Boolean);
	const optical = files.some((path) => path.startsWith('src/lib/optical/'));
	const browser =
		optical ||
		files.some(
			(path) =>
				path.startsWith('src/routes/') ||
				path.startsWith('static/') ||
				/^tests\/.+\.e2e\.[cm]?[jt]s$/.test(path) ||
				BROWSER_FILES.has(path)
		);
	const supplyChain = files.some(
		(path) =>
			SUPPLY_CHAIN_FILES.has(path) ||
			path === QUALITY_WORKFLOW ||
			path.endsWith('.wasm') ||
			path.includes('/wasm/')
	);
	const deployment = files.some((path) => DEPLOYMENT_FILES.has(path) || path === QUALITY_WORKFLOW);

	return { optical, browser, supplyChain, deployment };
}
