import { expect, Page } from '@playwright/test';

import {
	as,
	expectAccessible,
	nextWeekday,
	openBooking,
	test,
} from './helpers';

/**
 * The example data gives the test member two weekly series (Møterom 1 on
 * Thursdays and Kafé on Wednesdays), a request in Gymsal and a proposal for
 * Gymsal next Wednesday.
 * @param page
 */
async function openMine(page: Page) {
	await page.route(
		/fonts\.googleapis|fonts\.gstatic|design\.bcc\.no|livereload|gravatar/,
		(route) => route.abort()
	);
	await page.goto('/rombooking/#rombooking=mine');
	await expect(
		page.getByRole('heading', { name: 'Mine bookinger' })
	).toBeVisible();
	await expect(page.getByText('Laster …')).toHaveCount(0);
}

const toast = (page: Page) =>
	page.locator('.creo-rombooking-mine > [role=status]');

const upcoming = (page: Page) => page.getByRole('region', { name: 'Kommende' });

test.describe('My bookings', () => {
	as('medlem');
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Desktop only');

	test('lists proposals, series and requests', async ({ page }) => {
		await openMine(page);

		const proposal = page.getByRole('article', {
			name: 'Forslag i stedet for Gymsal',
		});
		await expect(proposal).toContainText('Du ba om');
		await expect(proposal).toContainText('16:30–18:30');
		await expect(proposal).toContainText('17:30–19:30');
		await expect(proposal).toContainText('Turngruppa har salen til 17:30.');
		await expect(proposal).toContainText(/^.*Svar innen .* kl\. \d\d:\d\d\./);

		await expect(
			upcoming(page).getByRole('listitem', {
				name: /^Kafé · Ukentlig · 17:30–19:00/,
			})
		).toContainText('Serie');
		await expect(
			upcoming(page)
				.getByRole('listitem', { name: /Gymsal|19:00–21:00/ })
				.last()
		).toContainText('Venter på godkjenning');

		await expectAccessible(page);
	});

	test('cancels one date in a series', async ({ page }) => {
		await openMine(page);
		const series = upcoming(page).getByRole('listitem', {
			name: /^Kafé · Ukentlig/,
		});
		await series.getByText('Vis datoene').click();
		const dates = series.getByRole('list').getByRole('listitem');
		const count = await dates.count();
		const second = (
			await dates.nth(1).locator('.creo-rombooking-grow').innerText()
		).trim();

		await dates
			.nth(1)
			.getByRole('button', { name: `Avbestill ${second}` })
			.click();
		const dialog = page.getByRole('dialog', { name: 'Avbestille bookingen?' });
		await expect(
			dialog.getByRole('radio', { name: /Bare denne datoen/ })
		).toBeChecked();
		await expect(
			dialog.getByRole('radio', { name: /Denne og alle senere/ })
		).toBeVisible();
		await expectAccessible(page);

		await dialog.getByRole('button', { name: 'Avbestill bookingen' }).click();
		await expect(toast(page)).toContainText('Bookingen er avbestilt.');
		await expect(
			page.getByRole('heading', { name: 'Mine bookinger' })
		).toBeFocused();

		// The dates stay open after the list has reloaded.
		await expect(series.getByRole('list').getByRole('listitem')).toHaveCount(
			count - 1
		);
		await expect(
			page.getByRole('region', { name: 'Avslått eller avbestilt' })
		).toContainText('Avbestilt av deg');
	});

	test('keeps the booking when the dialog is closed', async ({ page }) => {
		await openMine(page);
		const opener = upcoming(page)
			.getByRole('listitem', { name: /^Kafé · Ukentlig/ })
			.getByRole('button', { name: 'Avbestill' })
			.last();
		await opener.click();
		await page.getByRole('button', { name: 'Behold bookingen' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(opener).toBeFocused();
	});

	test('accepts a proposal', async ({ page }) => {
		await openMine(page);
		await page
			.getByRole('article', { name: 'Forslag i stedet for Gymsal' })
			.getByRole('button', { name: 'Aksepter' })
			.click();

		await expect(toast(page)).toContainText(
			'Forslaget er akseptert, og bookingen er bekreftet.'
		);
		await expect(
			page.getByRole('region', { name: 'Forslag du må svare på' })
		).toHaveCount(0);
		await expect(
			upcoming(page).getByRole('listitem', { name: /17:30–19:30/ })
		).toContainText('Bekreftet');

		// The booking is shown in the week view too.
		await openBooking(page, nextWeekday(2));
		await page.getByRole('button', { name: 'Uke' }).click();
		await page
			.getByRole('group', { name: 'Velg rom' })
			.getByRole('button', { name: 'Gymsal' })
			.click();
		await expect(
			page
				.getByRole('grid')
				.getByRole('button', { name: /^Onsdag .*, 17:30–19:30, Din booking/ })
		).toBeVisible();
	});
});

test.describe('My bookings from the matrix', () => {
	as('medlem');
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Desktop only');

	test('cancels an own booking from its details', async ({ page }) => {
		await openBooking(page, nextWeekday(3));
		await page
			.getByRole('grid')
			.getByRole('button', { name: /^Møterom 1, 17:00–18:30, Din booking/ })
			.click();

		const details = page.getByRole('dialog', { name: 'Din booking' });
		await details
			.getByRole('button', { name: 'Avbestill bookingen …' })
			.click();
		const dialog = page.getByRole('dialog', { name: 'Avbestille bookingen?' });
		await dialog.getByRole('button', { name: 'Avbestill bookingen' }).click();

		await expect(page.getByRole('status').first()).toContainText(
			'Bookingen er avbestilt.'
		);
		await expect(
			page
				.getByRole('grid')
				.getByRole('button', { name: /^Møterom 1, 17:00–17:30, Ledig/ })
		).toBeVisible();
	});
});

test.describe('My bookings without bookings', () => {
	as('medlem');

	test('shows an empty state with a way to book', async ({ page }) => {
		// Other tests book as the test users, so the list is emptied here.
		await page.route(/\/me\/bookings/, (route) =>
			route.fulfill({ json: { proposals: [], upcoming: [], closed: [] } })
		);
		await openMine(page);
		await expect(
			page.getByText('Du har ingen kommende bookinger')
		).toBeVisible();
		await page.getByRole('link', { name: 'Book rom' }).click();
		await expect(page.getByRole('tab', { name: 'Book rom' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		const width = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
	});
});
