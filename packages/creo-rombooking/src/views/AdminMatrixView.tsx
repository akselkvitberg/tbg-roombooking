import { useMemo, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { getAdminAvailability } from '../api/admin';
import type { Room } from '../api/types';
import AdminBookingDialog from '../components/admin/AdminBookingDialog';
import type { AdminBooking } from '../components/admin/MoveDialog';
import BookingDialog, { Selection } from '../components/booking/BookingDialog';
import Icon from '../components/Icon';
import DayMatrix, {
	AdminOptions,
	MatrixRow,
	roomMeta,
} from '../components/matrix/DayMatrix';
import Legend from '../components/matrix/Legend';
import MobileDayList from '../components/matrix/MobileDayList';
import Toolbar from '../components/matrix/Toolbar';
import useAvailability from '../hooks/useAvailability';
import useElementWidth from '../hooks/useElementWidth';
import { addDays, formatLongDate } from '../lib/dates';
import { Segment, suggestedRange, toSegments } from '../lib/segments';
import type { Settings } from '../settings';

const COMPACT_WIDTH = 640;
const HELP_ID = 'creo-rombooking-overview-help';

interface Props {
	settings: Settings;
}

function isBooking(segment: Segment): boolean {
	return (
		!!segment.period.booking &&
		['busy', 'mine', 'requested', 'mine-requested'].includes(segment.status)
	);
}

function toAdminBooking(
	room: Room,
	date: string,
	segment: Segment
): AdminBooking {
	const booking = segment.period.booking!;
	return {
		id: booking.id,
		seriesId: booking.seriesId,
		room,
		date,
		start: segment.start,
		end: segment.end,
		purpose: booking.purpose,
		people: booking.people ?? 0,
		userName: booking.userName ?? '',
		status:
			segment.status === 'busy' || segment.status === 'mine'
				? 'approved'
				: 'requested',
		past: segment.past,
	};
}

/**
 * The administrator's overview of a day: who booked every room, with moving
 * by dragging or from the booking's details, and cancelling.
 *
 * @param props          The component props.
 * @param props.settings
 */
export default function AdminMatrixView({ settings }: Props) {
	const { today, locale, timezone } = settings;
	const [date, setDate] = useState(today);
	const [roomId, setRoomId] = useState<number | null>(null);
	const [open, setOpen] = useState<{
		booking: AdminBooking;
		to?: { roomId: number; start: number };
	} | null>(null);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [ref, width] = useElementWidth<HTMLDivElement>();
	const compact = width !== null && width < COMPACT_WIDTH;

	const { rooms, availability, loading, error, reload } = useAvailability(
		date,
		date,
		getAdminAvailability
	);

	const rows = useMemo((): MatrixRow[] => {
		if (!rooms || !availability) {
			return [];
		}
		const day = availability.days[0];
		return rooms.flatMap((room) => {
			const roomDay = day.rooms.find((r) => r.roomId === room.id);
			return roomDay
				? [
						{
							room,
							segments: toSegments(
								roomDay.periods,
								availability.day.slot,
								day.date,
								availability.now
							),
						},
				  ]
				: [];
		});
	}, [rooms, availability]);

	const dataDate = availability?.days[0]?.date ?? date;
	const mobileRow = rows.find((r) => r.room.id === roomId) ?? rows[0];

	const choose = (row: MatrixRow, index: number) => {
		const segment = row.segments[index];
		setToast(null);
		if (isBooking(segment)) {
			setOpen({ booking: toAdminBooking(row.room, dataDate, segment) });
		} else if (segment.status === 'free' && !segment.past) {
			setSelection({
				room: row.room,
				date: dataDate,
				...suggestedRange(row.segments, index),
				status: 'free',
			});
		}
	};

	const admin: AdminOptions = {
		text: (segment) => {
			const name = segment.period.booking?.userName;
			return isBooking(segment) && name ? name : undefined;
		},
		description: (segment) => {
			const booking = segment.period.booking;
			if (!isBooking(segment) || !booking) {
				return undefined;
			}
			const who = [
				booking.userName,
				booking.purpose,
				booking.people
					? sprintf(
							/* translators: %d: number of people */
							__('%d people', 'creo-rombooking'),
							booking.people
					  )
					: '',
			]
				.filter(Boolean)
				.join(', ');
			return sprintf(
				/* translators: %s: who booked, why and how many */
				__('%s. Choose to see details, move or cancel.', 'creo-rombooking'),
				who
			);
		},
		actionable: (segment) =>
			isBooking(segment) || (segment.status === 'free' && !segment.past),
		canMove: (segment) => isBooking(segment) && !segment.past,
		onDrop: (segment, from, to, start) => {
			if (from.room.id === to.room.id && start === segment.start) {
				return;
			}
			setToast(null);
			setOpen({
				booking: toAdminBooking(from.room, dataDate, segment),
				to: { roomId: to.room.id, start },
			});
		},
	};

	const done = (message: string) => {
		setOpen(null);
		setSelection(null);
		setToast(message);
		reload();
	};

	return (
		<div ref={ref} className="creo-rombooking-book">
			<Toolbar
				date={date}
				today={today}
				view="day"
				heading={formatLongDate(date, locale)}
				canChangeView={false}
				onDateChange={setDate}
				onViewChange={() => undefined}
			/>

			{compact && rooms && rooms.length > 0 && (
				<div className="creo-rombooking-field">
					<label htmlFor="creo-rombooking-overview-room">
						{__('Room', 'creo-rombooking')}
					</label>
					<select
						id="creo-rombooking-overview-room"
						className="creo-rombooking-input"
						value={mobileRow?.room.id}
						onChange={(event) => setRoomId(Number(event.target.value))}
					>
						{rooms.map((room) => (
							<option key={room.id} value={room.id}>
								{`${room.name} (${roomMeta(room)})`}
							</option>
						))}
					</select>
				</div>
			)}

			<Legend />

			<div role="status" className="creo-rombooking-live">
				{toast && (
					<div className="creo-rombooking-message is-ok">
						<Icon name="check" size={20} />
						<div>
							<strong>{toast}</strong>
						</div>
						<button
							type="button"
							className="creo-rombooking-button is-secondary"
							onClick={() => setToast(null)}
						>
							{__('Close', 'creo-rombooking')}
						</button>
					</div>
				)}
			</div>

			{error !== null && (
				<div className="creo-rombooking-message is-error" role="alert">
					<div>
						<strong>
							{__('Could not load available times.', 'creo-rombooking')}
						</strong>
						{error && <p>{error}</p>}
					</div>
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						onClick={reload}
					>
						{__('Try again', 'creo-rombooking')}
					</button>
				</div>
			)}

			{error === null && rows.length === 0 && (
				<p className="creo-rombooking-loading" role="status">
					{loading
						? __('Loading available times…', 'creo-rombooking')
						: __('There are no rooms to book yet.', 'creo-rombooking')}
				</p>
			)}

			{rows.length > 0 && width !== null && availability && (
				<>
					<p id={HELP_ID} className="creo-rombooking-help">
						{compact
							? __(
									'Choose a booking to see who booked it, move it or cancel it. With a keyboard: the up and down arrows move, Page Up and Page Down change day, and Enter opens.',
									'creo-rombooking'
							  )
							: __(
									'Choose a booking to see who booked it, move it or cancel it, or drag it to another room or time. With a keyboard: the arrow keys move, Page Up and Page Down change day, and Enter opens.',
									'creo-rombooking'
							  )}
					</p>
					{compact && mobileRow ? (
						<MobileDayList
							row={mobileRow}
							date={dataDate}
							locale={locale}
							busy={loading}
							helpId={HELP_ID}
							admin={admin}
							onChoose={choose}
							onDayChange={(days) => setDate(addDays(date, days))}
						/>
					) : (
						<DayMatrix
							rows={rows}
							date={dataDate}
							locale={locale}
							dayStart={availability.day.start}
							dayEnd={availability.day.end}
							slot={availability.day.slot}
							busy={loading}
							helpId={HELP_ID}
							admin={admin}
							onChoose={choose}
							onDayChange={(days) => setDate(addDays(date, days))}
						/>
					)}
				</>
			)}

			{open && rooms && (
				<AdminBookingDialog
					booking={open.booking}
					to={open.to}
					rooms={rooms}
					today={today}
					locale={locale}
					timezone={timezone}
					onDone={done}
					onClose={() => setOpen(null)}
				/>
			)}

			{selection && rooms && availability && (
				<BookingDialog
					selection={selection}
					rooms={rooms}
					locale={locale}
					askForPhone={!settings.user.hasPhone}
					day={availability.day}
					onClose={() => setSelection(null)}
					onBooked={(message) => done(message)}
				/>
			)}
		</div>
	);
}
