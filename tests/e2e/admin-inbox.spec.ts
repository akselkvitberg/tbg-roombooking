import { expect, Page } from '@playwright/test';

import { as, expectAccessible, test } from './helpers';

/**
 * The tests change the example data, so they use requests that the other
 * tests do not look at: Møterom 1 next Thursday (proposal only), Storsalen
 * next Friday and the Tuesday series in Gymsal.
 * @param page
 */
async function openInbox(page: Page) {
	await page.route(
		/fonts\.googleapis|fonts\.gstatic|design\.bcc\.no|livereload|gravatar/,
		(route) => route.abort()
	);
	await page.goto('/rombooking/#rombooking=requests');
	await expect(page.getByText('Henter forespørsler')).toHaveCount(0);
}

const queue = (page: Page) =>
	page.getByRole('navigation', { name: 'Forespørsler som venter' });

const toast = (page: Page) =>
	page.locator('.creo-rombooking-admin > [role=status]');

test.describe('Admin inbox', () => {
	as('admin');
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Desktop only');

	test('lists conflicts first and shows them side by side', async ({
		page,
	}) => {
		await openInbox(page);

		const headings = queue(page).getByRole('heading', { level: 3 });
		await expect(headings.first()).toHaveText(/^Konflikter/);

		await queue(page)
			.getByRole('button', { name: /^Møterom 1/ })
			.click();
		const detail = page.getByRole('region', { name: /^Møterom 1 · Torsdag/ });
		await expect(detail.getByRole('heading', { level: 3 })).toBeFocused();

		await expect(
			detail.getByRole('article', { name: 'Ny forespørsel' })
		).toContainText('Planleggingsmøte for basaren');
		await expect(
			detail.getByRole('article', { name: 'Eksisterende booking' })
		).toContainText('Per Demodal');
		await expect(detail).toContainText('Overlapper 09:00–10:00');
		await expect(
			detail.getByRole('button', { name: 'Foreslå Møterom 2' })
		).toBeVisible();

		await expectAccessible(page);
	});

	test('asks for a reason before cancelling the existing booking', async ({
		page,
	}) => {
		await openInbox(page);
		await queue(page)
			.getByRole('button', { name: /^Møterom 1/ })
			.click();
		const opener = page.getByRole('button', {
			name: 'Godkjenn og avbestill eksisterende',
		});
		await opener.click();

		const dialog = page.getByRole('dialog', {
			name: 'Avbestille bookingen til Per Demodal?',
		});
		const reason = dialog.getByLabel(/^Begrunnelse/);
		await expect(reason).toBeFocused();
		await expect(reason).toHaveAccessibleDescription(
			/Sendes på SMS til Per Demodal\. Ikke skriv sensitive opplysninger, koder eller passord\./
		);

		await dialog.getByRole('button', { name: 'Godkjenn og avbestill' }).click();
		await expect(reason).toHaveAttribute('aria-invalid', 'true');
		await expect(reason).toHaveAccessibleDescription(
			/^Skriv en begrunnelse\. Den sendes på SMS\./
		);

		await dialog.getByLabel('Legg ved et forslag om et annet rom').check();
		await expect(dialog.getByRole('status')).toContainText('Ledig');
		await expectAccessible(page);

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(opener).toBeFocused();
	});

	test('proposes another room', async ({ page }) => {
		await openInbox(page);
		await queue(page)
			.getByRole('button', { name: /^Møterom 1/ })
			.click();
		await page.getByRole('button', { name: 'Foreslå Møterom 2' }).click();

		const form = page.getByRole('form', {
			name: 'Foreslå annet rom eller tid til Mari Testrud',
		});
		await expect(form.getByLabel('Rom')).toBeFocused();
		await expect(form.getByRole('status')).toContainText('Ledig');
		await form.getByLabel(/^Melding/).fill('Møterom 2 har skjerm.');
		await form.getByRole('button', { name: 'Send forslag' }).click();

		await expect(toast(page)).toContainText('Forslaget er sendt: Møterom 2');
		await expect(
			queue(page).getByRole('button', { name: /^Møterom 1/ })
		).toHaveCount(0);
	});

	test('approves a request that needs approval', async ({ page }) => {
		await openInbox(page);
		await queue(page)
			.getByRole('button', { name: /^Storsalen.*Til godkjenning/ })
			.click();
		await expect(page.getByText('Ingen konflikt')).toBeVisible();

		await page.getByRole('button', { name: 'Godkjenn', exact: true }).click();
		await expect(toast(page)).toContainText(
			'Bookingen er godkjent. Lars Eksempelsen får SMS.'
		);

		await page.getByRole('tab', { name: 'SMS-logg' }).click();
		await expect(page.getByRole('listitem').first()).toContainText(
			'Rombooking: Forespørselen din er godkjent. Storsalen, fredag'
		);
		await expectAccessible(page);
	});

	test('handles a series date by date and as a whole', async ({ page }) => {
		await openInbox(page);
		await queue(page)
			.getByRole('button', { name: /^Gymsal/ })
			.click();

		const table = page.getByRole('table');
		await expect(table.getByRole('row')).toHaveCount(9);
		await expect(
			table.getByRole('row').filter({ hasText: 'Utenfor åpningstid' })
		).toHaveCount(1);

		const first = table.getByRole('row').nth(1);
		const date = (await first.getByRole('rowheader').innerText()).trim();
		await first.getByRole('button', { name: `Godkjenn ${date}` }).click();
		await expect(toast(page)).toContainText('er godkjent');
		await expect(table.getByRole('row').nth(1)).toContainText('Godkjent');

		await page.getByRole('button', { name: /^Godkjenn alle ledige/ }).click();
		await expect(toast(page)).toContainText(
			'Eva Prøvesen får SMS når hele serien er behandlet.'
		);

		await page.getByRole('button', { name: 'Avslå resten av serien' }).click();
		await page.getByLabel(/^Begrunnelse/).fill('Gymsalen er opptatt.');
		await page
			.getByRole('button', { name: 'Avslå resten', exact: true })
			.click();
		await expect(toast(page)).toContainText('Resten av serien er avslått.');
		await expect(
			queue(page).getByRole('button', { name: /^Gymsal/ })
		).toHaveCount(0);
	});
});

test.describe('Admin inbox (mobile)', () => {
	as('admin');
	test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 640, 'Mobile only');

	test('fits the screen and has no accessibility violations', async ({
		page,
	}) => {
		await openInbox(page);
		const width = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		expect(width).toBeLessThanOrEqual(360);
		await expectAccessible(page);
	});
});

test.describe('Admin tabs', () => {
	as('medlem');

	test('are not shown to members', async ({ page }) => {
		await page.goto('/rombooking/#rombooking=requests');
		await expect(page.getByRole('tab')).toHaveText([
			'Book rom',
			'Mine bookinger',
		]);
		await expect(page.getByRole('tab', { name: 'Book rom' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
	});
});
