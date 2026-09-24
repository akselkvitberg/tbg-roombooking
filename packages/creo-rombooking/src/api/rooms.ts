import apiFetch from '@wordpress/api-fetch';

import type { ActionResult } from './adminTypes';
import type { Closure, ClosureInput, RoomInput, RoomSetup } from './roomTypes';

const NAMESPACE = '/creo-rombooking/v1/admin/rooms';

export function getRoomSetup(): Promise<RoomSetup[]> {
	return apiFetch<RoomSetup[]>({ path: NAMESPACE });
}

export function saveRoom(
	id: number | null,
	input: RoomInput
): Promise<ActionResult & { room: RoomSetup }> {
	return apiFetch({
		path: id === null ? NAMESPACE : `${NAMESPACE}/${id}`,
		method: 'POST',
		data: input,
	});
}

export function reorderRooms(ids: number[]): Promise<ActionResult> {
	return apiFetch({
		path: `${NAMESPACE}/order`,
		method: 'POST',
		data: { ids },
	});
}

export function addClosure(
	roomId: number,
	input: ClosureInput
): Promise<ActionResult & { closure: Closure; affected: number }> {
	return apiFetch({
		path: `${NAMESPACE}/${roomId}/closures`,
		method: 'POST',
		data: input,
	});
}

export function deleteClosure(
	roomId: number,
	closureId: number
): Promise<ActionResult> {
	return apiFetch({
		path: `${NAMESPACE}/${roomId}/closures/${closureId}`,
		method: 'DELETE',
	});
}
