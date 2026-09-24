import { expect, Page } from '@playwright/test';

import {
	as,
	expectAccessible,
	nextWeekday,
	openBooking,
	test,
} from './helpers';

const MONDAY = nextWeekday(0);
const WEDNESDAY = nextWeekday(2);

async function openWeek(page: Page, room?: string) {
	await openBooking(page, WEDNESDAY);
	await page.getByRole('button', { name: 'Uke' }).click();
	if (room) {
		await page
			.getByRole('group', { name: 'Velg rom' })
			.getByRole('button', { name: room })
			.click();
	}
	const grid = page.getByRole('grid', {
		name: room ? `${room}, uke` : /, uke/,
	});
	await expect(grid.getByRole('row')).toHaveCount(7);
	return grid;
}

test.describe('Week view', () => {
	as('medlem');
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Desktop only');

	test('shows one room with the days as columns', async ({ page }) => {
		const grid = await openWeek(page, 'Kafé');

		await expect(page.locator('.creo-rombooking-heading')).toHaveText(
			/^Kafé · Uke \d+ · /
		);
		await expect(
			page
				.getByRole('group', { name: 'Velg rom' })
				.getByRole('button', { name: 'Kafé' })
		).toHaveAttribute('aria-pressed', 'true');

		const monday = grid.getByRole('row').first();
		await expect(monday.getByRole('rowheader')).toHaveText(/^Man\./);
		// Kafé is closed on Mondays.
		await expect(
			monday.getByRole('button', {
				name: /, 08:00–22:00, Stengt\. Utenfor åpningstid/,
			})
		).toBeVisible();
		await expect(
			grid.getByRole('button', {
				name: /^Onsdag \d+\. \w+, 17:30–19:00, Din booking/,
			})
		).toBeVisible();

		await expectAccessible(page);
	});

	test('moves with the keyboard and opens the booking form', async ({
		page,
	}) => {
		const grid = await openWeek(page, 'Møterom 2');

		// The chosen day has the tab stop.
		const stop = grid.locator('[tabindex="0"]');
		await expect(stop).toHaveCount(1);
		await expect(stop).toHaveAccessibleName(/^Onsdag .*, 08:00–08:30, Ledig/);

		await stop.focus();
		await page.keyboard.press('ArrowDown');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Onsdag .*, 08:30–09:00, Ledig/
		);
		await page.keyboard.press('ArrowRight');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Torsdag .*, 08:30–09:00, Ledig/
		);
		await page.keyboard.press('End');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Torsdag .*, 21:30–22:00, /
		);

		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Mandag .*, 08:00–08:30, Ledig/
		);
		await page.keyboard.press('Enter');

		const dialog = page.getByRole('dialog', { name: 'Ny booking' });
		await expect(dialog.getByLabel('Dato')).toHaveValue(MONDAY);
		await expect(dialog.getByLabel('Fra')).toHaveValue('480');
		await expect(dialog.getByLabel('Rom')).toHaveValue(/\d+/);
		await page.keyboard.press('Escape');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Mandag .*, 08:00–08:30, Ledig/
		);
	});

	test('changes week with Page Down and the buttons', async ({ page }) => {
		const grid = await openWeek(page, 'Storsalen');
		const heading = page.locator('.creo-rombooking-heading');
		const first = await heading.innerText();

		await grid.locator('[tabindex="0"]').focus();
		await page.keyboard.press('PageDown');
		await expect(heading).not.toHaveText(first);
		await expect(page.locator(':focus')).toHaveAccessibleName(/^Onsdag /);

		await page.getByRole('button', { name: 'Forrige uke' }).click();
		await expect(heading).toHaveText(first);
	});
});

test.describe('Week view (mobile)', () => {
	as('medlem');
	test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 640, 'Mobile only');

	test('scrolls sideways inside the grid, not the page', async ({ page }) => {
		const grid = await openWeek(page);
		await page
			.getByLabel('Rom', { exact: true })
			.selectOption({ label: 'Kafé (60 plasser · auto)' });
		await expect(grid).toHaveAccessibleName(/^Kafé, uke/);

		const width = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		expect(width).toBeLessThanOrEqual(360);
		// The chosen day (Wednesday) is scrolled into view.
		await expect(
			grid.getByRole('row').nth(2).getByRole('rowheader')
		).toBeInViewport();
		await expectAccessible(page);
	});
});
