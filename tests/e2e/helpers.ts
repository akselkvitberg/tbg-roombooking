import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test as base } from '@playwright/test';

import { storageState, User } from './global-setup';

/**
 * Wednesday next week, as `Y-m-d`. The example data has the same weekly
 * bookings every week, and next week has not started yet, so no time has
 * passed.
 */
export function nextWednesday(): string {
	const date = new Date();
	const daysSinceMonday = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - daysSinceMonday + 7 + 2);
	return date.toLocaleDateString('sv-SE');
}

export function nextWeekday(offsetFromMonday: number): string {
	const date = new Date();
	const daysSinceMonday = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - daysSinceMonday + 7 + offsetFromMonday);
	return date.toLocaleDateString('sv-SE');
}

/**
 * Logs in as a test user.
 *
 * @param user The user.
 */
export function as(user: User) {
	base.use({ storageState: storageState(user) });
}

export async function openBooking(page: Page, date?: string) {
	// Keep tests independent of external resources the theme loads.
	await page.route(
		/fonts\.googleapis|fonts\.gstatic|design\.bcc\.no|livereload|gravatar/,
		(route) => route.abort()
	);
	await page.goto('/rombooking/');
	if (date) {
		await page.getByLabel('Dato', { exact: true }).fill(date);
	}
	await expect(page.getByText('Laster ledige tider')).toHaveCount(0);
}

/**
 * Checks the room booking app for WCAG 2.1 A and AA violations.
 *
 * @param page The page.
 */
export async function expectAccessible(page: Page) {
	const results = await new AxeBuilder({ page })
		.include('.creo-rombooking')
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
}

export const test = base;
export { expect };
