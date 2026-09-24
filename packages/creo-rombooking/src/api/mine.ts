import apiFetch from '@wordpress/api-fetch';

import type { ActionResult } from './adminTypes';
import type { CancelScope, MyBookings } from './mineTypes';

const NAMESPACE = '/creo-rombooking/v1/me';

export function getMyBookings(): Promise<MyBookings> {
	return apiFetch<MyBookings>({ path: `${NAMESPACE}/bookings` });
}

export function cancelMyBooking(
	id: number,
	scope: CancelScope
): Promise<ActionResult> {
	return apiFetch<ActionResult>({
		path: `${NAMESPACE}/bookings/${id}/cancel`,
		method: 'POST',
		data: { scope },
	});
}

export function answerProposal(
	id: number,
	answer: 'accept' | 'decline'
): Promise<ActionResult> {
	return apiFetch<ActionResult>({
		path: `${NAMESPACE}/proposals/${id}/${answer}`,
		method: 'POST',
	});
}
