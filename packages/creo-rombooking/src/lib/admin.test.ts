import type { RequestItem, SeriesOccurrence } from '../api/adminTypes';

import {
	deadlineText,
	formatDateTime,
	groupItems,
	inboxSummary,
	overlap,
	seriesCounts,
	seriesSummary,
} from './admin';

const item = (id: string, kind: RequestItem['kind']) =>
	({ id, kind }) as RequestItem;

describe('groupItems', () => {
	it('keeps conflicts, series and approvals in that order and leaves out empty groups', () => {
		const groups = groupItems([
			item('a', 'approval'),
			item('c', 'conflict'),
			item('c2', 'conflict'),
		]);
		expect(groups.map((g) => [g.kind, g.items.map((i) => i.id)])).toEqual([
			['conflict', ['c', 'c2']],
			['approval', ['a']],
		]);
	});
});

describe('inboxSummary', () => {
	it('counts waiting requests and conflicts', () => {
		expect(inboxSummary([item('a', 'approval'), item('c', 'conflict')])).toBe(
			'2 waiting · 1 conflict'
		);
	});
});

describe('formatDateTime', () => {
	it('shows the day, month and time', () => {
		expect(formatDateTime('2026-09-22 14:12:05', 'en-GB')).toBe(
			'22 Sept at 14:12'
		);
	});
});

describe('overlap', () => {
	it('returns the shared part of two times', () => {
		expect(overlap({ start: 540, end: 630 }, { start: 540, end: 600 })).toBe(
			'09:00–10:00'
		);
	});
});

describe('seriesCounts', () => {
	const occ = (
		status: SeriesOccurrence['status'],
		pending = true
	): SeriesOccurrence => ({
		date: '2026-09-29',
		bookingId: 1,
		status,
		pending,
	});

	it('counts waiting dates, left out dates and decisions', () => {
		const counts = seriesCounts([
			occ('free'),
			occ('free'),
			occ('conflict'),
			occ('closed'),
			occ('outside', false),
			occ('approved', false),
			occ('rejected', false),
		]);
		expect(counts).toEqual({
			free: 2,
			conflict: 2,
			outside: 1,
			approved: 1,
			rejected: 1,
			freePending: 2,
		});
		expect(seriesSummary(counts)).toBe(
			'2 available · 2 conflicts · 1 left out · 1 approved · 1 declined'
		);
	});
});

describe('deadlineText', () => {
	it('adds the hours and formats the time in the site timezone', () => {
		expect(
			deadlineText(48, 'en-GB', 'Europe/Oslo', new Date('2026-09-24T12:30:00Z'))
		).toBe('Saturday 26 September at 14:30');
	});
});
