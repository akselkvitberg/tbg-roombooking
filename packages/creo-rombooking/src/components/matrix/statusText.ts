import { __, sprintf } from '@wordpress/i18n';

import type { Status } from '../../api/types';
import { formatTimeRange } from '../../lib/dates';
import type { Segment } from '../../lib/segments';

/**
 * The visible label of a status.
 *
 * @param status The status.
 */
export function statusLabel(status: Status): string {
	switch (status) {
		case 'free':
			return __('Available', 'creo-rombooking');
		case 'busy':
			return __('Booked', 'creo-rombooking');
		case 'requested':
		case 'mine-requested':
			return __('Requested', 'creo-rombooking');
		case 'closed':
			return __('Closed', 'creo-rombooking');
		case 'mine':
			return __('Your booking', 'creo-rombooking');
	}
}

/**
 * The reason a period is closed, e.g. «Outside opening hours» or «Maintenance».
 *
 * @param segment The segment.
 */
export function closedReason(segment: Segment): string {
	const reason = segment.period.reason;
	if (!reason || reason.type === 'outside') {
		return __('Outside opening hours', 'creo-rombooking');
	}
	return reason.text || statusLabel('closed');
}

/**
 * What happens when the segment is chosen, for screen readers.
 *
 * @param segment The segment.
 */
function actionText(segment: Segment): string {
	if (segment.status === 'closed') {
		return closedReason(segment) + '.';
	}
	if (segment.status === 'mine') {
		return __('Choose to see details.', 'creo-rombooking');
	}
	if (segment.status === 'mine-requested') {
		return __(
			'Your request is waiting for approval. Choose to see details.',
			'creo-rombooking'
		);
	}
	if (segment.past) {
		return __('This time has passed.', 'creo-rombooking');
	}
	switch (segment.status) {
		case 'free':
			return __('Choose to book.', 'creo-rombooking');
		case 'busy':
			return __(
				'Choose to send a request to the administrator.',
				'creo-rombooking'
			);
		default:
			return __(
				'Waiting for approval. Choose to send your own request to the administrator.',
				'creo-rombooking'
			);
	}
}

/**
 * The accessible name of a segment, e.g. «Storsalen, 18:00–21:00, Booked.
 * Choose to send a request to the administrator.»
 *
 * @param where   The room (day view) or the date (week view).
 * @param segment The segment.
 * @param action  Replaces what happens when chosen, e.g. for administrators.
 */
export function segmentLabel(
	where: string,
	segment: Segment,
	action?: string
): string {
	return sprintf(
		/* translators: 1: room or date, 2: time range, 3: status, 4: what happens when chosen */
		__('%1$s, %2$s, %3$s. %4$s', 'creo-rombooking'),
		where,
		formatTimeRange(segment.start, segment.end),
		statusLabel(segment.status),
		action ?? actionText(segment)
	);
}
