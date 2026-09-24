import { expect, Page } from '@playwright/test';

import { as, expectAccessible, nextWeekday, test } from './helpers';

/**
 * Every screen in the theme's dark mode, which the theme stores in
 * `localStorage` and sets as the `dark` class on the page.
 * @param page
 * @param tab
 */
async function open(page: Page, tab: string) {
	await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
	await page.route(
		/fonts\.googleapis|fonts\.gstatic|design\.bcc\.no|livereload|gravatar/,
		(route) => route.abort()
	);
	await page.goto(`/rombooking/#rombooking=${tab}`);
	await expect(page.locator('html')).toHaveClass(/dark/);
}

const loaded = (page: Page) =>
	expect(page.getByText(/Laster|Henter/)).toHaveCount(0);

test.describe('Dark mode, member', () => {
	as('medlem');

	test('day, week and booking form', async ({ page, viewport }) => {
		await open(page, 'book');
		await page.getByLabel('Dato', { exact: true }).fill(nextWeekday(2));
		await loaded(page);
		await expectAccessible(page);

		if ((viewport?.width ?? 0) >= 640) {
			await page.getByRole('button', { name: 'Uke', exact: true }).click();
			await expect(page.getByRole('grid')).toBeVisible();
			await expectAccessible(page);
			await page.getByRole('button', { name: 'Dag', exact: true }).click();
		}

		await page
			.getByRole('button', { name: /^Storsalen, 08:00–08:30, Ledig/ })
			.first()
			.click();
		await page.getByRole('dialog').getByLabel('Ukentlig').check();
		await expect(
			page.getByRole('region', { name: 'Forhåndsvisning av forekomster' })
		).toBeVisible();
		await expectAccessible(page);
	});

	test('my bookings', async ({ page }) => {
		await open(page, 'mine');
		await expect(
			page.getByRole('heading', { name: 'Mine bookinger' })
		).toBeVisible();
		await loaded(page);
		await expectAccessible(page);
	});
});

test.describe('Dark mode, administrator', () => {
	as('admin');

	test('requests', async ({ page }) => {
		await open(page, 'requests');
		await loaded(page);
		await page
			.getByRole('button', { name: /^Foreslå / })
			.first()
			.click();
		await expectAccessible(page);
	});

	test('overview and room setup', async ({ page }) => {
		await open(page, 'admin-matrix');
		await page.getByLabel('Dato', { exact: true }).fill(nextWeekday(2));
		await loaded(page);
		await expectAccessible(page);

		await page.getByRole('tab', { name: 'Rom', exact: true }).click();
		await page.getByRole('button', { name: 'Rediger' }).first().click();
		await expect(
			page.getByRole('heading', { name: /^Rediger / })
		).toBeVisible();
		await expectAccessible(page);

		await page.getByRole('tab', { name: 'SMS-logg' }).click();
		await loaded(page);
		await expectAccessible(page);
	});
});
