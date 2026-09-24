import { expect, Page } from '@playwright/test';

import { as, expectAccessible, nextWeekday, test } from './helpers';

/**
 * The mobile tests run after these and start on the first room, so these
 * tests leave the rooms as they found them: the order is restored, and the
 * new room is made inactive.
 * @param page
 */
async function openRooms(page: Page) {
	await page.route(
		/fonts\.googleapis|fonts\.gstatic|design\.bcc\.no|livereload|gravatar/,
		(route) => route.abort()
	);
	await page.goto('/rombooking/#rombooking=rooms');
	await expect(
		page.getByRole('heading', { name: 'Rom', exact: true })
	).toBeVisible();
}

const toast = (page: Page) =>
	page.locator('.creo-rombooking-admin > [role=status]');

const names = (page: Page) => page.locator('.creo-rombooking-bookings h4');

/**
 * The room names, once the list has loaded.
 *
 * @param page The page.
 */
async function roomNames(page: Page) {
	await expect(names(page).first()).toBeVisible();
	return names(page).allInnerTexts();
}

test.describe('Room setup', () => {
	as('admin');
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Desktop only');

	test('lists the rooms and changes their order', async ({ page }) => {
		await openRooms(page);
		const before = await roomNames(page);
		expect(before[0]).toBe('Storsalen');

		await page.getByRole('button', { name: 'Flytt Storsalen ned' }).click();
		await expect(toast(page)).toContainText('Storsalen er flyttet.');
		await expect(
			page.getByRole('button', { name: 'Flytt Storsalen ned' })
		).toBeFocused();
		expect((await roomNames(page)).slice(0, 2)).toEqual(['Kafé', 'Storsalen']);

		await page.reload();
		expect((await roomNames(page)).slice(0, 2)).toEqual(['Kafé', 'Storsalen']);
		await expectAccessible(page);

		await page.getByRole('button', { name: 'Flytt Storsalen opp' }).click();
		await expect(toast(page)).toContainText('Storsalen er flyttet.');
		expect(await roomNames(page)).toEqual(before);
	});

	test('edits a room and warns against codes in the instructions', async ({
		page,
	}) => {
		await openRooms(page);
		await page
			.getByRole('listitem', { name: 'Møterom 2' })
			.getByRole('button', { name: 'Rediger' })
			.click();
		await expect(
			page.getByRole('heading', { name: 'Rediger Møterom 2' })
		).toBeFocused();

		await expect(page.getByLabel(/^Instruks/)).toHaveAccessibleDescription(
			/Alle som har en bekreftet booking av rommet, ser instruksen under Mine bookinger\..*ikke dørkoder, alarmkoder, passord/
		);

		await page.getByLabel('Antall plasser').fill('0');
		await page.getByRole('button', { name: 'Lagre rommet' }).click();
		const summary = page.getByRole('alert');
		await expect(summary).toBeFocused();
		await expect(summary).toContainText(
			'Skriv antall plasser, fra 1 til 9999.'
		);

		await page.getByLabel('Antall plasser').fill('10');
		await page.getByLabel('Stenger på lørdag').selectOption({ label: '18:00' });
		await page.getByLabel(/^Instruks/).fill('Lukk vinduene når dere går.');
		await page.getByRole('button', { name: 'Lagre rommet' }).click();
		await expect(toast(page)).toContainText('Møterom 2 er lagret.');
		await expectAccessible(page);

		await page.reload();
		await page
			.getByRole('listitem', { name: 'Møterom 2' })
			.getByRole('button', { name: 'Rediger' })
			.click();
		await expect(page.getByLabel('Antall plasser')).toHaveValue('10');
		await expect(page.getByLabel('Stenger på lørdag')).toHaveValue('1080');
		await expect(page.getByLabel(/^Instruks/)).toHaveValue(
			'Lukk vinduene når dere går.'
		);
	});

	test('adds and removes a closed day', async ({ page }) => {
		// A Friday in six weeks, when the example data has no bookings in Barnerom.
		const date = nextWeekday(4 + 35);
		await openRooms(page);
		await page
			.getByRole('listitem', { name: 'Barnerom' })
			.getByRole('button', { name: 'Rediger' })
			.click();

		const panel = page.getByRole('form', {
			name: 'Legg til stengt dag eller sperret tid',
		});
		await panel.getByLabel('Dato').fill(date);
		await panel.getByLabel('Sperret').check();
		await panel.getByLabel('Hele dagen').uncheck();
		await panel.getByLabel('Fra').selectOption({ label: '10:00' });
		await panel.getByLabel('Til').selectOption({ label: '12:00' });
		await panel.getByLabel(/^Begrunnelse/).fill('Rengjøring');
		await panel.getByRole('button', { name: 'Legg til' }).click();

		await expect(toast(page)).toContainText('Unntaket er lagret.');
		const closure = page
			.getByRole('region', { name: 'Stengte dager og sperrede tider' })
			.getByRole('listitem')
			.filter({ hasText: 'Rengjøring' });
		await expect(closure).toContainText('10:00–12:00');
		await expect(closure).toContainText('Sperret · Rengjøring');

		await closure.getByRole('button', { name: /^Fjern / }).click();
		await expect(toast(page)).toContainText('Unntaket er fjernet.');
		await expect(closure).toHaveCount(0);
	});

	test('creates a room that can be turned off', async ({ page }) => {
		await openRooms(page);
		await page.getByRole('button', { name: 'Nytt rom' }).click();
		await expect(page.getByRole('heading', { name: 'Nytt rom' })).toBeFocused();

		await page.getByLabel('Navn').fill('Lesesal');
		await page.getByLabel('Antall plasser').fill('6');
		await page.getByLabel('Åpent på søndag').uncheck();
		await page.getByRole('button', { name: 'Opprett rommet' }).click();
		await expect(toast(page)).toContainText('Lesesal er lagret.');
		await expect(
			page.getByRole('heading', { name: 'Rediger Lesesal' })
		).toBeFocused();

		await page.getByLabel('Rommet kan bookes').uncheck();
		await page.getByRole('button', { name: 'Lagre rommet' }).click();
		await expect(toast(page)).toContainText('Lesesal er lagret.');

		await page.getByRole('button', { name: 'Tilbake til rommene' }).click();
		await expect(page.getByRole('listitem', { name: 'Lesesal' })).toContainText(
			'Kan ikke bookes'
		);
	});
});

test.describe('Room setup (mobile)', () => {
	as('admin');
	test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 640, 'Mobile only');

	test('fits the screen', async ({ page }) => {
		await openRooms(page);
		await page
			.getByRole('listitem', { name: 'Gymsal' })
			.getByRole('button', { name: 'Rediger' })
			.click();
		const width = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		expect(width).toBeLessThanOrEqual(360);
		await expectAccessible(page);
	});
});
