export interface MineRoom {
	id: number;
	name: string;
}

export interface MyBooking {
	id: number;
	room: MineRoom;
	date: string;
	start: number;
	end: number;
	purpose: string;
	people: number;
	status: 'approved' | 'requested' | 'rejected' | 'cancelled';
	seriesId: number | null;
	rule: 'weekly' | 'biweekly' | 'monthly' | null;
	cancellable: boolean;
	/** For declined and cancelled bookings: what happened last, and why. */
	action?: string;
	reason?: string;
	byMe?: boolean;
	changedAt?: string;
}

export interface Proposal {
	id: number;
	bookingId: number;
	original: {
		room: MineRoom;
		date: string;
		start: number;
		end: number;
		purpose: string;
	};
	proposed: {
		room: MineRoom & { capacity: number };
		date: string;
		start: number;
		end: number;
	};
	message: string;
	/** `Y-m-d H:i:s`, the site's time. */
	expiresAt: string;
	/** Whether the booking was confirmed before the administrator cancelled it. */
	wasApproved: boolean;
}

export interface MyBookings {
	proposals: Proposal[];
	upcoming: MyBooking[];
	closed: MyBooking[];
}

export type CancelScope = 'this' | 'following';
