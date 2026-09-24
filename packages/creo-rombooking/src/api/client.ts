import apiFetch from '@wordpress/api-fetch';
import { addQueryArgs } from '@wordpress/url';

import type {
	Availability,
	BookingInput,
	BookingResult,
	FieldErrors,
	Preview,
	Room,
} from './types';

const NAMESPACE = '/creo-rombooking/v1';

export function getRooms(): Promise<Room[]> {
	return apiFetch<Room[]>({ path: `${NAMESPACE}/rooms` });
}

export function getAvailability(
	from: string,
	to: string,
	rooms?: number[]
): Promise<Availability> {
	return apiFetch<Availability>({
		path: addQueryArgs(`${NAMESPACE}/availability`, {
			from,
			to,
			rooms: rooms?.join(','),
		}),
	});
}

export function previewBooking(
	input: BookingInput,
	signal?: AbortSignal
): Promise<Preview> {
	return apiFetch<Preview>({
		path: `${NAMESPACE}/bookings/preview`,
		method: 'POST',
		data: input,
		signal,
	});
}

export function createBooking(input: BookingInput): Promise<BookingResult> {
	return apiFetch<BookingResult>({
		path: `${NAMESPACE}/bookings`,
		method: 'POST',
		data: input,
	});
}

/**
 * Returns the field errors from a failed request, if any.
 *
 * @param error The error thrown by apiFetch.
 */
export function fieldErrors(error: unknown): FieldErrors | null {
	const data = (error as { data?: { errors?: FieldErrors } } | null)?.data;
	return data?.errors ?? null;
}

/**
 * Returns a readable message from an API error.
 *
 * @param error The error thrown by apiFetch.
 */
export function errorMessage(error: unknown): string | null {
	if (error && typeof error === 'object' && 'message' in error) {
		return String((error as { message: unknown }).message);
	}
	return null;
}
