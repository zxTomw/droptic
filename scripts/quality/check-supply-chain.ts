import { changedFiles, gitFile, parseRevisionArgs } from './git-changes';
import { supplyChainErrors, type PackageManifest } from './supply-chain';

const { base, head } = parseRevisionArgs(process.argv.slice(2));
const files = changedFiles(base, head);
const basePackage = gitFile(base, 'package.json');
const headPackage = gitFile(head, 'package.json');
if (!headPackage) throw new Error(`package.json is unavailable at ${head}.`);

const errors = supplyChainErrors(
	files,
	basePackage ? (JSON.parse(basePackage) as PackageManifest) : undefined,
	JSON.parse(headPackage) as PackageManifest
);

if (errors.length > 0) {
	console.error(errors.join('\n'));
	process.exitCode = 1;
} else {
	console.log('Runtime pins are exact and required attribution files changed together.');
}
