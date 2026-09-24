import {
	as,
	expect,
	expectAccessible,
	nextWednesday,
	nextWeekday,
	openBooking,
	test,
} from './helpers';

test.describe('Day view (desktop)', () => {
	as('medlem');
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 640, 'Desktop only');

	test('shows every room with statuses as text and icon', async ({ page }) => {
		await openBooking(page, nextWednesday());

		const grid = page.getByRole('grid');
		await expect(grid.getByRole('rowheader')).toHaveText([
			/Storsalen/,
			/Kafé/,
			/Møterom 1/,
			/Møterom 2/,
			/Barnerom/,
			/Gymsal/,
		]);
		await expect(
			grid.getByRole('button', { name: 'Storsalen, 18:00–21:00, Opptatt.' })
		).toBeVisible();
		await expect(
			grid.getByRole('button', { name: 'Kafé, 17:30–19:00, Din booking.' })
		).toBeVisible();
		await expect(
			grid.getByRole('button', {
				name: /^Gymsal, 08:00–15:00, Stengt\. Utenfor åpningstid/,
			})
		).toHaveAttribute('aria-disabled', 'true');
		await expect(
			grid.getByRole('button', { name: /^Barnerom, 20:00–22:00, Stengt/ })
		).toBeVisible();
		await expect(
			grid.getByRole('button', {
				name: /^Storsalen, 08:00–08:30, Ledig\. Velg for å booke/,
			})
		).toBeVisible();
	});

	test('never shows who booked or why', async ({ page }) => {
		await openBooking(page, nextWeekday(5));

		await expect(
			page
				.getByRole('grid')
				.getByRole('button', { name: /^Storsalen, 11:00–15:00, Opptatt/ })
		).toBeVisible();
		for (const secret of [
			'Tone Eksempel',
			'Bursdagsfeiring',
			'Idrettslaget',
			'Trening',
		]) {
			await expect(page.locator('.creo-rombooking')).not.toContainText(secret);
		}
	});

	test('moves with the keyboard, with one cell in the tab order', async ({
		page,
	}) => {
		await openBooking(page, nextWednesday());
		const grid = page.getByRole('grid');

		await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1);
		await grid.locator('button[tabindex="0"]').focus();
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Storsalen, 08:00–08:30/
		);

		await page.keyboard.press('ArrowRight');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Storsalen, 08:30–09:00/
		);

		await page.keyboard.press('ArrowDown');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Kafé, 08:30–09:00/
		);

		await page.keyboard.press('ArrowDown');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Møterom 1, 08:30–09:00/
		);

		// Møterom 1 is booked 09:00–10:00; moving right lands on the whole booking.
		await page.keyboard.press('ArrowRight');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Møterom 1, 09:00–10:00, Opptatt/
		);

		await page.keyboard.press('End');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Møterom 1, 21:30–22:00/
		);

		await page.keyboard.press('Control+Home');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Storsalen, 08:00–08:30/
		);

		await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1);
	});

	test('changes day with Page Down and keeps the focus in the grid', async ({
		page,
	}) => {
		await openBooking(page, nextWednesday());
		await page.getByRole('grid').locator('button[tabindex="0"]').focus();

		await page.keyboard.press('PageDown');
		await expect(
			page.getByRole('heading', { level: 2, name: /^Torsdag/ })
		).toBeVisible();
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Storsalen, 08:00–08:30/
		);
	});

	test('opens the booking dialog with Enter and returns focus on Escape', async ({
		page,
	}) => {
		await openBooking(page, nextWednesday());
		const cell = page
			.getByRole('grid')
			.getByRole('button', { name: /^Møterom 2, 12:00–12:30, Ledig/ });

		await cell.focus();
		await page.keyboard.press('Enter');

		const dialog = page.getByRole('dialog', { name: 'Ny booking' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByLabel('Rom')).toHaveValue(/\d+/);
		await expect(dialog.getByLabel('Rom').locator('option:checked')).toHaveText(
			/^Møterom 2/
		);
		// One hour is suggested when the next half hour is free too.
		await expect(dialog.getByLabel('Fra')).toHaveValue('720');
		await expect(dialog.getByLabel('Til')).toHaveValue('780');
		await expectAccessible(page);

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(cell).toBeFocused();
	});

	test('tells that a request goes to the administrator when the time is booked', async ({
		page,
	}) => {
		await openBooking(page, nextWednesday());

		await page
			.getByRole('grid')
			.getByRole('button', { name: /^Storsalen, 18:00–21:00, Opptatt/ })
			.click();

		await expect(page.getByRole('dialog')).toContainText(
			'Tidsrommet er opptatt'
		);
		await expect(page.getByRole('dialog')).toContainText(
			'Forespørselen sendes til admin'
		);
	});

	test('does nothing when a closed time is chosen', async ({ page }) => {
		await openBooking(page, nextWednesday());

		await page
			.getByRole('grid')
			.getByRole('button', { name: /^Gymsal, 08:00–15:00, Stengt/ })
			.click({ force: true });

		await expect(page.getByRole('dialog')).toHaveCount(0);
	});

	test('has no accessibility violations', async ({ page }) => {
		await openBooking(page, nextWednesday());
		await expectAccessible(page);
	});
});

test.describe('Day view in dark mode', () => {
	as('medlem');
	test.use({ colorScheme: 'dark' });

	test('has no accessibility violations', async ({ page }) => {
		await openBooking(page, nextWednesday());
		await expect(page.locator('html')).toHaveClass(/dark/);
		await expectAccessible(page);
	});
});

test.describe('Day view (mobile)', () => {
	as('medlem');
	test.skip(({ viewport }) => (viewport?.width ?? 1000) >= 640, 'Mobile only');

	test('shows one room at a time as a list', async ({ page }) => {
		await openBooking(page, nextWednesday());

		await expect(page.getByRole('grid')).toHaveCount(0);
		const list = page.getByRole('list', { name: /^Tider i Storsalen/ });
		await expect(
			list.getByRole('button', { name: /^Storsalen, 18:00–21:00, Opptatt/ })
		).toBeVisible();

		await page
			.getByLabel('Rom', { exact: true })
			.selectOption({ label: 'Kafé (60 plasser · auto)' });
		await expect(
			page
				.getByRole('list', { name: /^Tider i Kafé/ })
				.getByRole('button', { name: /^Kafé, 17:30–19:00, Din booking/ })
		).toBeVisible();
	});

	test('moves up and down with the arrow keys', async ({ page }) => {
		await openBooking(page, nextWednesday());
		const list = page.getByRole('list', { name: /^Tider i Storsalen/ });

		await list.locator('button[tabindex="0"]').focus();
		await page.keyboard.press('ArrowDown');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Storsalen, 08:30–09:00/
		);
		await page.keyboard.press('End');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Storsalen, 21:30–22:00/
		);
		await page.keyboard.press('ArrowUp');
		await expect(page.locator(':focus')).toHaveAccessibleName(
			/^Storsalen, 21:00–21:30/
		);
	});

	test('has no accessibility violations', async ({ page }) => {
		await openBooking(page, nextWednesday());
		await expectAccessible(page);
	});
});

test.describe('Access', () => {
	test('asks logged-out visitors to log in', async ({ page }) => {
		await openBooking(page);
		await expect(
			page.getByText('Du må være innlogget for å booke rom.')
		).toBeVisible();
		await expectAccessible(page);
	});

	test.describe('non-members', () => {
		as('gjest');

		test('are told that booking is for members', async ({ page }) => {
			await openBooking(page);
			await expect(
				page.getByText(/bare tilgjengelig for medlemmer/)
			).toBeVisible();
		});
	});
});
