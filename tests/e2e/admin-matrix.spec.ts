import { expect, Page } from '@playwright/test';

import { as, expectAccessible, nextWeekday, test } from './helpers';

/**
 * Wednesday in two weeks: the tests move and cancel bookings, so they use a
 * day the other tests do not look at. The weekly bookings are the same.
 */
const DAY = nextWeekday(9);

async function openOverview(page: Page) {
	await page.route(
		/fonts\.googleapis|fonts\.gstatic|design\.bcc\.no|livereload|gravatar/,
		(route) => route.abort()
	);
	await page.goto('/rombooking/#rombooking=admin-matrix');
	await page.getByLabel('Dato', { exact: true }).fill(DAY);
	await expect(page.getByText('Laster ledige tider')).toHaveCount(0);
	return page.getByRole('grid');
}

const toast = (page: Page) =>
	page.locator('.creo-rombooking-book > [role=status]');

test.describe('Admin overview', () => {
	as('admin');
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Desktop only');

	test('shows who booked', async ({ page }) => {
		const grid = await openOverview(page);

		const babysang = grid.getByRole('button', {
			name: /^Møterom 2, 10:00–11:30/,
		});
		await expect(babysang).toContainText('Babysang');
		await expect(babysang).toHaveAccessibleName(
			/Opptatt\. Babysang, Babysang, 8 personer\. Velg for å se detaljer, flytte eller avbestille\./
		);
		await expect(
			grid.getByRole('button', { name: /^Storsalen, 18:00–21:00/ })
		).toContainText('Kor A');
		await expectAccessible(page);
	});

	test('moves a booking with the keyboard', async ({ page }) => {
		const grid = await openOverview(page);
		const babysang = grid.getByRole('button', {
			name: /^Møterom 2, 10:00–11:30/,
		});
		await babysang.focus();
		await page.keyboard.press('Enter');

		const details = page.getByRole('dialog', { name: 'Booking av Babysang' });
		await expect(details).toContainText('Bekreftet · Serie');
		await details.getByRole('button', { name: 'Flytt …' }).click();

		const move = page.getByRole('dialog', {
			name: 'Flytt bookingen til Babysang',
		});
		await expect(move.getByLabel('Rom')).toBeFocused();
		await move
			.getByLabel('Rom')
			.selectOption({ label: 'Barnerom (20 plasser)' });
		await expect(move.getByRole('status')).toContainText('Ledig');

		await move.getByRole('button', { name: 'Flytt bookingen' }).click();
		await expect(move.getByLabel(/^Begrunnelse/)).toHaveAttribute(
			'aria-invalid',
			'true'
		);
		await move.getByLabel(/^Begrunnelse/).fill('Møterom 2 skal males.');
		await expectAccessible(page);
		await move.getByRole('button', { name: 'Flytt bookingen' }).click();

		await expect(toast(page)).toContainText(
			'Bookingen er flyttet til Barnerom'
		);
		await expect(
			grid.getByRole('button', { name: /^Barnerom, 10:00–11:30, Opptatt/ })
		).toContainText('Babysang');
		await expect(
			grid.getByRole('button', { name: /^Møterom 2, 10:00–10:30, Ledig/ })
		).toBeVisible();
	});

	test('moves a booking by dragging it', async ({ page }) => {
		const grid = await openOverview(page);
		const source = grid.getByRole('button', {
			name: /^Møterom 2, 19:00–21:00/,
		});
		const target = grid.getByRole('button', {
			name: /^Kafé, 13:00–13:30, Ledig/,
		});
		const row = page.getByRole('row', { name: /^Kafé/ });

		const transfer = await page.evaluateHandle(() => new DataTransfer());
		const from = (await source.boundingBox())!;
		const to = (await target.boundingBox())!;
		await source.dispatchEvent('dragstart', {
			dataTransfer: transfer,
			clientX: from.x + 2,
			clientY: from.y + 10,
		});
		await row.dispatchEvent('dragover', {
			dataTransfer: transfer,
			clientX: to.x + 2,
			clientY: to.y + 10,
		});
		await expect(row.locator('.creo-rombooking-drop')).toHaveText('13:00');
		await row.dispatchEvent('drop', {
			dataTransfer: transfer,
			clientX: to.x + 2,
			clientY: to.y + 10,
		});

		const move = page.getByRole('dialog', {
			name: 'Flytt bookingen til Kari Prøvesen',
		});
		await expect(move.getByLabel('Rom')).toHaveValue(/\d+/);
		await expect(move.getByLabel('Fra')).toHaveValue('780');
		await expect(move.getByLabel('Til')).toHaveValue('900');
		await expect(move.getByLabel(/^Begrunnelse/)).toBeFocused();
		await move
			.getByLabel(/^Begrunnelse/)
			.fill('Styret møtes i kaféen denne gangen.');
		await move.getByRole('button', { name: 'Flytt bookingen' }).click();

		await expect(toast(page)).toContainText('Bookingen er flyttet til Kafé');
		await expect(
			grid.getByRole('button', { name: /^Kafé, 13:00–15:00, Opptatt/ })
		).toContainText('Kari Prøvesen');
	});

	test('cancels a booking with a reason', async ({ page }) => {
		const grid = await openOverview(page);
		await grid.getByRole('button', { name: /^Storsalen, 18:00–21:00/ }).click();
		await page
			.getByRole('dialog', { name: 'Booking av Kor A' })
			.getByRole('button', { name: 'Avbestill bookingen …' })
			.click();

		const dialog = page.getByRole('dialog', {
			name: 'Avbestille bookingen til Kor A?',
		});
		await dialog
			.getByLabel(/^Begrunnelse/)
			.fill('Salen brukes til konfirmasjon.');
		await dialog.getByRole('button', { name: 'Avbestill bookingen' }).click();

		await expect(toast(page)).toContainText(
			'Bookingen er avbestilt. Kor A får SMS'
		);
		await expect(
			grid.getByRole('button', { name: /^Storsalen, 18:00–18:30, Ledig/ })
		).toBeVisible();

		await page.getByRole('tab', { name: 'SMS-logg' }).click();
		await expect(page.getByRole('listitem').first()).toContainText(
			'Begrunnelse: Salen brukes til konfirmasjon.'
		);
	});
});

test.describe('Admin overview (mobile)', () => {
	as('admin');
	test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 640, 'Mobile only');

	test('lists one room with names', async ({ page }) => {
		await openOverview(page);
		await page.getByLabel('Rom', { exact: true }).selectOption({
			label: 'Barnerom (20 plasser · auto)',
		});
		await expect(
			page.getByRole('list', { name: /^Tider i Barnerom/ })
		).toContainText('Barnekoret');
		const width = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		expect(width).toBeLessThanOrEqual(360);
		await expectAccessible(page);
	});
});
