import { appendFileSync } from 'node:fs';
import { classifyChangedFiles } from './change-classifier';
import { changedFiles, parseRevisionArgs } from './git-changes';

const { base, head } = parseRevisionArgs(process.argv.slice(2));
const files = changedFiles(base, head);
const scope = classifyChangedFiles(files);

if (process.env.GITHUB_OUTPUT) {
	appendFileSync(
		process.env.GITHUB_OUTPUT,
		Object.entries(scope)
			.map(([key, value]) => `${key}=${String(value)}`)
			.join('\n') + '\n'
	);
}

console.log(JSON.stringify({ files, ...scope }, null, 2));
