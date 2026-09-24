import { __, _n, _x, sprintf } from '@wordpress/i18n';

import type { MyBooking } from '../../api/mineTypes';
import {
	capitalize,
	formatDayAndMonth,
	formatShortDate,
	formatTimeRange,
	parseDate,
} from '../../lib/dates';
import { closedText, Entry, laterInSeries, ruleLabel } from '../../lib/mine';
import Icon from '../Icon';

import type { CancelTarget } from './CancelMineDialog';

interface Props {
	entry: Entry;
	locale: string;
	onCancel: (target: CancelTarget) => void;
}

export function cancelTarget(
	booking: MyBooking,
	all: MyBooking[] = []
): CancelTarget {
	return {
		id: booking.id,
		roomName: booking.room.name,
		date: booking.date,
		start: booking.start,
		end: booking.end,
		purpose: booking.purpose,
		inSeries: booking.seriesId !== null,
		laterCount:
			booking.seriesId !== null
				? laterInSeries(all, booking).length
				: undefined,
	};
}

function Instructions({ text }: { text: string }) {
	if (!text) {
		return null;
	}
	return (
		<details className="creo-rombooking-details">
			<summary>{__('Room instructions', 'creo-rombooking')}</summary>
			<p className="creo-rombooking-instructions">{text}</p>
		</details>
	);
}

function StatusTag({ booking }: { booking: MyBooking }) {
	if (booking.status === 'approved') {
		return (
			<span className="creo-rombooking-tag is-approved">
				<Icon name="check" size={14} />
				{__('Confirmed', 'creo-rombooking')}
			</span>
		);
	}
	if (booking.status === 'requested') {
		return (
			<span className="creo-rombooking-tag is-conflict">
				<Icon name="clock" size={14} />
				{__('Waiting for approval', 'creo-rombooking')}
			</span>
		);
	}
	return (
		<span className="creo-rombooking-tag is-rejected">
			<Icon name="close" size={14} />
			{closedText(booking)}
		</span>
	);
}

/**
 * The date as a small calendar block, e.g. «30 sep.».
 *
 * @param props
 * @param props.date   The date.
 * @param props.locale The locale.
 */
function DateBlock({ date, locale }: { date: string; locale: string }) {
	const month = new Intl.DateTimeFormat(locale, {
		month: 'short',
		timeZone: 'UTC',
	}).format(parseDate(date));
	return (
		<div className="creo-rombooking-dateblock" aria-hidden="true">
			<span className="creo-rombooking-dateblock-day">
				{parseDate(date).getUTCDate()}
			</span>
			<span>{month}</span>
		</div>
	);
}

/**
 * A booking, or a series of bookings, in «My bookings».
 *
 * @param props          The component props.
 * @param props.entry
 * @param props.locale
 * @param props.onCancel
 */
export default function BookingEntry({ entry, locale, onCancel }: Props) {
	if (entry.kind === 'single') {
		const { booking } = entry;
		const headingId = `creo-rombooking-${entry.key}`;
		return (
			<li className="creo-rombooking-booking" aria-labelledby={headingId}>
				<DateBlock date={booking.date} locale={locale} />
				<div className="creo-rombooking-grow">
					<h4 id={headingId}>
						{`${capitalize(
							formatDayAndMonth(booking.date, locale)
						)}, ${formatTimeRange(booking.start, booking.end)}`}
					</h4>
					<p>
						<strong>{booking.room.name}</strong>
						{booking.purpose && ` · ${booking.purpose}`}
					</p>
					<StatusTag booking={booking} />
					<Instructions text={booking.instructions} />
					{booking.reason && (
						<p className="creo-rombooking-help">
							{sprintf(
								/* translators: %s: the reason */
								__('Reason: %s', 'creo-rombooking'),
								booking.reason
							)}
						</p>
					)}
				</div>
				{booking.cancellable && (
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						aria-describedby={headingId}
						onClick={() => onCancel(cancelTarget(booking))}
					>
						{_x('Cancel', 'a booking', 'creo-rombooking')}
					</button>
				)}
			</li>
		);
	}

	const [next] = entry.bookings;
	const headingId = `creo-rombooking-${entry.key}`;
	const waiting = entry.bookings.filter((b) => b.status === 'requested').length;
	const closed = entry.bookings.every(
		(b) => b.status === 'rejected' || b.status === 'cancelled'
	);

	return (
		<li className="creo-rombooking-booking" aria-labelledby={headingId}>
			<DateBlock date={next.date} locale={locale} />
			<div className="creo-rombooking-grow">
				<h4 id={headingId}>
					{[
						next.room.name,
						next.rule ? ruleLabel(next.rule) : '',
						formatTimeRange(next.start, next.end),
					]
						.filter(Boolean)
						.join(' · ')}
				</h4>
				<p>
					{closed
						? sprintf(
								/* translators: 1: first date, 2: number of dates */
								_n(
									'%2$d date from %1$s',
									'%2$d dates from %1$s',
									entry.bookings.length,
									'creo-rombooking'
								),
								formatDayAndMonth(next.date, locale),
								entry.bookings.length
						  )
						: sprintf(
								/* translators: 1: next date, 2: number of dates */
								_n(
									'Next: %1$s · %2$d date left',
									'Next: %1$s · %2$d dates left',
									entry.bookings.length,
									'creo-rombooking'
								),
								formatDayAndMonth(next.date, locale),
								entry.bookings.length
						  )}
					{next.purpose && ` · ${next.purpose}`}
				</p>
				<div className="creo-rombooking-actions">
					<span className="creo-rombooking-tag is-info">
						<Icon name="repeat" size={14} />
						{__('Series', 'creo-rombooking')}
					</span>
					{closed && <StatusTag booking={next} />}
					{waiting > 0 && (
						<span className="creo-rombooking-tag is-conflict">
							<Icon name="clock" size={14} />
							{sprintf(
								/* translators: %d: number of dates */
								_n(
									'%d waiting for approval',
									'%d waiting for approval',
									waiting,
									'creo-rombooking'
								),
								waiting
							)}
						</span>
					)}
				</div>
				<Instructions text={next.instructions} />
				<details className="creo-rombooking-details">
					<summary>{__('Show the dates', 'creo-rombooking')}</summary>
					<ul>
						{entry.bookings.map((booking) => {
							const label = capitalize(formatShortDate(booking.date, locale));
							return (
								<li key={booking.id}>
									<span className="creo-rombooking-grow">{label}</span>
									<StatusTag booking={booking} />
									{booking.cancellable && (
										<button
											type="button"
											className="creo-rombooking-button is-secondary is-small"
											aria-label={sprintf(
												/* translators: %s: date */
												__('Cancel %s', 'creo-rombooking'),
												label
											)}
											onClick={() =>
												onCancel(cancelTarget(booking, entry.bookings))
											}
										>
											{_x('Cancel', 'a booking', 'creo-rombooking')}
										</button>
									)}
								</li>
							);
						})}
					</ul>
				</details>
			</div>
			{next.cancellable && (
				<button
					type="button"
					className="creo-rombooking-button is-secondary"
					aria-describedby={headingId}
					onClick={() => onCancel(cancelTarget(next, entry.bookings))}
				>
					{_x('Cancel', 'a booking', 'creo-rombooking')}
				</button>
			)}
		</li>
	);
}
