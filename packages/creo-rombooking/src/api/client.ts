import apiFetch from '@wordpress/api-fetch';
import { addQueryArgs } from '@wordpress/url';

import type { Availability, Room } from './types';

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
