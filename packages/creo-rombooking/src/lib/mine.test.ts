import type { MyBooking } from '../api/mineTypes';

import {
	closedText,
	formatDeadline,
	groupBookings,
	laterInSeries,
} from './mine';

let nextId = 1;
const booking = (
	date: string,
	seriesId: number | null = null,
	values: Partial<MyBooking> = {}
): MyBooking => ({
	id: nextId++,
	room: { id: 1, name: 'Kafé' },
	date,
	start: 600,
	end: 660,
	purpose: '',
	people: 4,
	status: 'approved',
	seriesId,
	rule: seriesId ? 'weekly' : null,
	cancellable: true,
	...values,
});

describe('groupBookings', () => {
	it('groups a series at its next date and keeps single bookings', () => {
		const list = [
			booking('2026-09-28', 7),
			booking('2026-09-29'),
			booking('2026-10-05', 7),
			booking('2026-10-12', 8),
		];
		const entries = groupBookings(list);

		expect(entries.map((e) => e.kind)).toEqual(['series', 'single', 'single']);
		expect(entries[0].kind === 'series' && entries[0].bookings).toHaveLength(2);
		// A series with one date left is shown as a single booking.
		expect(entries[2].kind === 'single' && entries[2].booking.seriesId).toBe(8);
	});
});

describe('laterInSeries', () => {
	it('covers the chosen date and later dates that can be cancelled', () => {
		const list = [
			booking('2026-09-28', 7),
			booking('2026-10-05', 7),
			booking('2026-10-12', 7, { cancellable: false }),
			booking('2026-10-19', 7),
		];
		expect(laterInSeries(list, list[1]).map((b) => b.date)).toEqual([
			'2026-10-05',
			'2026-10-19',
		]);
	});
});

describe('closedText', () => {
	it('explains why a booking is not active', () => {
		expect(
			closedText(
				booking('2026-10-01', null, { status: 'cancelled', byMe: true })
			)
		).toBe('Cancelled by you');
		expect(
			closedText(
				booking('2026-10-01', null, { status: 'cancelled', byMe: false })
			)
		).toBe('Cancelled by the administrator');
		expect(
			closedText(booking('2026-10-01', null, { status: 'rejected' }))
		).toBe('Declined by the administrator');
		expect(
			closedText(
				booking('2026-10-01', null, {
					status: 'cancelled',
					action: 'expired',
					byMe: true,
				})
			)
		).toBe('The proposal was not answered in time');
	});
});

describe('formatDeadline', () => {
	it('shows the day and time', () => {
		expect(formatDeadline('2026-09-25 14:30:00', 'en-GB')).toBe(
			'Friday 25 September at 14:30'
		);
	});
});
