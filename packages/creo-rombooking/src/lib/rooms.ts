import { __ } from '@wordpress/i18n';

import type { OpeningHours, RoomSetup } from '../api/roomTypes';

/** Monday first, as in Norway; 0 is Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

export const INSTRUCTIONS_MAX = 1000;
export const DESCRIPTION_MAX = 300;

/**
 * The name of a weekday, e.g. «mandag».
 *
 * @param weekday 0 = Sunday.
 * @param locale  The locale.
 */
export function weekdayName(weekday: number, locale: string): string {
	// 7 January 2024 was a Sunday.
	return new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(2024, 0, 7 + weekday)));
}

export interface DayHours {
	weekday: number;
	open: boolean;
	start: number;
	end: number;
}

/**
 * One row per weekday for the form, Monday first. A closed day keeps
 * 08:00–22:00, so that opening it starts from the whole day.
 *
 * @param hours The room's opening hours.
 */
export function toDayHours(hours: OpeningHours[]): DayHours[] {
	return WEEKDAYS.map((weekday) => {
		const interval = hours.find((h) => h.weekday === weekday);
		return interval
			? { weekday, open: true, start: interval.start, end: interval.end }
			: { weekday, open: false, start: 480, end: 1320 };
	});
}

export function fromDayHours(days: DayHours[]): OpeningHours[] {
	return days
		.filter((day) => day.open)
		.map(({ weekday, start, end }) => ({ weekday, start, end }));
}

/**
 * Swaps a room with its neighbour, for moving it up or down in the list.
 *
 * @param rooms     The rooms in order.
 * @param index     The room to move.
 * @param direction -1 for up, 1 for down.
 */
export function move<T>(rooms: T[], index: number, direction: -1 | 1): T[] {
	const target = index + direction;
	if (target < 0 || target >= rooms.length) {
		return rooms;
	}
	const result = [...rooms];
	[result[index], result[target]] = [result[target], result[index]];
	return result;
}

export function emptyRoom(): Omit<RoomSetup, 'id'> {
	return {
		name: '',
		description: '',
		capacity: 10,
		approval: 'auto',
		active: true,
		imageId: 0,
		imageUrl: null,
		instructions: '',
		openingHours: WEEKDAYS.map((weekday) => ({
			weekday,
			start: 480,
			end: 1320,
		})),
		closures: [],
	};
}

export function closureTypeLabel(type: 'closed' | 'blocked'): string {
	return type === 'closed'
		? __('Closed', 'creo-rombooking')
		: __('Blocked', 'creo-rombooking');
}
