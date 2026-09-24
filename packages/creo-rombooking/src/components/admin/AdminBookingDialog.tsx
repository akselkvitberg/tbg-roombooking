import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { cancelBooking } from '../../api/admin';
import type { Room } from '../../api/types';
import {
	capitalize,
	formatDayAndMonth,
	formatTimeRange,
} from '../../lib/dates';
import Dialog from '../Dialog';

import CancelDialog from './CancelDialog';
import MoveDialog, { AdminBooking } from './MoveDialog';

interface Props {
	booking: AdminBooking;
	rooms: Room[];
	/** Where the booking was dropped; opens the move dialog directly. */
	to?: { roomId: number; start: number };
	today: string;
	locale: string;
	timezone: string;
	onDone: (message: string) => void;
	onClose: () => void;
}

/**
 * A booking in the overview: who booked and why, with Move and Cancel.
 * Moving from here is the keyboard alternative to dragging.
 *
 * @param props The component props.
 */
export default function AdminBookingDialog(props: Props) {
	const { booking, rooms, today, locale, timezone, onDone, onClose } = props;
	const [mode, setMode] = useState<'details' | 'move' | 'cancel'>(
		props.to ? 'move' : 'details'
	);

	if (mode === 'move') {
		return (
			<MoveDialog
				booking={booking}
				rooms={rooms}
				to={props.to}
				today={today}
				onDone={onDone}
				onClose={onClose}
			/>
		);
	}

	if (mode === 'cancel') {
		return (
			<CancelDialog
				booking={{
					roomId: booking.room.id,
					roomName: booking.room.name,
					date: booking.date,
					start: booking.start,
					end: booking.end,
					purpose: booking.purpose,
					people: booking.people,
					userName: booking.userName,
				}}
				rooms={rooms}
				locale={locale}
				timezone={timezone}
				submitLabel={__('Cancel the booking', 'creo-rombooking')}
				onSubmit={(reason, alternative) =>
					cancelBooking(booking.id, reason, alternative)
				}
				onDone={onDone}
				onClose={onClose}
			/>
		);
	}

	const approved = booking.status === 'approved';

	return (
		<Dialog
			title={sprintf(
				/* translators: %s: name of the member */
				__('Booking by %s', 'creo-rombooking'),
				booking.userName
			)}
			onClose={onClose}
			footer={
				<>
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						onClick={onClose}
					>
						{__('Close', 'creo-rombooking')}
					</button>
					{!booking.past && (
						<button
							type="button"
							className="creo-rombooking-button is-secondary"
							onClick={() => setMode('move')}
						>
							{__('Move…', 'creo-rombooking')}
						</button>
					)}
					{approved && !booking.past && (
						<button
							type="button"
							className="creo-rombooking-button is-danger"
							onClick={() => setMode('cancel')}
						>
							{__('Cancel the booking…', 'creo-rombooking')}
						</button>
					)}
				</>
			}
		>
			<dl className="creo-rombooking-summary">
				<dt>{__('Name', 'creo-rombooking')}</dt>
				<dd>{booking.userName}</dd>
				<dt>{__('Purpose', 'creo-rombooking')}</dt>
				<dd>{booking.purpose || '–'}</dd>
				<dt>{__('Room', 'creo-rombooking')}</dt>
				<dd>{booking.room.name}</dd>
				<dt>{__('Time', 'creo-rombooking')}</dt>
				<dd>{`${capitalize(
					formatDayAndMonth(booking.date, locale)
				)}, ${formatTimeRange(booking.start, booking.end)}`}</dd>
				<dt>{__('Number of people', 'creo-rombooking')}</dt>
				<dd>{booking.people > 0 ? booking.people : '–'}</dd>
				<dt>{__('Status', 'creo-rombooking')}</dt>
				<dd>
					{approved
						? __('Confirmed', 'creo-rombooking')
						: __('Waiting for approval', 'creo-rombooking')}
					{booking.seriesId !== null && ` · ${__('Series', 'creo-rombooking')}`}
				</dd>
			</dl>
			{!approved && (
				<p className="creo-rombooking-muted">
					{__(
						'Approve or decline the request under Requests.',
						'creo-rombooking'
					)}{' '}
					<a href="#rombooking=requests" onClick={onClose}>
						{__('Go to Requests', 'creo-rombooking')}
					</a>
				</p>
			)}
		</Dialog>
	);
}
