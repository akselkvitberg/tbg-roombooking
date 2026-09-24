import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { checkTime, propose } from '../../api/admin';
import type { SingleItem } from '../../api/adminTypes';
import type { OccurrenceStatus, Room } from '../../api/types';
import useAction from '../../hooks/useAction';
import { MESSAGE_MAX, placesLabel, slotTimes, SLOT } from '../../lib/admin';
import { formatTime } from '../../lib/dates';
import Icon from '../Icon';

import DeadlineField from './DeadlineField';
import FieldError from './FieldError';

interface Props {
	item: SingleItem;
	rooms: Room[];
	/** The room chosen among the suggestions, if any. */
	roomId: number | null;
	today: string;
	locale: string;
	timezone: string;
	onDone: (message: string) => void;
	onCancel: () => void;
}

const id = (field: string) => `creo-rombooking-propose-${field}`;

type Check = OccurrenceStatus | 'same' | null;

export default function ProposePanel(props: Props) {
	const { item, rooms, today, locale, timezone, onDone, onCancel } = props;
	const [roomId, setRoomId] = useState(
		props.roomId ?? item.suggestions.free[0]?.id ?? item.room.id
	);
	const [date, setDate] = useState(item.date);
	const [start, setStart] = useState(item.start);
	const [end, setEnd] = useState(item.end);
	const [deadline, setDeadline] = useState(48);
	const [message, setMessage] = useState('');
	const [check, setCheck] = useState<Check>(null);
	const roomRef = useRef<HTMLSelectElement>(null);
	const { busy, errors, error, run, setErrors } = useAction(onDone);

	const room = rooms.find((r) => r.id === roomId);
	const same =
		roomId === item.room.id &&
		date === item.date &&
		start === item.start &&
		end === item.end;

	useEffect(() => roomRef.current?.focus(), []);

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
		checkTime(roomId, date, start, end, [item.bookingId])
			.then((result) => current && setCheck(result.status))
			.catch(() => current && setCheck(null));
		return () => {
			current = false;
		};
	}, [roomId, date, start, end, same, item.bookingId]);

	const tooSmall = !!room && room.capacity > 0 && item.people > room.capacity;

	const validate = (): Record<string, string> => {
		if (end <= start) {
			return {
				end: __(
					'The end time must be after the start time.',
					'creo-rombooking'
				),
			};
		}
		if (same) {
			return {
				roomId: __(
					'Choose another room or time than the request.',
					'creo-rombooking'
				),
			};
		}
		if (check === 'conflict') {
			return {
				roomId: __('The room is not free at that time.', 'creo-rombooking'),
			};
		}
		if (check === 'outside') {
			return {
				roomId: __('The room is closed at that time.', 'creo-rombooking'),
			};
		}
		if (tooSmall) {
			return {
				roomId: sprintf(
					/* translators: 1: room name, 2: number of people */
					__('%1$s is too small for %2$d people.', 'creo-rombooking'),
					room.name,
					item.people
				),
			};
		}
		return {};
	};

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		const found = validate();
		if (Object.keys(found).length > 0) {
			setErrors(found);
			roomRef.current?.focus();
			return;
		}
		run(() =>
			propose(item.bookingId, { roomId, date, start, end, deadline, message })
		);
	};

	const describedBy = (field: string, ...more: string[]) =>
		[errors[field] && `${id(field)}-error`, ...more]
			.filter(Boolean)
			.join(' ') || undefined;

	return (
		<form
			className="creo-rombooking-action-panel"
			noValidate
			aria-labelledby={id('title')}
			onSubmit={submit}
		>
			<h4 id={id('title')}>
				{sprintf(
					/* translators: %s: name of the member */
					__('Propose another room or time to %s', 'creo-rombooking'),
					item.user.name
				)}
			</h4>

			<div className="creo-rombooking-grid2">
				<div className="creo-rombooking-field">
					<label htmlFor={id('roomId')}>{__('Room', 'creo-rombooking')}</label>
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
					<FieldError id={`${id('roomId')}-error`} message={errors.roomId} />
				</div>
				<div className="creo-rombooking-field">
					<label htmlFor={id('date')}>{__('Date', 'creo-rombooking')}</label>
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
					<label htmlFor={id('start')}>{__('From', 'creo-rombooking')}</label>
					<select
						id={id('start')}
						className="creo-rombooking-input"
						value={start}
						onChange={(event) => {
							const value = Number(event.target.value);
							setStart(value);
							if (end <= value) {
								setEnd(value + Math.max(end - start, SLOT));
							}
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
							/* translators: 1: room name, 2: number of places, 3: number of people wanted */
							__('%1$s has %2$s (%3$d wanted)', 'creo-rombooking'),
							room.name,
							placesLabel(room.capacity),
							item.people
						)}
					</span>
				)}
			</div>

			<div className="creo-rombooking-grid2">
				<DeadlineField
					id={id('deadline')}
					value={deadline}
					locale={locale}
					timezone={timezone}
					onChange={setDeadline}
				/>
				<div className="creo-rombooking-field">
					<label htmlFor={id('message')}>
						{__('Message', 'creo-rombooking')}{' '}
						<span className="creo-rombooking-optional">
							{__('(optional)', 'creo-rombooking')}
						</span>
					</label>
					<textarea
						id={id('message')}
						className="creo-rombooking-input"
						rows={2}
						maxLength={MESSAGE_MAX}
						value={message}
						aria-invalid={errors.message ? true : undefined}
						aria-describedby={describedBy('message', `${id('message')}-hint`)}
						onChange={(event) => setMessage(event.target.value)}
					/>
					<p id={`${id('message')}-hint`} className="creo-rombooking-help">
						{__(
							'Sent by text message. Do not write codes or passwords.',
							'creo-rombooking'
						)}
					</p>
					<FieldError id={`${id('message')}-error`} message={errors.message} />
				</div>
			</div>

			{error && (
				<p className="creo-rombooking-error" role="alert">
					{error}
				</p>
			)}

			<div className="creo-rombooking-actions">
				<button
					type="submit"
					className="creo-rombooking-button"
					disabled={busy}
				>
					{__('Send proposal', 'creo-rombooking')}
				</button>
				<button
					type="button"
					className="creo-rombooking-button is-secondary"
					onClick={onCancel}
				>
					{__('Cancel', 'creo-rombooking')}
				</button>
			</div>
		</form>
	);
}

/**
 * Whether the chosen room is free, as a tag.
 *
 * @param props
 * @param props.check The result of the check.
 */
export function CheckTag({ check }: { check: Check }) {
	if (check === 'free') {
		return (
			<span className="creo-rombooking-tag is-free">
				<Icon name="plus" size={14} />
				{__('Available', 'creo-rombooking')}
			</span>
		);
	}
	if (check === 'conflict' || check === 'same') {
		return (
			<span className="creo-rombooking-tag is-conflict">
				<Icon name="busy" size={14} />
				{__('Booked', 'creo-rombooking')}
			</span>
		);
	}
	if (check === 'outside') {
		return (
			<span className="creo-rombooking-tag is-outside">
				<Icon name="lock" size={14} />
				{__('Outside opening hours', 'creo-rombooking')}
			</span>
		);
	}
	return null;
}
