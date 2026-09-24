import {
	approvalMessage,
	initialForm,
	submitLabel,
	validateForm,
	withStart,
} from './bookingForm';

const form = initialForm({
	roomId: 1,
	date: '2026-09-30',
	start: 600,
	end: 660,
	status: 'free',
});

describe('initialForm', () => {
	it('starts with the chosen time, no repetition and an end date eight weeks later', () => {
		expect(form).toMatchObject({
			roomId: 1,
			date: '2026-09-30',
			start: 600,
			end: 660,
			repeat: 'none',
			endMode: 'count',
			count: 6,
			endDate: '2026-11-25',
		});
	});
});

describe('withStart', () => {
	it('keeps the end time when it is still after the start', () => {
		expect(withStart(form, 630, 1320)).toMatchObject({ start: 630, end: 660 });
	});

	it('moves the end time and keeps the length', () => {
		expect(withStart(form, 700, 1320)).toMatchObject({ start: 700, end: 760 });
	});

	it('does not move the end time past the end of the day', () => {
		expect(withStart(form, 1290, 1320)).toMatchObject({
			start: 1290,
			end: 1320,
		});
	});
});

describe('validateForm', () => {
	it('accepts a valid form', () => {
		expect(validateForm(form)).toEqual({});
	});

	it('requires the end to be after the start', () => {
		expect(validateForm({ ...form, end: 600 })).toHaveProperty('end');
	});

	it('requires between 2 and 26 times', () => {
		const repeating = { ...form, repeat: 'weekly' as const };
		expect(validateForm({ ...repeating, count: 1 })).toHaveProperty('count');
		expect(validateForm({ ...repeating, count: 27 })).toHaveProperty('count');
		expect(validateForm({ ...repeating, count: 26 })).toEqual({});
	});

	it('requires the end date to be after the start date', () => {
		const byDate = {
			...form,
			repeat: 'weekly' as const,
			endMode: 'date' as const,
		};
		expect(validateForm({ ...byDate, endDate: '2026-09-30' })).toHaveProperty(
			'endDate'
		);
		expect(validateForm({ ...byDate, endDate: '2026-10-07' })).toEqual({});
	});
});

describe('submitLabel', () => {
	const counts = (free: number, conflict: number) => ({
		free,
		conflict,
		outside: 0,
	});

	it('books right away when everything is free in an auto room', () => {
		expect(submitLabel(counts(1, 0), 'auto', false)).toBe('Book the room');
		expect(submitLabel(counts(6, 0), 'auto', true)).toBe('Book 6 times');
	});

	it('sends requests when the room needs approval or the time is booked', () => {
		expect(submitLabel(counts(1, 0), 'manual', false)).toBe('Send request');
		expect(submitLabel(counts(0, 1), 'auto', false)).toBe('Send request');
		expect(submitLabel(counts(4, 2), 'manual', true)).toBe('Send 6 requests');
	});

	it('does both when some dates conflict in an auto room', () => {
		expect(submitLabel(counts(4, 2), 'auto', true)).toBe(
			'Book and send request'
		);
	});
});

describe('approvalMessage', () => {
	it('tells when the room approves automatically', () => {
		expect(
			approvalMessage(
				{ free: 1, conflict: 0, outside: 0 },
				'auto',
				'Kafé',
				false
			)
		).toMatchObject({ kind: 'ok', title: 'Approved automatically' });
	});

	it('tells when the room needs approval', () => {
		expect(
			approvalMessage(
				{ free: 1, conflict: 0, outside: 0 },
				'manual',
				'Storsalen',
				false
			)
		).toMatchObject({
			kind: 'info',
			text: expect.stringContaining(
				'Storsalen is approved by the administrator'
			),
		});
	});

	it('warns about conflicts in a series', () => {
		expect(
			approvalMessage(
				{ free: 4, conflict: 2, outside: 1 },
				'auto',
				'Kafé',
				true
			)
		).toMatchObject({
			kind: 'warning',
			text: '2 of 6 dates are in conflict and are sent to the administrator. The available ones are confirmed right away. You get a text message.',
		});
	});
});
