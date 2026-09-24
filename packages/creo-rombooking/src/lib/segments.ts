import type { Period, Status } from '../api/types';

export interface Segment {
	/** Minutes after midnight. */
	start: number;
	/** Minutes after midnight. */
	end: number;
	status: Status;
	period: Period;
	/** Whether the segment has started already, so it cannot be booked. */
	past: boolean;
}

export interface Now {
	date: string;
	minute: number;
}

/**
 * Splits free periods into one segment per slot, so that each free slot can
 * be chosen, and keeps other periods as one segment each.
 *
 * @param periods The periods of a room on a day.
 * @param slot    The slot length in minutes.
 * @param date    The date of the periods.
 * @param now     The current date and minute in the site's timezone.
 */
export function toSegments(
	periods: Period[],
	slot: number,
	date: string,
	now: Now
): Segment[] {
	const isPast = (start: number) =>
		date < now.date || (date === now.date && start < now.minute);

	return periods.flatMap((period): Segment[] => {
		if (period.status !== 'free') {
			return [
				{
					start: period.start,
					end: period.end,
					status: period.status,
					period,
					past: isPast(period.start),
				},
			];
		}

		const segments: Segment[] = [];
		for (let start = period.start; start < period.end; start += slot) {
			segments.push({
				start,
				end: start + slot,
				status: 'free',
				period,
				past: isPast(start),
			});
		}
		return segments;
	});
}

/**
 * Whether choosing the segment does anything. Closed and past segments can
 * not be booked, but members can still open their own bookings.
 *
 * @param segment The segment.
 */
export function isActionable(segment: Segment): boolean {
	if (segment.status === 'mine' || segment.status === 'mine-requested') {
		return true;
	}
	return segment.status !== 'closed' && !segment.past;
}

/**
 * The time to suggest when a segment is chosen: one hour when the next slot
 * is free too, otherwise the segment itself.
 *
 * @param segments All segments of the room on the day.
 * @param index    The index of the chosen segment.
 */
export function suggestedRange(
	segments: Segment[],
	index: number
): { start: number; end: number } {
	const segment = segments[index];
	const next = segments[index + 1];

	if (
		segment.status === 'free' &&
		next?.status === 'free' &&
		!next.past &&
		next.start === segment.end
	) {
		return { start: segment.start, end: next.end };
	}

	return { start: segment.start, end: segment.end };
}
