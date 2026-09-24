import { useMemo, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import type { Room } from '../api/types';
import BookingDialog, { Selection } from '../components/booking/BookingDialog';
import Icon from '../components/Icon';
import DayMatrix, { MatrixRow, roomMeta } from '../components/matrix/DayMatrix';
import Legend from '../components/matrix/Legend';
import MobileDayList from '../components/matrix/MobileDayList';
import Toolbar, { View } from '../components/matrix/Toolbar';
import WeekMatrix, { WeekDay } from '../components/matrix/WeekMatrix';
import useAvailability from '../hooks/useAvailability';
import useElementWidth from '../hooks/useElementWidth';
import {
	addDays,
	formatLongDate,
	formatWeekRange,
	isoWeek,
	startOfWeek,
} from '../lib/dates';
import { Segment, suggestedRange, toSegments } from '../lib/segments';
import type { Settings } from '../settings';

/**
 * Below this width, the day view shows one room at a time.
 */
const COMPACT_WIDTH = 640;

const HELP_ID = 'creo-rombooking-matrix-help';

interface Props {
	settings: Settings;
}

export default function BookView({ settings }: Props) {
	const { today, locale } = settings;
	const [date, setDate] = useState(today);
	const [view, setView] = useState<View>('day');
	const [roomId, setRoomId] = useState<number | null>(null);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [toast, setToast] = useState<{
		message: string;
		kind: 'ok' | 'info';
	} | null>(null);
	// The member gives a phone number with the first booking; later bookings do not ask.
	const [hasPhone, setHasPhone] = useState(settings.user.hasPhone);
	const [ref, width] = useElementWidth<HTMLDivElement>();
	const compact = width !== null && width < COMPACT_WIDTH;

	const monday = startOfWeek(date);
	const { rooms, availability, loading, error, reload } = useAvailability(
		view === 'week' ? monday : date,
		view === 'week' ? addDays(monday, 6) : date
	);

	const rows = useMemo((): MatrixRow[] => {
		if (!rooms || !availability) {
			return [];
		}
		// After switching from the week view, the chosen day is already loaded.
		const day =
			availability.days.find((d) => d.date === date) ?? availability.days[0];
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
	}, [rooms, availability, date]);

	const dataDate =
		availability?.days.find((d) => d.date === date)?.date ??
		availability?.days[0]?.date ??
		date;
	const mobileRow = rows.find((r) => r.room.id === roomId) ?? rows[0];
	const weekRoom = rooms?.find((r) => r.id === roomId) ?? rooms?.[0];

	const weekDays = useMemo((): WeekDay[] => {
		// While the next week loads, the previous one stays visible, as in the day view.
		if (!weekRoom || !availability || availability.days.length !== 7) {
			return [];
		}
		return availability.days.flatMap((day) => {
			const roomDay = day.rooms.find((r) => r.roomId === weekRoom.id);
			return roomDay
				? [
						{
							date: day.date,
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
	}, [weekRoom, availability]);

	const choose = (
		room: Room,
		day: string,
		segments: Segment[],
		index: number
	) => {
		const segment = segments[index];
		const range = suggestedRange(segments, index);
		setToast(null);
		setSelection({
			room,
			date: day,
			...range,
			status: segment.status,
			purpose: segment.period.booking?.purpose,
		});
	};

	const heading =
		view === 'week' && weekRoom
			? [
					weekRoom.name,
					sprintf(
						/* translators: %d: week number */
						__('Week %d', 'creo-rombooking'),
						isoWeek(monday)
					),
					formatWeekRange(monday, locale),
			  ].join(' · ')
			: formatLongDate(date, locale);

	let help = __(
		'Choose an available time to book. With a keyboard: the arrow keys move, Home and End go to the start and end of the row, Page Up and Page Down change day, and Enter opens.',
		'creo-rombooking'
	);
	if (view === 'week') {
		help = __(
			'Choose an available time to book. With a keyboard: the up and down arrows move within a day, the left and right arrows change day, Home and End go to the start and end of the day, Page Up and Page Down change week, and Enter opens.',
			'creo-rombooking'
		);
	} else if (compact) {
		help = __(
			'Choose an available time to book. With a keyboard: the up and down arrows move, Home and End go to the first and last time, Page Up and Page Down change day, and Enter opens.',
			'creo-rombooking'
		);
	}

	return (
		<div ref={ref} className="creo-rombooking-book">
			<Toolbar
				date={date}
				today={today}
				view={view}
				heading={heading}
				onDateChange={setDate}
				onViewChange={setView}
			/>

			{view === 'week' && !compact && rooms && rooms.length > 0 && (
				<div
					className="creo-rombooking-toggle is-wrapping"
					role="group"
					aria-label={__('Choose room', 'creo-rombooking')}
				>
					{rooms.map((room) => (
						<button
							key={room.id}
							type="button"
							aria-pressed={room.id === weekRoom?.id}
							onClick={() => setRoomId(room.id)}
						>
							{room.name}
						</button>
					))}
				</div>
			)}

			{compact && rooms && rooms.length > 0 && (
				<div className="creo-rombooking-field">
					<label htmlFor="creo-rombooking-room">
						{__('Room', 'creo-rombooking')}
					</label>
					<select
						id="creo-rombooking-room"
						className="creo-rombooking-input"
						value={(view === 'week' ? weekRoom : mobileRow?.room)?.id}
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
					<div
						className={`creo-rombooking-message ${
							toast.kind === 'ok' ? 'is-ok' : 'is-info'
						}`}
					>
						<Icon name={toast.kind === 'ok' ? 'check' : 'info'} size={20} />
						<div>
							<strong>{toast.message}</strong>
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

			{view === 'day' && rows.length > 0 && width !== null && (
				<>
					<p id={HELP_ID} className="creo-rombooking-help">
						{help}
					</p>
					{compact && mobileRow ? (
						<MobileDayList
							row={mobileRow}
							date={dataDate}
							locale={locale}
							busy={loading}
							helpId={HELP_ID}
							onChoose={(row, index) =>
								choose(row.room, dataDate, row.segments, index)
							}
							onDayChange={(days) => setDate(addDays(date, days))}
						/>
					) : (
						<DayMatrix
							rows={rows}
							date={dataDate}
							locale={locale}
							dayStart={availability!.day.start}
							dayEnd={availability!.day.end}
							slot={availability!.day.slot}
							busy={loading}
							helpId={HELP_ID}
							onChoose={(row, index) =>
								choose(row.room, dataDate, row.segments, index)
							}
							onDayChange={(days) => setDate(addDays(date, days))}
						/>
					)}
				</>
			)}

			{view === 'week' && weekRoom && weekDays.length > 0 && (
				<>
					<p id={HELP_ID} className="creo-rombooking-help">
						{help}
					</p>
					<WeekMatrix
						room={weekRoom}
						days={weekDays}
						initialDate={date}
						today={today}
						locale={locale}
						dayStart={availability!.day.start}
						dayEnd={availability!.day.end}
						slot={availability!.day.slot}
						busy={loading}
						helpId={HELP_ID}
						onChoose={(day, index) =>
							choose(weekRoom, day.date, day.segments, index)
						}
						onWeekChange={(weeks) => setDate(addDays(date, 7 * weeks))}
					/>
				</>
			)}

			{selection && rooms && availability && (
				<BookingDialog
					selection={selection}
					rooms={rooms}
					locale={locale}
					askForPhone={!hasPhone}
					day={availability.day}
					onClose={() => setSelection(null)}
					onBooked={(message, kind) => {
						setSelection(null);
						setToast({ message, kind });
						setHasPhone(true);
						reload();
					}}
				/>
			)}
		</div>
	);
}
