/**
 * Date helpers for `Y-m-d` strings. Dates are handled as UTC midnight, so
 * that the browser's timezone never shifts a date by one day.
 */

export function parseDate(date: string): Date {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

export function toDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
	const result = parseDate(date);
	result.setUTCDate(result.getUTCDate() + days);
	return toDateString(result);
}

export function isDateString(value: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		toDateString(parseDate(value)) === value
	);
}

function format(
	date: string,
	locale: string,
	options: Intl.DateTimeFormatOptions
): string {
	return new Intl.DateTimeFormat(locale, {
		...options,
		timeZone: 'UTC',
	}).format(parseDate(date));
}

/**
 * E.g. «Onsdag 23. september 2026».
 *
 * @param date   The date.
 * @param locale The locale, e.g. `nb-NO`.
 */
export function formatLongDate(date: string, locale: string): string {
	return capitalize(
		format(date, locale, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		})
	);
}

/**
 * E.g. «onsdag 23. september».
 *
 * @param date   The date.
 * @param locale The locale, e.g. `nb-NO`.
 */
export function formatDayAndMonth(date: string, locale: string): string {
	return format(date, locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	});
}

/**
 * E.g. «08:30».
 *
 * @param minutes Minutes after midnight.
 */
export function formatTime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(
		2,
		'0'
	)}`;
}

/**
 * E.g. «08:00–09:30».
 *
 * @param start Minutes after midnight.
 * @param end   Minutes after midnight.
 */
export function formatTimeRange(start: number, end: number): string {
	return `${formatTime(start)}–${formatTime(end)}`;
}

export function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Converts a WordPress locale (`nb_NO`) to a BCP 47 tag (`nb-NO`).
 *
 * @param locale The WordPress locale.
 */
export function toLanguageTag(locale: string): string {
	return locale.replace('_', '-');
}

/**
 * E.g. «lør. 26. sep.».
 *
 * @param date   The date.
 * @param locale The locale, e.g. `nb-NO`.
 */
export function formatShortDate(date: string, locale: string): string {
	return format(date, locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	});
}

/**
 * E.g. «26. sep.».
 *
 * @param date   The date.
 * @param locale The locale, e.g. `nb-NO`.
 */
export function formatDayMonth(date: string, locale: string): string {
	return format(date, locale, { day: 'numeric', month: 'short' });
}

/**
 * The Monday of the week a date is in.
 *
 * @param date The date.
 */
export function startOfWeek(date: string): string {
	const day = parseDate(date).getUTCDay();
	return addDays(date, -((day + 6) % 7));
}

/**
 * The ISO 8601 week number, as used in Norway.
 *
 * @param date The date.
 */
export function isoWeek(date: string): number {
	const thursday = parseDate(addDays(startOfWeek(date), 3));
	const firstOfYear = Date.UTC(thursday.getUTCFullYear(), 0, 1);
	return Math.floor((thursday.getTime() - firstOfYear) / 86400000 / 7) + 1;
}

/**
 * E.g. «21.–27. sep. 2026» or «28. sep.–4. okt. 2026», for the week starting on a Monday.
 *
 * @param monday The Monday.
 * @param locale The locale, e.g. `nb-NO`.
 */
export function formatWeekRange(monday: string, locale: string): string {
	return new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	}).formatRange(parseDate(monday), parseDate(addDays(monday, 6)));
}
