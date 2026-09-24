import { __ } from '@wordpress/i18n';

import type { Room, Status } from '../../api/types';
import { formatLongDate, formatTimeRange } from '../../lib/dates';
import Dialog from '../Dialog';
import Icon from '../Icon';

export interface Selection {
	room: Room;
	date: string;
	start: number;
	end: number;
	status: Status;
}

interface Props {
	selection: Selection;
	locale: string;
	onClose: () => void;
}

/**
 * Opens when a time is chosen in the matrix. The booking form itself comes
 * in the next phase; for now it shows what was chosen.
 *
 * @param props The component props.
 */
export default function BookingDialog(props: Props) {
	const { selection, locale, onClose } = props;
	const { room, date, start, end, status } = selection;
	const isBusy = status === 'busy' || status === 'requested';
	const isMine = status === 'mine' || status === 'mine-requested';

	return (
		<Dialog
			title={
				isMine
					? __('Your booking', 'creo-rombooking')
					: __('New booking', 'creo-rombooking')
			}
			onClose={onClose}
			footer={
				<button
					type="button"
					className="creo-rombooking-button is-secondary"
					onClick={onClose}
				>
					{__('Close', 'creo-rombooking')}
				</button>
			}
		>
			{isBusy && (
				<div className="creo-rombooking-message is-warning">
					<Icon name="warning" size={20} />
					<div>
						<strong>{__('This time is booked', 'creo-rombooking')}</strong>
						<p>
							{__(
								'Your request goes to the administrator, who decides whether it can be approved. You get a text message with the answer.',
								'creo-rombooking'
							)}
						</p>
					</div>
				</div>
			)}
			<dl className="creo-rombooking-summary">
				<dt>{__('Room', 'creo-rombooking')}</dt>
				<dd>{room.name}</dd>
				<dt>{__('Date', 'creo-rombooking')}</dt>
				<dd>{formatLongDate(date, locale)}</dd>
				<dt>{__('Time', 'creo-rombooking')}</dt>
				<dd>{formatTimeRange(start, end)}</dd>
			</dl>
			<p className="creo-rombooking-muted">
				{isMine
					? __(
							'You can see and cancel your bookings under My bookings.',
							'creo-rombooking'
					  )
					: __(
							'The booking form comes in the next version.',
							'creo-rombooking'
					  )}
			</p>
		</Dialog>
	);
}
