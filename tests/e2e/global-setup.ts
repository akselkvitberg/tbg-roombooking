import { execSync } from 'child_process';

import { chromium, FullConfig } from '@playwright/test';

export const users = ['medlem', 'medlem-uten-tlf', 'admin', 'gjest'] as const;
export type User = (typeof users)[number];

export const storageState = (user: User) => `test-results/.auth/${user}.json`;

/**
 * Resets the example data, since the tests book rooms, and logs in each
 * test user once and saves the cookies.
 *
 * `E2E_RESET_COMMAND` overrides the reset command, e.g. for `bin/php-server.sh`:
 * `vendor/bin/wp --path=.tmp/wordpress creo-rombooking seed --reset`.
 *
 * @param config The Playwright config.
 */
export default async function globalSetup(config: FullConfig) {
	execSync(
		process.env.E2E_RESET_COMMAND ?? 'pnpm wp creo-rombooking seed --reset',
		{ stdio: 'inherit' }
	);

	const { baseURL, launchOptions } = config.projects[0].use;
	const browser = await chromium.launch(launchOptions);

	for (const user of users) {
		const page = await browser.newPage({ baseURL });
		await page.goto('/wp-login.php');
		await page.fill('#user_login', user);
		await page.fill('#user_pass', 'password');
		await page.click('#wp-submit');
		// The first request after a build can be slow with PHP's built-in server.
		await page.waitForURL(/wp-admin|\/$/, { timeout: 60_000 });
		await page.context().storageState({ path: storageState(user) });
		await page.close();
	}

	await browser.close();
}
