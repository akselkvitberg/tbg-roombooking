import { __, _n, sprintf } from '@wordpress/i18n';

import type {
	Approval,
	BookingInput,
	FieldErrors,
	OccurrenceStatus,
	Status,
} from '../api/types';

import { addDays } from './dates';

export const MAX_OCCURRENCES = 26;
export const PURPOSE_MAX = 200;

export interface Selection {
	roomId: number;
	date: string;
	start: number;
	end: number;
	status: Status;
}

/**
 * The form's starting values for a chosen time.
 *
 * @param selection The chosen room and time.
 */
export function initialForm(selection: Selection): BookingInput {
	return {
		roomId: selection.roomId,
		date: selection.date,
		start: selection.start,
		end: selection.end,
		purpose: '',
		repeat: 'none',
		endMode: 'count',
		count: 6,
		endDate: addDays(selection.date, 56),
		phone: '',
	};
}

/**
 * Moves the end time when the start time moves past it, keeping the length.
 *
 * @param form   The form.
 * @param start  The new start time.
 * @param dayEnd The last minute of the day.
 */
export function withStart(
	form: BookingInput,
	start: number,
	dayEnd: number
): BookingInput {
	if (form.end > start) {
		return { ...form, start };
	}
	const length = Math.max(form.end - form.start, 30);
	return { ...form, start, end: Math.min(start + length, dayEnd) };
}

/**
 * Errors the form can find without asking the server.
 *
 * @param form The form.
 */
export function validateForm(form: BookingInput): FieldErrors {
	const errors: FieldErrors = {};

	if (form.end <= form.start) {
		errors.end = __(
			'The end time must be after the start time.',
			'creo-rombooking'
		);
	}
	if (form.repeat !== 'none' && form.endMode === 'count') {
		if (
			!Number.isInteger(form.count) ||
			form.count < 2 ||
			form.count > MAX_OCCURRENCES
		) {
			errors.count = sprintf(
				/* translators: %d: maximum number of occurrences */
				__('The number of times must be between 2 and %d.', 'creo-rombooking'),
				MAX_OCCURRENCES
			);
		}
	}
	if (
		form.repeat !== 'none' &&
		form.endMode === 'date' &&
		(!form.endDate || form.endDate <= form.date)
	) {
		errors.endDate = __(
			'The end date must be after the start date.',
			'creo-rombooking'
		);
	}

	return errors;
}

export type Counts = Record<OccurrenceStatus, number>;

/**
 * The text of the submit button, e.g. «Book 6 times» or «Send request».
 *
 * @param counts    How many dates are free, in conflict and outside opening hours.
 * @param approval  Whether the room approves automatically.
 * @param repeating Whether the booking repeats.
 */
export function submitLabel(
	counts: Counts | null,
	approval: Approval | null,
	repeating: boolean
): string {
	const included = counts ? counts.free + counts.conflict : 1;
	const direct = approval === 'auto' && counts ? counts.free : 0;
	const viaAdmin = included - direct;

	if (viaAdmin === 0) {
		return repeating
			? sprintf(
					/* translators: %d: number of bookings */
					__('Book %d times', 'creo-rombooking'),
					direct
			  )
			: __('Book the room', 'creo-rombooking');
	}
	if (direct === 0) {
		return included > 1
			? sprintf(
					/* translators: %d: number of requests */
					__('Send %d requests', 'creo-rombooking'),
					included
			  )
			: __('Send request', 'creo-rombooking');
	}
	return __('Book and send request', 'creo-rombooking');
}

export interface ApprovalMessage {
	kind: 'ok' | 'info' | 'warning';
	title: string;
	text: string;
}

/**
 * Tells whether the booking is approved right away or needs approval.
 *
 * @param counts    How many dates are free, in conflict and outside opening hours.
 * @param approval  Whether the room approves automatically.
 * @param roomName  The room.
 * @param repeating Whether the booking repeats.
 */
export function approvalMessage(
	counts: Counts,
	approval: Approval,
	roomName: string,
	repeating: boolean
): ApprovalMessage {
	const included = counts.free + counts.conflict;

	if (counts.conflict > 0 && !repeating) {
		return {
			kind: 'warning',
			title: __('Goes to the administrator', 'creo-rombooking'),
			text: __(
				'The time is booked. The administrator considers the request, and you get a text message with the answer.',
				'creo-rombooking'
			),
		};
	}
	if (counts.conflict > 0) {
		const rest =
			approval === 'manual'
				? sprintf(
						/* translators: %s: room name */
						__(
							'The available ones must be approved too, because %s needs approval.',
							'creo-rombooking'
						),
						roomName
				  )
				: __('The available ones are confirmed right away.', 'creo-rombooking');
		return {
			kind: 'warning',
			title: __('Partly to the administrator', 'creo-rombooking'),
			text: sprintf(
				/* translators: 1: dates in conflict, 2: all included dates, 3: what happens to the available dates */
				_n(
					'%1$d of %2$d date is in conflict and is sent to the administrator. %3$s You get a text message.',
					'%1$d of %2$d dates are in conflict and are sent to the administrator. %3$s You get a text message.',
					included,
					'creo-rombooking'
				),
				counts.conflict,
				included,
				rest
			),
		};
	}
	if (approval === 'manual') {
		return {
			kind: 'info',
			title: __('Needs approval', 'creo-rombooking'),
			text: sprintf(
				/* translators: %s: room name */
				__(
					'%s is approved by the administrator. You get a text message when the request has been handled.',
					'creo-rombooking'
				),
				roomName
			),
		};
	}
	return {
		kind: 'ok',
		title: __('Approved automatically', 'creo-rombooking'),
		text: sprintf(
			/* translators: %s: room name */
			__(
				'%s is confirmed right away when the time is available. You get a text message as a receipt.',
				'creo-rombooking'
			),
			roomName
		),
	};
}
