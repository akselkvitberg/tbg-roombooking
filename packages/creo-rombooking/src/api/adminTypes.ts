import type { Approval } from './types';

export interface ItemRoom {
	id: number;
	name: string;
	capacity: number;
	approval: Approval;
}

export interface ItemUser {
	id: number;
	name: string;
}

/** An approved booking that a request overlaps. */
export interface Existing {
	id: number;
	user: ItemUser;
	purpose: string;
	people: number;
	date: string;
	start: number;
	end: number;
	/** `Y-m-d H:i:s`, the site's time. */
	bookedAt: string;
	/** The first date of the series the booking is part of. */
	seriesStart: string | null;
}

export interface Suggestions {
	/** Free rooms with enough places, smallest first. */
	free: ItemRoom[];
	tooSmall: string[];
	unavailable: string[];
}

export type OccurrenceState =
	| 'free'
	| 'conflict'
	| 'closed'
	| 'outside'
	| 'approved'
	| 'rejected'
	| 'cancelled'
	| 'proposed';

export interface SeriesOccurrence {
	date: string;
	bookingId: number | null;
	status: OccurrenceState;
	/** Whether the date is waiting for a decision. */
	pending: boolean;
	conflictWith?: { name: string; purpose: string };
}

interface ItemBase {
	/** E.g. `booking-12` or `series-4`. */
	id: string;
	room: ItemRoom;
	date: string;
	start: number;
	end: number;
	user: ItemUser;
	purpose: string;
	people: number;
	/** `Y-m-d H:i:s`, the site's time. */
	sentAt: string;
}

export interface SingleItem extends ItemBase {
	kind: 'conflict' | 'approval';
	bookingId: number;
	/** Whether the room is closed during the request. */
	closed: boolean;
	existing: Existing[];
	suggestions: Suggestions;
	/** Rooms the existing booking can be moved to. */
	moveOptions: ItemRoom[];
}

export interface SeriesItem extends ItemBase {
	kind: 'series';
	seriesId: number;
	rule: 'weekly' | 'biweekly' | 'monthly';
	occurrences: SeriesOccurrence[];
}

export type RequestItem = SingleItem | SeriesItem;

export interface ActionResult {
	message: string;
}

export interface Alternative {
	roomId: number;
	deadline: number;
}

export interface ProposalInput {
	roomId: number;
	date: string;
	start: number;
	end: number;
	deadline: number;
	message: string;
}

export interface SmsLogEntry {
	id: number;
	sentAt: string;
	to: { id: number; name: string; phone: string | null };
	text: string;
}

export interface SmsLog {
	items: SmsLogEntry[];
	total: number;
	pages: number;
}

export interface MoveInput {
	roomId: number;
	date: string;
	start: number;
	end: number;
	reason: string;
}
