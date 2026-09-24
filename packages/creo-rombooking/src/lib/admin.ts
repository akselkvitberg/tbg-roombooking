import { __, _n, sprintf } from '@wordpress/i18n';

import type {
	OccurrenceState,
	RequestItem,
	SeriesOccurrence,
} from '../api/adminTypes';
import type { Approval } from '../api/types';

import { formatDayMonth, formatTime } from './dates';

/** The first and last bookable minute, and the slot length. */
export const DAY_START = 480;
export const DAY_END = 1320;
export const SLOT = 30;

export const REASON_MAX = 300;
export const MESSAGE_MAX = 160;
export const DEADLINES = [24, 48, 72] as const;

export interface Group {
	kind: RequestItem['kind'];
	title: string;
	items: RequestItem[];
}

/**
 * Groups the requests as the server sorted them: conflicts, series, approvals.
 *
 * @param items The requests.
 */
export function groupItems(items: RequestItem[]): Group[] {
	const titles: Record<RequestItem['kind'], string> = {
		conflict: __('Conflicts', 'creo-rombooking'),
		series: __('Series', 'creo-rombooking'),
		approval: __('To approve', 'creo-rombooking'),
	};

	return (['conflict', 'series', 'approval'] as const)
		.map((kind) => ({
			kind,
			title: titles[kind],
			items: items.filter((item) => item.kind === kind),
		}))
		.filter((group) => group.items.length > 0);
}

/**
 * E.g. «4 waiting · 2 conflicts».
 *
 * @param items The requests.
 */
export function inboxSummary(items: RequestItem[]): string {
	const conflicts = items.filter((item) => item.kind === 'conflict').length;
	return [
		sprintf(
			/* translators: %d: number of requests */
			_n('%d waiting', '%d waiting', items.length, 'creo-rombooking'),
			items.length
		),
		sprintf(
			/* translators: %d: number of conflicts */
			_n('%d conflict', '%d conflicts', conflicts, 'creo-rombooking'),
			conflicts
		),
	].join(' · ');
}

/**
 * E.g. «22. sep. at 14:12», from `Y-m-d H:i:s` in the site's time.
 *
 * @param value  The date and time.
 * @param locale The locale.
 */
export function formatDateTime(value: string, locale: string): string {
	const [date, time] = value.split(' ');
	return sprintf(
		/* translators: 1: date, 2: time */
		__('%1$s at %2$s', 'creo-rombooking'),
		formatDayMonth(date, locale),
		(time ?? '').slice(0, 5)
	);
}

/**
 * The part of two times that overlaps, e.g. «11:00–15:00».
 *
 * @param a       A time.
 * @param a.start
 * @param a.end
 * @param b       Another time.
 * @param b.start
 * @param b.end
 */
export function overlap(
	a: { start: number; end: number },
	b: { start: number; end: number }
): string {
	return `${formatTime(Math.max(a.start, b.start))}–${formatTime(
		Math.min(a.end, b.end)
	)}`;
}

export function approvalLabel(approval: Approval): string {
	return approval === 'manual'
		? __('manual approval', 'creo-rombooking')
		: __('automatic approval', 'creo-rombooking');
}

export function placesLabel(capacity: number): string {
	return sprintf(
		/* translators: %d: number of places */
		_n('%d place', '%d places', capacity, 'creo-rombooking'),
		capacity
	);
}

export interface SeriesCounts {
	free: number;
	conflict: number;
	outside: number;
	approved: number;
	rejected: number;
	/** Waiting dates that are free and can be approved. */
	freePending: number;
}

export function seriesCounts(occurrences: SeriesOccurrence[]): SeriesCounts {
	const count = (test: (o: SeriesOccurrence) => boolean) =>
		occurrences.filter(test).length;

	return {
		free: count((o) => o.pending && o.status === 'free'),
		conflict: count(
			(o) => o.pending && (o.status === 'conflict' || o.status === 'closed')
		),
		outside: count((o) => o.status === 'outside'),
		approved: count((o) => o.status === 'approved'),
		rejected: count((o) => o.status === 'rejected'),
		freePending: count((o) => o.pending && o.status === 'free'),
	};
}

/**
 * E.g. «5 available · 2 conflicts · 1 left out · 1 approved».
 *
 * @param counts The counts.
 */
export function seriesSummary(counts: SeriesCounts): string {
	const parts = [
		sprintf(
			/* translators: %d: number of dates */
			_n('%d available', '%d available', counts.free, 'creo-rombooking'),
			counts.free
		),
		sprintf(
			/* translators: %d: number of dates */
			_n('%d conflict', '%d conflicts', counts.conflict, 'creo-rombooking'),
			counts.conflict
		),
		sprintf(
			/* translators: %d: number of dates */
			_n('%d left out', '%d left out', counts.outside, 'creo-rombooking'),
			counts.outside
		),
	];
	if (counts.approved > 0) {
		parts.push(
			sprintf(
				/* translators: %d: number of dates */
				_n('%d approved', '%d approved', counts.approved, 'creo-rombooking'),
				counts.approved
			)
		);
	}
	if (counts.rejected > 0) {
		parts.push(
			sprintf(
				/* translators: %d: number of dates */
				_n('%d declined', '%d declined', counts.rejected, 'creo-rombooking'),
				counts.rejected
			)
		);
	}
	return parts.join(' · ');
}

export function occurrenceLabel(status: OccurrenceState): string {
	const labels: Record<OccurrenceState, string> = {
		free: __('Available', 'creo-rombooking'),
		conflict: __('Conflict', 'creo-rombooking'),
		closed: __('Closed', 'creo-rombooking'),
		outside: __('Outside opening hours – left out', 'creo-rombooking'),
		approved: __('Approved', 'creo-rombooking'),
		rejected: __('Declined', 'creo-rombooking'),
		cancelled: __('Cancelled', 'creo-rombooking'),
		proposed: __('Proposal sent', 'creo-rombooking'),
	};
	return labels[status];
}

/**
 * When a proposal must be answered, formatted in the site's timezone.
 *
 * @param hours    Hours from now.
 * @param locale   The locale.
 * @param timezone The site's timezone.
 * @param now      The current time.
 */
export function deadlineText(
	hours: number,
	locale: string,
	timezone: string,
	now: Date = new Date()
): string {
	const deadline = new Date(now.getTime() + hours * 3600 * 1000);
	const options: Intl.DateTimeFormatOptions = {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	};
	const timeOptions: Intl.DateTimeFormatOptions = {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	};

	let formatted: [string, string];
	try {
		formatted = [
			new Intl.DateTimeFormat(locale, {
				...options,
				timeZone: timezone,
			}).format(deadline),
			new Intl.DateTimeFormat(locale, {
				...timeOptions,
				timeZone: timezone,
			}).format(deadline),
		];
	} catch {
		// Offsets like `+02:00` are not supported everywhere; fall back to the browser's timezone.
		formatted = [
			new Intl.DateTimeFormat(locale, options).format(deadline),
			new Intl.DateTimeFormat(locale, timeOptions).format(deadline),
		];
	}

	/* translators: 1: date, 2: time */
	return sprintf(__('%1$s at %2$s', 'creo-rombooking'), ...formatted);
}

/**
 * The start times of the day, e.g. for a select.
 */
export function slotTimes(): number[] {
	const times: number[] = [];
	for (let minute = DAY_START; minute < DAY_END; minute += SLOT) {
		times.push(minute);
	}
	return times;
}
