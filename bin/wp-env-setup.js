#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { symlink } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(dir, '..');
const wpEnvDir = resolve(rootDir, '.wp-env');
const wpEnvBin = resolve(rootDir, 'node_modules/.bin/wp-env');
const wpEnv = (args, opts) => execSync(`${wpEnvBin} ${args}`, opts);

if (!existsSync(wpEnvDir)) {
	const installPath = wpEnv('install-path').toString().trim();
	await symlink(installPath, wpEnvDir, 'dir');
}

execSync(resolve(dir, 'build-theme.sh'), { stdio: 'inherit' });

wpEnv('run cli bash tbg-roombooking/bin/wp-setup.sh', { stdio: 'inherit' });
wpEnv('run tests-cli bash tbg-roombooking/bin/wp-tests-setup.sh', {
	stdio: 'inherit',
});
