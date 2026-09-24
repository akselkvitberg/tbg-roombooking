import type { Approval } from './types';

export interface OpeningHours {
	/** 0 = Sunday, as in PHP and `Date.getDay()`. */
	weekday: number;
	start: number;
	end: number;
}

export interface Closure {
	id: number;
	date: string;
	/** Null when the room is closed the whole day. */
	start: number | null;
	end: number | null;
	type: 'closed' | 'blocked';
	reason: string;
}

export interface RoomSetup {
	id: number;
	name: string;
	description: string;
	capacity: number;
	approval: Approval;
	active: boolean;
	imageId: number;
	imageUrl: string | null;
	instructions: string;
	openingHours: OpeningHours[];
	closures: Closure[];
}

export type RoomInput = Omit<RoomSetup, 'id' | 'imageUrl' | 'closures'>;

export interface ClosureInput {
	date: string;
	wholeDay: boolean;
	start: number;
	end: number;
	type: 'closed' | 'blocked';
	reason: string;
}
