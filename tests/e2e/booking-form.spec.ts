import type { Page } from '@playwright/test';

import {
	as,
	expect,
	expectAccessible,
	nextWeekday,
	openBooking,
	test,
} from './helpers';

const TUESDAY = nextWeekday(1);
const THURSDAY = nextWeekday(3);

function cell(page: Page, name: RegExp) {
	return page.getByRole('grid').getByRole('button', { name });
}

test.describe('Booking form', () => {
	as('medlem');
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Desktop only');

	test('books a free time in a room that approves automatically', async ({
		page,
	}) => {
		await openBooking(page, TUESDAY);
		await cell(page, /^Møterom 2, 14:00–14:30, Ledig/).click();

		const dialog = page.getByRole('dialog', { name: 'Ny booking' });
		await expect(dialog.getByLabel('Rom')).toHaveValue(/\d+/);
		await expect(dialog.getByLabel('Fra')).toHaveValue('840');
		await expect(dialog.getByLabel('Til')).toHaveValue('900');
		await expect(dialog.getByRole('status')).toContainText('Autogodkjennes');

		await dialog.getByLabel('Antall personer').fill('4');
		await dialog.getByLabel('Formål').fill('Planleggingsmøte');
		await expect(dialog).toContainText('16 av 200 tegn');
		await dialog.getByRole('button', { name: 'Book rommet' }).click();

		await expect(dialog).toBeHidden();
		await expect(page.getByRole('status').first()).toContainText(
			'Bookingen er bekreftet. Du får SMS.'
		);
		await expect(
			cell(page, /^Møterom 2, 14:00–15:00, Din booking/)
		).toBeVisible();
	});

	test('previews a weekly series and leaves out closed dates', async ({
		page,
	}) => {
		await openBooking(page, TUESDAY);
		await cell(page, /^Gymsal, 20:00–20:30, Ledig/).click();

		const dialog = page.getByRole('dialog', { name: 'Ny booking' });
		await dialog.getByLabel('Ukentlig').check();
		await dialog.getByRole('spinbutton', { name: 'Antall ganger' }).fill('3');
		await dialog.getByLabel('Antall personer').fill('20');

		const preview = dialog.getByRole('region', {
			name: 'Forhåndsvisning av forekomster',
		});
		await expect(preview).toContainText('2 ledige · 0 konflikter · 1 utelates');
		await expect(preview.getByRole('listitem')).toHaveText([
			/Ledig/,
			/Utenfor åpningstid – utelates/,
			/Ledig/,
		]);
		// Gymsal needs approval, so everything goes to the administrator.
		await expect(dialog.getByRole('status')).toContainText(
			'Krever godkjenning'
		);

		await dialog.getByRole('button', { name: 'Send 2 forespørsler' }).click();

		await expect(page.getByRole('status').first()).toContainText(
			'2 forespørsler er sendt til admin. Du får SMS når de er behandlet. 1 dato ble utelatt fordi rommet er stengt.'
		);
		await expect(
			cell(page, /^Gymsal, 20:00–21:00, Forespurt\. Forespørselen din venter/)
		).toBeVisible();
	});

	test('sends a request when the time is booked', async ({ page }) => {
		await openBooking(page, THURSDAY);
		await cell(page, /^Møterom 1, 09:00–10:00, Opptatt/).click();

		const dialog = page.getByRole('dialog', { name: 'Ny booking' });
		await expect(dialog).toContainText('Tidsrommet er opptatt');
		await expect(dialog.getByRole('status')).toContainText('Går til admin');
		await dialog.getByLabel('Antall personer').fill('6');

		await dialog.getByRole('button', { name: 'Send forespørsel' }).click();

		await expect(page.getByRole('status').first()).toContainText(
			'Forespørselen er sendt til admin.'
		);
	});

	test('shows errors next to the fields', async ({ page }) => {
		await openBooking(page, THURSDAY);
		await cell(page, /^Barnerom, 12:00–12:30, Ledig/).click();
		const dialog = page.getByRole('dialog', { name: 'Ny booking' });

		await dialog.getByLabel('Til').selectOption({ label: '12:00' });
		await expect(dialog.getByLabel('Til')).toHaveAttribute(
			'aria-invalid',
			'true'
		);
		await expect(dialog.getByLabel('Til')).toHaveAccessibleDescription(
			'Til-tiden må være etter fra-tiden.'
		);

		// Barnerom has room for 20.
		await dialog.getByLabel('Antall personer').fill('30');
		await expect(
			dialog.getByLabel('Antall personer')
		).toHaveAccessibleDescription('Barnerom har plass til 20 personer.');

		// Barnerom closes at 20:00.
		await dialog.getByLabel('Fra').selectOption({ label: '20:00' });
		await expect(dialog.getByLabel('Fra')).toHaveAccessibleDescription(
			/Rommet er stengt i valgt tidsrom/
		);
		await expectAccessible(page);
	});

	test('can be closed without booking', async ({ page }) => {
		await openBooking(page, THURSDAY);
		const opener = cell(page, /^Kafé, 12:00–12:30, Ledig/);
		await opener.click();

		await page
			.getByRole('dialog', { name: 'Ny booking' })
			.getByRole('button', { name: 'Avbryt' })
			.click();

		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(opener).toBeFocused();
	});

	test('has no accessibility violations with a series', async ({ page }) => {
		await openBooking(page, THURSDAY);
		await cell(page, /^Storsalen, 12:00–12:30, Ledig/).click();
		const dialog = page.getByRole('dialog', { name: 'Ny booking' });
		await dialog.getByLabel('Annenhver uke').check();
		await expect(
			dialog.getByRole('region', { name: 'Forhåndsvisning av forekomster' })
		).toBeVisible();

		await expectAccessible(page);
	});
});

test.describe('Booking form without a phone number', () => {
	as('medlem-uten-tlf');
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Desktop only');

	test('asks for a mobile number and saves it', async ({ page }) => {
		await openBooking(page, THURSDAY);
		await cell(page, /^Møterom 2, 16:00–16:30, Ledig/).click();
		const dialog = page.getByRole('dialog', { name: 'Ny booking' });

		await dialog.getByRole('button', { name: 'Book rommet' }).click();

		const summary = dialog.getByRole('alert');
		await expect(summary).toBeFocused();
		await expect(summary).toContainText('Rett opp før du sender');
		await expect(summary.getByRole('link')).toHaveText([
			'Skriv hvor mange personer som skal bruke rommet.',
			'Skriv et norsk mobilnummer med 8 siffer.',
		]);
		await summary
			.getByRole('link', { name: 'Skriv et norsk mobilnummer med 8 siffer.' })
			.click();
		await expect(dialog.getByLabel('Mobilnummer')).toBeFocused();
		await expectAccessible(page);

		await dialog.getByLabel('Mobilnummer').fill('412 34 567');
		await dialog.getByLabel('Antall personer').fill('3');
		await dialog.getByRole('button', { name: 'Book rommet' }).click();
		await expect(page.getByRole('status').first()).toContainText(
			'Bookingen er bekreftet.'
		);

		// The number is saved, so the next booking does not ask again.
		await cell(page, /^Møterom 2, 18:00–18:30, Ledig/).click();
		await expect(
			page.getByRole('dialog').getByLabel('Mobilnummer')
		).toHaveCount(0);
	});
});

test.describe('Booking form (mobile)', () => {
	as('medlem');
	test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 640, 'Mobile only');

	test('fits the screen and has no accessibility violations', async ({
		page,
	}) => {
		await openBooking(page, THURSDAY);
		await page
			.getByRole('list', { name: /^Tider i Storsalen/ })
			.getByRole('button', { name: /^Storsalen, 12:00–12:30, Ledig/ })
			.click();

		const dialog = page.getByRole('dialog', { name: 'Ny booking' });
		await dialog.getByLabel('Ukentlig').check();
		await expect(
			dialog.getByRole('region', { name: 'Forhåndsvisning av forekomster' })
		).toBeVisible();

		const box = await dialog.boundingBox();
		expect(box!.width).toBeLessThanOrEqual(360);
		await dialog
			.getByRole('button', { name: /Send|Book/ })
			.last()
			.scrollIntoViewIfNeeded();
		await expect(
			dialog.getByRole('button', { name: /Send|Book/ }).last()
		).toBeInViewport();
		await expectAccessible(page);
	});
});
