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

export type Repeat = 'none' | 'weekly' | 'biweekly' | 'monthly';

export interface BookingInput {
	roomId: number;
	date: string;
	start: number;
	end: number;
	purpose: string;
	/** 0 until the member fills it in. */
	people: number;
	repeat: Repeat;
	endMode: 'count' | 'date';
	count: number;
	endDate: string;
	phone?: string;
}

export type FieldErrors = Partial<Record<keyof BookingInput, string>>;

export type OccurrenceStatus = 'free' | 'conflict' | 'outside';

export interface Preview {
	approval: Approval | null;
	occurrences: { date: string; status: OccurrenceStatus }[];
	counts: Record<OccurrenceStatus, number> | null;
	errors: FieldErrors;
}

export interface BookingResult {
	bookings: { id: number; date: string; status: 'approved' | 'requested' }[];
	approved: number;
	requested: number;
	skipped: number;
	message: string;
}
