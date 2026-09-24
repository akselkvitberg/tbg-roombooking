import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import type { Room, Status } from '../../api/types';
import { initialForm } from '../../lib/bookingForm';
import { formatLongDate, formatTimeRange } from '../../lib/dates';
import Dialog from '../Dialog';
import CancelMineDialog from '../mine/CancelMineDialog';

import BookingForm from './BookingForm';

export interface Selection {
	room: Room;
	date: string;
	start: number;
	end: number;
	status: Status;
	purpose?: string;
	/** For the member's own booking. */
	bookingId?: number;
	seriesId?: number | null;
	/** Whether the time has started. */
	past?: boolean;
}

interface Props {
	selection: Selection;
	rooms: Room[];
	locale: string;
	askForPhone: boolean;
	day: { start: number; end: number; slot: number };
	onClose: () => void;
	onBooked: (message: string, kind: 'ok' | 'info') => void;
}

/**
 * Opens when a time is chosen in the matrix: the booking form, or the
 * details of the member's own booking.
 *
 * @param props The component props.
 */
export default function BookingDialog(props: Props) {
	const { selection, locale, onClose } = props;
	const { room, date, start, end, status } = selection;
	const [cancelling, setCancelling] = useState(false);
	const canCancel = !!selection.bookingId && !selection.past;

	if (cancelling && selection.bookingId) {
		return (
			<CancelMineDialog
				booking={{
					id: selection.bookingId,
					roomName: room.name,
					date,
					start,
					end,
					purpose: selection.purpose ?? '',
					inSeries: !!selection.seriesId,
				}}
				locale={locale}
				onDone={(message) => props.onBooked(message, 'ok')}
				onClose={onClose}
			/>
		);
	}

	if (status === 'mine' || status === 'mine-requested') {
		return (
			<Dialog
				title={__('Your booking', 'creo-rombooking')}
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
						{canCancel && (
							<button
								type="button"
								className="creo-rombooking-button is-danger"
								onClick={() => setCancelling(true)}
							>
								{__('Cancel the booking…', 'creo-rombooking')}
							</button>
						)}
					</>
				}
			>
				<dl className="creo-rombooking-summary">
					<dt>{__('Room', 'creo-rombooking')}</dt>
					<dd>{room.name}</dd>
					<dt>{__('Date', 'creo-rombooking')}</dt>
					<dd>{formatLongDate(date, locale)}</dd>
					<dt>{__('Time', 'creo-rombooking')}</dt>
					<dd>{formatTimeRange(start, end)}</dd>
					{selection.purpose && (
						<>
							<dt>{__('Purpose', 'creo-rombooking')}</dt>
							<dd>{selection.purpose}</dd>
						</>
					)}
					<dt>{__('Status', 'creo-rombooking')}</dt>
					<dd>
						{status === 'mine'
							? __('Confirmed', 'creo-rombooking')
							: __('Waiting for approval', 'creo-rombooking')}
					</dd>
				</dl>
				<p className="creo-rombooking-muted">
					{__(
						'All your bookings are listed under My bookings.',
						'creo-rombooking'
					)}
				</p>
			</Dialog>
		);
	}

	return (
		<Dialog title={__('New booking', 'creo-rombooking')} onClose={onClose} bare>
			<BookingForm
				rooms={props.rooms}
				initial={initialForm({ roomId: room.id, date, start, end, status })}
				fromBusy={status === 'busy' || status === 'requested'}
				askForPhone={props.askForPhone}
				locale={locale}
				dayStart={props.day.start}
				dayEnd={props.day.end}
				slot={props.day.slot}
				onCancel={onClose}
				onBooked={props.onBooked}
			/>
		</Dialog>
	);
}
