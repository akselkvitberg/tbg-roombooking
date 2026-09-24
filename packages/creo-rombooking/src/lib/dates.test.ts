import {
	addDays,
	formatDayAndMonth,
	formatLongDate,
	formatTime,
	formatTimeRange,
	formatWeekRange,
	isDateString,
	isoWeek,
	startOfWeek,
	toLanguageTag,
} from './dates';

describe('dates', () => {
	it('adds days across months and years', () => {
		expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('is not shifted by daylight saving time', () => {
		expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
		expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
	});

	it('validates dates', () => {
		expect(isDateString('2026-09-23')).toBe(true);
		expect(isDateString('2026-02-30')).toBe(false);
		expect(isDateString('23.09.2026')).toBe(false);
		expect(isDateString('')).toBe(false);
	});

	it('formats dates in Norwegian', () => {
		expect(formatLongDate('2026-09-23', 'nb-NO')).toBe(
			'Onsdag 23. september 2026'
		);
		expect(formatDayAndMonth('2026-09-23', 'nb-NO')).toBe(
			'onsdag 23. september'
		);
	});

	it('formats times', () => {
		expect(formatTime(480)).toBe('08:00');
		expect(formatTime(1290)).toBe('21:30');
		expect(formatTimeRange(480, 570)).toBe('08:00–09:30');
	});

	it('converts WordPress locales', () => {
		expect(toLanguageTag('nb_NO')).toBe('nb-NO');
		expect(toLanguageTag('en')).toBe('en');
	});
});

describe('weeks', () => {
	it('finds the Monday of the week', () => {
		expect(startOfWeek('2026-09-24')).toBe('2026-09-21');
		expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
		expect(startOfWeek('2026-09-21')).toBe('2026-09-21');
	});

	it('uses ISO week numbers', () => {
		expect(isoWeek('2026-09-24')).toBe(39);
		expect(isoWeek('2026-01-01')).toBe(1);
		expect(isoWeek('2027-01-01')).toBe(53);
		expect(isoWeek('2024-12-30')).toBe(1);
	});

	it('formats the range of a week', () => {
		expect(formatWeekRange('2026-09-28', 'nb-NO')).toBe(
			'28. sep.–4. okt. 2026'
		);
		expect(formatWeekRange('2026-12-28', 'nb-NO')).toBe(
			'28. des. 2026–3. jan. 2027'
		);
	});
});
