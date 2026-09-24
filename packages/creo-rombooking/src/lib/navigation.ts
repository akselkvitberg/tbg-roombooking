/**
 * Keyboard navigation in the booking matrix, as pure functions.
 *
 * The position is a row and a minute. Left and right move to the previous or
 * next segment; up and down keep the minute and move to the segment covering
 * it in the row above or below, so moving up and down does not drift.
 */

export interface Span {
	start: number;
	end: number;
}

export interface Position {
	row: number;
	minute: number;
}

export type NavigationResult =
	| { type: 'move'; position: Position }
	| { type: 'previous-day' }
	| { type: 'next-day' };

/**
 * The index of the segment covering a minute, or the closest one.
 *
 * @param spans  The segments of a row.
 * @param minute The minute.
 */
export function indexAt(spans: Span[], minute: number): number {
	const index = spans.findIndex((s) => s.start <= minute && minute < s.end);
	if (index !== -1) {
		return index;
	}
	return minute < spans[0].start ? 0 : spans.length - 1;
}

/**
 * @param rows     The segments of each row.
 * @param position The current position.
 * @param key      `KeyboardEvent.key`.
 * @param ctrl     Whether Ctrl (or Cmd) is pressed.
 * @return What to do, or null when the key is not handled.
 */
export function navigate(
	rows: Span[][],
	position: Position,
	key: string,
	ctrl = false
): NavigationResult | null {
	const row = rows[position.row];
	const index = indexAt(row, position.minute);
	const move = (r: number, minute: number): NavigationResult => ({
		type: 'move',
		position: { row: r, minute },
	});

	switch (key) {
		case 'ArrowRight':
			return index < row.length - 1
				? move(position.row, row[index + 1].start)
				: move(position.row, row[index].start);
		case 'ArrowLeft':
			return index > 0
				? move(position.row, row[index - 1].start)
				: move(position.row, row[index].start);
		case 'ArrowDown':
			return move(Math.min(position.row + 1, rows.length - 1), position.minute);
		case 'ArrowUp':
			return move(Math.max(position.row - 1, 0), position.minute);
		case 'Home':
			return ctrl
				? move(0, rows[0][0].start)
				: move(position.row, row[0].start);
		case 'End': {
			const lastRow = ctrl ? rows.length - 1 : position.row;
			const segments = rows[lastRow];
			return move(lastRow, segments[segments.length - 1].start);
		}
		case 'PageUp':
			return { type: 'previous-day' };
		case 'PageDown':
			return { type: 'next-day' };
		default:
			return null;
	}
}

/**
 * In the week view the days are columns and time runs downwards, so up and
 * down move within a day and left and right move between days. Returns the
 * key that `navigate()` expects, with days as its rows.
 *
 * @param key `KeyboardEvent.key` in the week view.
 */
export function weekKey(key: string): string {
	const keys: Record<string, string> = {
		ArrowDown: 'ArrowRight',
		ArrowUp: 'ArrowLeft',
		ArrowRight: 'ArrowDown',
		ArrowLeft: 'ArrowUp',
	};
	return keys[key] ?? key;
}
