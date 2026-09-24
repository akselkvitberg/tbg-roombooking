import { indexAt, navigate, Span, weekKey } from './navigation';

const rows: Span[][] = [
	[
		{ start: 480, end: 510 },
		{ start: 510, end: 600 },
		{ start: 600, end: 630 },
	],
	[
		{ start: 480, end: 570 },
		{ start: 570, end: 630 },
	],
	[{ start: 480, end: 630 }],
];

describe('indexAt', () => {
	it('finds the segment covering a minute', () => {
		expect(indexAt(rows[0], 480)).toBe(0);
		expect(indexAt(rows[0], 540)).toBe(1);
		expect(indexAt(rows[0], 629)).toBe(2);
	});

	it('falls back to the closest end', () => {
		expect(indexAt(rows[0], 0)).toBe(0);
		expect(indexAt(rows[0], 2000)).toBe(2);
	});
});

describe('navigate', () => {
	const at = (row: number, minute: number) => ({ row, minute });

	it('moves left and right between segments, stopping at the ends', () => {
		expect(navigate(rows, at(0, 480), 'ArrowRight')).toEqual({
			type: 'move',
			position: at(0, 510),
		});
		expect(navigate(rows, at(0, 540), 'ArrowRight')).toEqual({
			type: 'move',
			position: at(0, 600),
		});
		expect(navigate(rows, at(0, 600), 'ArrowRight')).toEqual({
			type: 'move',
			position: at(0, 600),
		});
		expect(navigate(rows, at(0, 540), 'ArrowLeft')).toEqual({
			type: 'move',
			position: at(0, 480),
		});
	});

	it('keeps the minute when moving up and down', () => {
		expect(navigate(rows, at(0, 510), 'ArrowDown')).toEqual({
			type: 'move',
			position: at(1, 510),
		});
		expect(navigate(rows, at(2, 510), 'ArrowDown')).toEqual({
			type: 'move',
			position: at(2, 510),
		});
		expect(navigate(rows, at(0, 510), 'ArrowUp')).toEqual({
			type: 'move',
			position: at(0, 510),
		});
	});

	it('goes to the start and end of the row, or of the grid with Ctrl', () => {
		expect(navigate(rows, at(1, 600), 'Home')).toEqual({
			type: 'move',
			position: at(1, 480),
		});
		expect(navigate(rows, at(1, 480), 'End')).toEqual({
			type: 'move',
			position: at(1, 570),
		});
		expect(navigate(rows, at(1, 600), 'Home', true)).toEqual({
			type: 'move',
			position: at(0, 480),
		});
		expect(navigate(rows, at(0, 480), 'End', true)).toEqual({
			type: 'move',
			position: at(2, 480),
		});
	});

	it('changes day with Page Up and Page Down', () => {
		expect(navigate(rows, at(0, 480), 'PageUp')).toEqual({
			type: 'previous-day',
		});
		expect(navigate(rows, at(0, 480), 'PageDown')).toEqual({
			type: 'next-day',
		});
	});

	it('ignores other keys', () => {
		expect(navigate(rows, at(0, 480), 'a')).toBeNull();
		expect(navigate(rows, at(0, 480), 'Enter')).toBeNull();
	});
});

describe('weekKey', () => {
	it('moves within a day with up and down, and between days with left and right', () => {
		expect(
			navigate(rows, { row: 0, minute: 480 }, weekKey('ArrowDown'))
		).toEqual({
			type: 'move',
			position: { row: 0, minute: 510 },
		});
		expect(
			navigate(rows, { row: 0, minute: 540 }, weekKey('ArrowRight'))
		).toEqual({
			type: 'move',
			position: { row: 1, minute: 540 },
		});
		expect(weekKey('PageDown')).toBe('PageDown');
	});
});
