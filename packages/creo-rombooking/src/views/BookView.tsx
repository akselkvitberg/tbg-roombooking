import { useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import BookingDialog, { Selection } from '../components/booking/BookingDialog';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import DayMatrix, { MatrixRow, roomMeta } from '../components/matrix/DayMatrix';
import Legend from '../components/matrix/Legend';
import MobileDayList from '../components/matrix/MobileDayList';
import Toolbar, { View } from '../components/matrix/Toolbar';
import useAvailability from '../hooks/useAvailability';
import useElementWidth from '../hooks/useElementWidth';
import { addDays } from '../lib/dates';
import { suggestedRange, toSegments } from '../lib/segments';
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

	const { rooms, availability, loading, error, reload } = useAvailability(
		date,
		date
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
		const range = suggestedRange(row.segments, index);
		setToast(null);
		setSelection({
			room: row.room,
			date: dataDate,
			...range,
			status: segment.status,
			purpose: segment.period.booking?.purpose,
		});
	};

	const help = compact
		? __(
				'Choose an available time to book. With a keyboard: the up and down arrows move, Home and End go to the first and last time, Page Up and Page Down change day, and Enter opens.',
				'creo-rombooking'
		  )
		: __(
				'Choose an available time to book. With a keyboard: the arrow keys move, Home and End go to the start and end of the row, Page Up and Page Down change day, and Enter opens.',
				'creo-rombooking'
		  );

	return (
		<div ref={ref} className="creo-rombooking-book">
			<Toolbar
				date={date}
				today={today}
				locale={locale}
				view={view}
				onDateChange={setDate}
				onViewChange={setView}
			/>

			{compact && rooms && rooms.length > 0 && (
				<div className="creo-rombooking-field">
					<label htmlFor="creo-rombooking-room">
						{__('Room', 'creo-rombooking')}
					</label>
					<select
						id="creo-rombooking-room"
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

			{view === 'week' && (
				<EmptyState title={__('Week view', 'creo-rombooking')}>
					{__('The week view comes in a later version.', 'creo-rombooking')}
				</EmptyState>
			)}

			{view === 'day' && error !== null && (
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

			{view === 'day' && error === null && rows.length === 0 && (
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
							onChoose={choose}
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
							onChoose={choose}
							onDayChange={(days) => setDate(addDays(date, days))}
						/>
					)}
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
