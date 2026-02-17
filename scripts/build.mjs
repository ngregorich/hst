import { execSync, spawnSync } from 'node:child_process';

function resolveCommit() {
	if (process.env.VITE_GIT_COMMIT) {
		return process.env.VITE_GIT_COMMIT;
	}
	try {
		return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return '';
	}
}

const env = { ...process.env };
const commit = resolveCommit();
if (commit) {
	env.VITE_GIT_COMMIT = commit;
}

const result = spawnSync('vite', ['build'], {
	stdio: 'inherit',
	env,
	shell: true
});

if (typeof result.status === 'number') {
	process.exit(result.status);
}
process.exit(1);
