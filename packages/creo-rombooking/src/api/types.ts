export type Approval = 'auto' | 'manual';

export interface Room {
	id: number;
	name: string;
	description: string;
	capacity: number;
	approval: Approval;
	imageUrl: string | null;
}

export type Status =
	| 'free'
	| 'busy'
	| 'requested'
	| 'closed'
	| 'mine'
	| 'mine-requested';

export interface Period {
	/** Minutes after midnight. */
	start: number;
	/** Minutes after midnight. */
	end: number;
	status: Status;
	reason?: {
		type: 'outside' | 'closed' | 'blocked';
		text: string;
	};
	booking?: {
		id: number;
		purpose: string;
		seriesId: number | null;
		userId?: number;
		userName?: string;
	};
}

export interface RoomDay {
	roomId: number;
	periods: Period[];
}

export interface Day {
	date: string;
	rooms: RoomDay[];
}

export interface Availability {
	from: string;
	to: string;
	now: {
		date: string;
		minute: number;
	};
	day: {
		start: number;
		end: number;
		slot: number;
	};
	days: Day[];
}
