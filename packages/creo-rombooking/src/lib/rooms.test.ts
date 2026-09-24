import { fromDayHours, move, toDayHours, weekdayName } from './rooms';

describe('weekdayName', () => {
	it('names the weekdays with Sunday as 0', () => {
		expect(weekdayName(1, 'nb-NO')).toBe('mandag');
		expect(weekdayName(0, 'nb-NO')).toBe('søndag');
	});
});

describe('opening hours', () => {
	it('has one row per weekday, Monday first, and keeps the open days', () => {
		const days = toDayHours([{ weekday: 2, start: 540, end: 960 }]);
		expect(days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
		expect(days[1]).toEqual({ weekday: 2, open: true, start: 540, end: 960 });
		expect(days[0].open).toBe(false);
		expect(fromDayHours(days)).toEqual([{ weekday: 2, start: 540, end: 960 }]);
	});
});

describe('move', () => {
	it('swaps with the neighbour and stays within the list', () => {
		expect(move(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
		expect(move(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
	});
});
