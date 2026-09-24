import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a development site with the example data
 * (`pnpm wp-env start`, or `bin/php-server.sh`).
 */
const baseURL = process.env.WP_BASE_URL ?? 'http://localhost:8888';

// Use a preinstalled Chromium when set, e.g. in Claude Code sessions.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
	testDir: './tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	// The tests change the same example data, so they run one at a time.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL,
		locale: 'nb-NO',
		timezoneId: 'Europe/Oslo',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		launchOptions: executablePath ? { executablePath } : {},
	},
	projects: [
		{
			name: 'desktop',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1280, height: 900 },
			},
		},
		{
			name: 'mobile',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 360, height: 800 },
				hasTouch: true,
			},
		},
	],
});
