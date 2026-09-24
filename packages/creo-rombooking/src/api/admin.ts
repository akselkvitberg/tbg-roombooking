import apiFetch from '@wordpress/api-fetch';
import { addQueryArgs } from '@wordpress/url';

import type {
	ActionResult,
	Alternative,
	ProposalInput,
	RequestItem,
	SmsLog,
} from './adminTypes';
import type { OccurrenceStatus } from './types';

const NAMESPACE = '/creo-rombooking/v1/admin';

export function getRequests(): Promise<RequestItem[]> {
	return apiFetch<RequestItem[]>({ path: `${NAMESPACE}/requests` });
}

export function checkTime(
	roomId: number,
	date: string,
	start: number,
	end: number,
	ignore: number[] = []
): Promise<{ status: OccurrenceStatus }> {
	return apiFetch({
		path: addQueryArgs(`${NAMESPACE}/check`, {
			roomId,
			date,
			start,
			end,
			ignore: ignore.join(','),
		}),
	});
}

function post(path: string, data: object = {}): Promise<ActionResult> {
	return apiFetch<ActionResult>({
		path: `${NAMESPACE}/${path}`,
		method: 'POST',
		data,
	});
}

export const approve = (id: number) => post(`requests/${id}/approve`);

export const reject = (id: number, reason: string) =>
	post(`requests/${id}/reject`, { reason });

export const propose = (id: number, input: ProposalInput) =>
	post(`requests/${id}/propose`, input);

export const moveExisting = (id: number, roomId: number, reason: string) =>
	post(`requests/${id}/move-existing`, { roomId, reason });

export const approveAndCancelExisting = (
	id: number,
	reason: string,
	alternative: Alternative | null
) =>
	post(`requests/${id}/approve-and-cancel-existing`, {
		reason,
		alternative,
	});

export const approveFree = (seriesId: number) =>
	post(`series/${seriesId}/approve-free`);

export const rejectRest = (seriesId: number, reason: string) =>
	post(`series/${seriesId}/reject-rest`, { reason });

export const cancelBooking = (
	id: number,
	reason: string,
	alternative: Alternative | null
) => post(`bookings/${id}/cancel`, { reason, alternative });

export function getSmsLog(page: number): Promise<SmsLog> {
	return apiFetch<SmsLog>({
		path: addQueryArgs(`${NAMESPACE}/sms-log`, { page }),
	});
}
