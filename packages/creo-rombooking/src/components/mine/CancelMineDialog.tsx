import { useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { cancelMyBooking } from '../../api/mine';
import type { CancelScope } from '../../api/mineTypes';
import useAction from '../../hooks/useAction';
import {
	capitalize,
	formatDayAndMonth,
	formatTimeRange,
} from '../../lib/dates';
import Dialog from '../Dialog';

export interface CancelTarget {
	id: number;
	roomName: string;
	date: string;
	start: number;
	end: number;
	purpose: string;
	/** Whether the booking is part of a series. */
	inSeries: boolean;
	/** How many dates «this and all later» covers, when known. */
	laterCount?: number;
}

interface Props {
	booking: CancelTarget;
	locale: string;
	onDone: (message: string) => void;
	onClose: () => void;
}

/**
 * The member cancels a booking, or it and the later dates of its series.
 *
 * @param props The component props.
 */
export default function CancelMineDialog(props: Props) {
	const { booking, locale, onDone, onClose } = props;
	const [scope, setScope] = useState<CancelScope>('this');
	const { busy, error, run } = useAction(onDone);
	const day = capitalize(formatDayAndMonth(booking.date, locale));
	const offerFollowing =
		booking.inSeries &&
		(booking.laterCount === undefined || booking.laterCount > 1);

	return (
		<Dialog
			title={__('Cancel the booking?', 'creo-rombooking')}
			onClose={onClose}
			bare
		>
			<form
				noValidate
				onSubmit={(event) => {
					event.preventDefault();
					run(() => cancelMyBooking(booking.id, scope));
				}}
			>
				<div className="creo-rombooking-dialog-body">
					<div className="creo-rombooking-card">
						<dl className="creo-rombooking-summary">
							<dt>{__('Room', 'creo-rombooking')}</dt>
							<dd>{booking.roomName}</dd>
							<dt>{__('Time', 'creo-rombooking')}</dt>
							<dd>{`${day}, ${formatTimeRange(
								booking.start,
								booking.end
							)}`}</dd>
							<dt>{__('Purpose', 'creo-rombooking')}</dt>
							<dd>{booking.purpose || '–'}</dd>
						</dl>
					</div>

					{offerFollowing && (
						<fieldset className="creo-rombooking-fieldset">
							<legend>
								{__('What do you want to cancel?', 'creo-rombooking')}
							</legend>
							<div className="creo-rombooking-radio-cards">
								{/* The label's text is in the strong element below. */}
								{/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
								<label
									className="creo-rombooking-radio-card"
									htmlFor="creo-rombooking-scope-this"
								>
									<input
										id="creo-rombooking-scope-this"
										type="radio"
										name="creo-rombooking-scope"
										checked={scope === 'this'}
										onChange={() => setScope('this')}
									/>
									<span>
										<strong>{__('Only this date', 'creo-rombooking')}</strong>
										<span className="creo-rombooking-help">{day}</span>
									</span>
								</label>
								{/* The label's text is in the strong element below. */}
								{/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
								<label
									className="creo-rombooking-radio-card"
									htmlFor="creo-rombooking-scope-following"
								>
									<input
										id="creo-rombooking-scope-following"
										type="radio"
										name="creo-rombooking-scope"
										checked={scope === 'following'}
										onChange={() => setScope('following')}
									/>
									<span>
										<strong>
											{__('This and all later dates', 'creo-rombooking')}
										</strong>
										<span className="creo-rombooking-help">
											{booking.laterCount
												? sprintf(
														/* translators: %d: number of dates */
														_n(
															'%d date in the series',
															'%d dates in the series',
															booking.laterCount,
															'creo-rombooking'
														),
														booking.laterCount
												  )
												: __('The rest of the series', 'creo-rombooking')}
										</span>
									</span>
								</label>
							</div>
						</fieldset>
					)}

					<p className="creo-rombooking-muted">
						{__(
							'The time becomes available for others. You get a text message as a receipt.',
							'creo-rombooking'
						)}
					</p>

					{error && (
						<p className="creo-rombooking-error" role="alert">
							{error}
						</p>
					)}
				</div>
				<div className="creo-rombooking-dialog-foot">
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						onClick={onClose}
					>
						{__('Keep the booking', 'creo-rombooking')}
					</button>
					<button
						type="submit"
						className="creo-rombooking-button is-danger"
						disabled={busy}
					>
						{scope === 'following'
							? __('Cancel the dates', 'creo-rombooking')
							: __('Cancel the booking', 'creo-rombooking')}
					</button>
				</div>
			</form>
		</Dialog>
	);
}
