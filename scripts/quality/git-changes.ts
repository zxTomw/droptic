import { execFileSync } from 'node:child_process';

const ZERO_SHA = /^0+$/;

function git(args: string[]): string {
	return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function changedFiles(base: string, head: string): string[] {
	return git(changedFileArgs(base, head)).split('\n').filter(Boolean);
}

export function changedFileArgs(base: string, head: string): string[] {
	return !base || ZERO_SHA.test(base)
		? ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', head]
		: ['diff', '--name-only', `${base}...${head}`];
}

export function gitFile(revision: string, path: string): string | undefined {
	try {
		return git(['show', `${revision}:${path}`]);
	} catch {
		return undefined;
	}
}

export function parseRevisionArgs(args: readonly string[]): { base: string; head: string } {
	const value = (name: string): string | undefined => {
		const index = args.indexOf(name);
		return index >= 0 ? args[index + 1] : undefined;
	};
	const base = value('--base');
	const head = value('--head');
	if (!base || !head) throw new Error('Usage: --base <sha> --head <sha>');
	return { base, head };
}
