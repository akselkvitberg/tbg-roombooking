import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { checkTime, moveBooking } from '../../api/admin';
import type { OccurrenceStatus, Room } from '../../api/types';
import useAction from '../../hooks/useAction';
import { placesLabel, slotTimes, SLOT } from '../../lib/admin';
import { formatTime } from '../../lib/dates';
import Dialog from '../Dialog';

import FieldError from './FieldError';
import { CheckTag } from './ProposePanel';
import ReasonField, { reasonRequired } from './ReasonField';

export interface AdminBooking {
	id: number;
	seriesId: number | null;
	room: Room;
	date: string;
	start: number;
	end: number;
	purpose: string;
	people: number;
	userName: string;
	status: 'approved' | 'requested';
	/** Whether the booking has started. */
	past: boolean;
}

interface Props {
	booking: AdminBooking;
	rooms: Room[];
	/** Where the booking was dropped, when it was dragged. */
	to?: { roomId: number; start: number };
	today: string;
	onDone: (message: string) => void;
	onClose: () => void;
}

const id = (field: string) => `creo-rombooking-move-booking-${field}`;

type Check = OccurrenceStatus | 'same' | null;

/**
 * Moves a booking to another room, date or time. Opens from the booking's
 * details, or when a booking is dropped in the overview.
 *
 * @param props The component props.
 */
export default function MoveDialog(props: Props) {
	const { booking, rooms, today, onDone, onClose } = props;
	const length = booking.end - booking.start;
	const [roomId, setRoomId] = useState(props.to?.roomId ?? booking.room.id);
	const [date, setDate] = useState(booking.date);
	const [start, setStart] = useState(props.to?.start ?? booking.start);
	const [end, setEnd] = useState((props.to?.start ?? booking.start) + length);
	const [reason, setReason] = useState('');
	const [check, setCheck] = useState<Check>(null);
	const roomRef = useRef<HTMLSelectElement>(null);
	const reasonRef = useRef<HTMLTextAreaElement>(null);
	const { busy, errors, error, run, setErrors } = useAction(onDone);

	const room = rooms.find((r) => r.id === roomId);
	const same =
		roomId === booking.room.id &&
		date === booking.date &&
		start === booking.start &&
		end === booking.end;
	const tooSmall =
		!!room && room.capacity > 0 && booking.people > room.capacity;

	// When the booking was dropped, the place is chosen, so the reason comes next.
	useEffect(() => (props.to ? reasonRef : roomRef).current?.focus(), []); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (same) {
			setCheck('same');
			return;
		}
		if (end <= start || !date) {
			setCheck(null);
			return;
		}
		let current = true;
		setCheck(null);
		checkTime(roomId, date, start, end, [booking.id])
			.then((result) => current && setCheck(result.status))
			.catch(() => current && setCheck(null));
		return () => {
			current = false;
		};
	}, [roomId, date, start, end, same, booking.id]);

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		const found: Record<string, string> = {};
		if (end <= start) {
			found.end = __(
				'The end time must be after the start time.',
				'creo-rombooking'
			);
		} else if (same) {
			found.roomId = __('Choose another room or time.', 'creo-rombooking');
		} else if (check === 'conflict') {
			found.roomId = __(
				'The room is not free at that time.',
				'creo-rombooking'
			);
		} else if (check === 'outside') {
			found.roomId = __('The room is closed at that time.', 'creo-rombooking');
		} else if (tooSmall) {
			found.roomId = sprintf(
				/* translators: 1: room name, 2: number of people */
				__('%1$s is too small for %2$d people.', 'creo-rombooking'),
				room.name,
				booking.people
			);
		}
		if (!reason.trim()) {
			found.reason = reasonRequired();
		}
		if (Object.keys(found).length > 0) {
			setErrors(found);
			(found.reason && Object.keys(found).length === 1
				? reasonRef
				: roomRef
			).current?.focus();
			return;
		}
		run(() =>
			moveBooking(booking.id, {
				roomId,
				date,
				start,
				end,
				reason: reason.trim(),
			})
		);
	};

	const describedBy = (field: string, ...more: string[]) =>
		[errors[field] && `${id(field)}-error`, ...more]
			.filter(Boolean)
			.join(' ') || undefined;

	return (
		<Dialog
			title={sprintf(
				/* translators: %s: name of the member */
				__('Move the booking of %s', 'creo-rombooking'),
				booking.userName
			)}
			onClose={onClose}
			bare
		>
			<form noValidate onSubmit={submit}>
				<div className="creo-rombooking-dialog-body">
					<div className="creo-rombooking-grid2">
						<div className="creo-rombooking-field">
							<label htmlFor={id('roomId')}>
								{__('Room', 'creo-rombooking')}
							</label>
							<select
								ref={roomRef}
								id={id('roomId')}
								className="creo-rombooking-input"
								value={roomId}
								aria-invalid={errors.roomId ? true : undefined}
								aria-describedby={describedBy('roomId', id('status'))}
								onChange={(event) => {
									setRoomId(Number(event.target.value));
									setErrors({});
								}}
							>
								{rooms.map((r) => (
									<option key={r.id} value={r.id}>
										{`${r.name} (${placesLabel(r.capacity)})`}
									</option>
								))}
							</select>
							<FieldError
								id={`${id('roomId')}-error`}
								message={errors.roomId}
							/>
						</div>
						<div className="creo-rombooking-field">
							<label htmlFor={id('date')}>
								{__('Date', 'creo-rombooking')}
							</label>
							<input
								id={id('date')}
								className="creo-rombooking-input"
								type="date"
								min={today}
								value={date}
								aria-invalid={errors.date ? true : undefined}
								aria-describedby={describedBy('date')}
								onChange={(event) => {
									setDate(event.target.value);
									setErrors({});
								}}
							/>
							<FieldError id={`${id('date')}-error`} message={errors.date} />
						</div>
						<div className="creo-rombooking-field">
							<label htmlFor={id('start')}>
								{__('From', 'creo-rombooking')}
							</label>
							<select
								id={id('start')}
								className="creo-rombooking-input"
								value={start}
								onChange={(event) => {
									const value = Number(event.target.value);
									setStart(value);
									// Keep the length when the start moves.
									setEnd(Math.min(value + Math.max(end - start, SLOT), 1320));
									setErrors({});
								}}
							>
								{slotTimes().map((minute) => (
									<option key={minute} value={minute}>
										{formatTime(minute)}
									</option>
								))}
							</select>
						</div>
						<div className="creo-rombooking-field">
							<label htmlFor={id('end')}>{__('To', 'creo-rombooking')}</label>
							<select
								id={id('end')}
								className="creo-rombooking-input"
								value={end}
								aria-invalid={errors.end ? true : undefined}
								aria-describedby={describedBy('end')}
								onChange={(event) => {
									setEnd(Number(event.target.value));
									setErrors({});
								}}
							>
								{slotTimes().map((minute) => (
									<option key={minute} value={minute + SLOT}>
										{formatTime(minute + SLOT)}
									</option>
								))}
							</select>
							<FieldError id={`${id('end')}-error`} message={errors.end} />
						</div>
					</div>

					<div
						id={id('status')}
						className="creo-rombooking-check"
						role="status"
						aria-live="polite"
					>
						<CheckTag check={check} />
						{room && (
							<span className="creo-rombooking-help">
								{sprintf(
									/* translators: 1: room name, 2: number of places, 3: number of people needed */
									__('%1$s has %2$s (%3$d needed)', 'creo-rombooking'),
									room.name,
									placesLabel(room.capacity),
									booking.people
								)}
							</span>
						)}
					</div>

					{booking.seriesId !== null && (
						<p className="creo-rombooking-muted">
							{__(
								'The booking is part of a series. Only this date is moved.',
								'creo-rombooking'
							)}
						</p>
					)}

					<ReasonField
						ref={reasonRef}
						id={id('reason')}
						label={__('Reason', 'creo-rombooking')}
						recipient={booking.userName}
						value={reason}
						error={errors.reason}
						onChange={setReason}
					/>

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
						{__('Cancel', 'creo-rombooking')}
					</button>
					<button
						type="submit"
						className="creo-rombooking-button"
						disabled={busy}
					>
						{__('Move the booking', 'creo-rombooking')}
					</button>
				</div>
			</form>
		</Dialog>
	);
}
