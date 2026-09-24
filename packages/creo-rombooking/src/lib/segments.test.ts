import type { Period } from '../api/types';

import { isActionable, suggestedRange, toSegments } from './segments';

const periods: Period[] = [
	{ start: 480, end: 600, status: 'free' },
	{ start: 600, end: 720, status: 'busy' },
	{ start: 720, end: 780, status: 'free' },
	{
		start: 780,
		end: 1320,
		status: 'closed',
		reason: { type: 'outside', text: '' },
	},
];

const tomorrow = { date: '2026-09-22', minute: 0 };

describe('toSegments', () => {
	it('splits free periods into slots and keeps others whole', () => {
		const segments = toSegments(periods, 30, '2026-09-23', tomorrow);

		expect(segments.map((s) => `${s.start}-${s.end} ${s.status}`)).toEqual([
			'480-510 free',
			'510-540 free',
			'540-570 free',
			'570-600 free',
			'600-720 busy',
			'720-750 free',
			'750-780 free',
			'780-1320 closed',
		]);
	});

	it('marks segments that have started as past', () => {
		const segments = toSegments(periods, 30, '2026-09-23', {
			date: '2026-09-23',
			minute: 520,
		});

		expect(segments.map((s) => s.past)).toEqual([
			true,
			true,
			false,
			false,
			false,
			false,
			false,
			false,
		]);
	});

	it('marks every segment on earlier days as past', () => {
		const segments = toSegments(periods, 30, '2026-09-23', {
			date: '2026-09-24',
			minute: 0,
		});

		expect(segments.every((s) => s.past)).toBe(true);
	});
});

describe('isActionable', () => {
	const segments = toSegments(
		[
			...periods.slice(0, 3),
			{ start: 780, end: 840, status: 'mine' },
			{ start: 840, end: 1320, status: 'closed' },
		],
		30,
		'2026-09-23',
		{ date: '2026-09-23', minute: 900 }
	);

	it('does not allow closed or past segments', () => {
		expect(segments.filter(isActionable).map((s) => s.status)).toEqual([
			'mine',
		]);
	});
});

describe('suggestedRange', () => {
	const segments = toSegments(periods, 30, '2026-09-23', tomorrow);

	it('suggests one hour when the next slot is free', () => {
		expect(suggestedRange(segments, 0)).toEqual({ start: 480, end: 540 });
	});

	it('suggests the slot when the next one is not free', () => {
		expect(suggestedRange(segments, 3)).toEqual({ start: 570, end: 600 });
		expect(suggestedRange(segments, 6)).toEqual({ start: 750, end: 780 });
	});

	it('suggests the whole period for other statuses', () => {
		expect(suggestedRange(segments, 4)).toEqual({ start: 600, end: 720 });
	});
});
