import { __, sprintf } from '@wordpress/i18n';

import type { MyBooking } from '../api/mineTypes';

import { formatDayAndMonth } from './dates';

export type Entry =
	| { kind: 'single'; key: string; booking: MyBooking }
	| {
			kind: 'series';
			key: string;
			seriesId: number;
			/** The dates of the series from today on, first first. */
			bookings: MyBooking[];
	  };

/**
 * Groups the dates of a series into one entry, placed at its next date, so
 * that a weekly booking does not fill the list.
 *
 * @param bookings The bookings, sorted by date and time.
 */
export function groupBookings(bookings: MyBooking[]): Entry[] {
	const entries: Entry[] = [];
	const series = new Map<number, Entry & { kind: 'series' }>();

	for (const booking of bookings) {
		if (booking.seriesId === null) {
			entries.push({ kind: 'single', key: `booking-${booking.id}`, booking });
			continue;
		}
		const existing = series.get(booking.seriesId);
		if (existing) {
			existing.bookings.push(booking);
			continue;
		}
		const entry = {
			kind: 'series' as const,
			key: `series-${booking.seriesId}`,
			seriesId: booking.seriesId,
			bookings: [booking],
		};
		series.set(booking.seriesId, entry);
		entries.push(entry);
	}

	// A series with one date left is shown as a single booking.
	return entries.map((entry) =>
		entry.kind === 'series' && entry.bookings.length === 1
			? { kind: 'single', key: entry.key, booking: entry.bookings[0] }
			: entry
	);
}

/**
 * The bookings a «this and all later» cancellation covers.
 *
 * @param bookings All bookings in the series.
 * @param from     The chosen booking.
 */
export function laterInSeries(
	bookings: MyBooking[],
	from: MyBooking
): MyBooking[] {
	return bookings.filter(
		(booking) =>
			booking.seriesId === from.seriesId &&
			booking.date >= from.date &&
			booking.cancellable
	);
}

/**
 * Why a booking is no longer active, e.g. «You declined the proposal».
 *
 * @param booking A declined or cancelled booking.
 */
export function closedText(booking: MyBooking): string {
	if (booking.action === 'expired') {
		return __('The proposal was not answered in time', 'creo-rombooking');
	}
	if (booking.action === 'declined') {
		return __('You declined the proposal', 'creo-rombooking');
	}
	if (booking.status === 'rejected') {
		return __('Declined by the administrator', 'creo-rombooking');
	}
	return booking.byMe
		? __('Cancelled by you', 'creo-rombooking')
		: __('Cancelled by the administrator', 'creo-rombooking');
}

/**
 * E.g. «friday 25 September at 14:30», from `Y-m-d H:i:s`.
 *
 * @param value  The date and time.
 * @param locale The locale.
 */
export function formatDeadline(value: string, locale: string): string {
	const [date, time] = value.split(' ');
	return sprintf(
		/* translators: 1: date, 2: time */
		__('%1$s at %2$s', 'creo-rombooking'),
		formatDayAndMonth(date, locale),
		(time ?? '').slice(0, 5)
	);
}
