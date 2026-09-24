import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { checkTime } from '../../api/admin';
import type { ActionResult, Alternative } from '../../api/adminTypes';
import type { OccurrenceStatus, Room } from '../../api/types';
import useAction from '../../hooks/useAction';
import { placesLabel } from '../../lib/admin';
import {
	capitalize,
	formatDayAndMonth,
	formatTimeRange,
} from '../../lib/dates';
import Dialog from '../Dialog';

import DeadlineField from './DeadlineField';
import FieldError from './FieldError';
import { CheckTag } from './ProposePanel';
import ReasonField, { reasonRequired } from './ReasonField';

export interface CancelTarget {
	roomId: number;
	roomName: string;
	date: string;
	start: number;
	end: number;
	purpose: string;
	people: number;
	userName: string;
}

interface Props {
	booking: CancelTarget;
	/** The request that gets the time, when cancelling to solve a conflict. */
	replacement?: { name: string; purpose: string };
	rooms: Room[];
	/** Rooms to suggest first as an alternative. */
	preferred?: number[];
	locale: string;
	timezone: string;
	submitLabel: string;
	onSubmit: (
		reason: string,
		alternative: Alternative | null
	) => Promise<ActionResult>;
	onDone: (message: string) => void;
	onClose: () => void;
}

const id = (field: string) => `creo-rombooking-cancel-${field}`;

/**
 * Cancels a booking as an administrator: a required reason, sent by text
 * message, and optionally another room at the same time.
 *
 * @param props The component props.
 */
export default function CancelDialog(props: Props) {
	const { booking, replacement, locale, timezone, onDone, onClose } = props;
	const others = props.rooms.filter((room) => room.id !== booking.roomId);
	const [reason, setReason] = useState('');
	const [attach, setAttach] = useState(false);
	const [roomId, setRoomId] = useState(
		props.preferred?.[0] ?? others[0]?.id ?? 0
	);
	const [deadline, setDeadline] = useState(48);
	const [check, setCheck] = useState<OccurrenceStatus | null>(null);
	const reasonRef = useRef<HTMLTextAreaElement>(null);
	const { busy, errors, error, run, setErrors } = useAction(onDone);

	const room = others.find((r) => r.id === roomId);
	const tooSmall =
		!!room && room.capacity > 0 && booking.people > room.capacity;

	useEffect(() => reasonRef.current?.focus(), []);

	useEffect(() => {
		if (!attach || !roomId) {
			return;
		}
		let current = true;
		setCheck(null);
		checkTime(roomId, booking.date, booking.start, booking.end)
			.then((result) => current && setCheck(result.status))
			.catch(() => current && setCheck(null));
		return () => {
			current = false;
		};
	}, [attach, roomId, booking.date, booking.start, booking.end]);

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		const found: Record<string, string> = {};
		if (!reason.trim()) {
			found.reason = reasonRequired();
		}
		if (attach && (check === 'conflict' || check === 'outside')) {
			found.alternativeRoomId = __(
				'The room is not free at that time.',
				'creo-rombooking'
			);
		} else if (attach && tooSmall) {
			found.alternativeRoomId = sprintf(
				/* translators: 1: room name, 2: number of people */
				__('%1$s is too small for %2$d people.', 'creo-rombooking'),
				room.name,
				booking.people
			);
		}
		if (Object.keys(found).length > 0) {
			setErrors(found);
			if (found.reason) {
				reasonRef.current?.focus();
			} else {
				document.getElementById(id('room'))?.focus();
			}
			return;
		}
		run(() =>
			props.onSubmit(reason.trim(), attach ? { roomId, deadline } : null)
		);
	};

	const time = `${capitalize(
		formatDayAndMonth(booking.date, locale)
	)}, ${formatTimeRange(booking.start, booking.end)}`;

	return (
		<Dialog
			title={sprintf(
				/* translators: %s: name of the owner of the booking */
				__('Cancel the booking of %s?', 'creo-rombooking'),
				booking.userName
			)}
			onClose={onClose}
			bare
		>
			<form noValidate onSubmit={submit}>
				<div className="creo-rombooking-dialog-body">
					<div className="creo-rombooking-card">
						<dl className="creo-rombooking-summary">
							<dt>{__('Room', 'creo-rombooking')}</dt>
							<dd>{booking.roomName}</dd>
							<dt>{__('Time', 'creo-rombooking')}</dt>
							<dd>{time}</dd>
							<dt>{__('Purpose', 'creo-rombooking')}</dt>
							<dd>{booking.purpose || '–'}</dd>
							{replacement && (
								<>
									<dt>{__('Replaced by', 'creo-rombooking')}</dt>
									<dd>
										{replacement.purpose
											? `${replacement.name} – ${replacement.purpose}`
											: replacement.name}
									</dd>
								</>
							)}
						</dl>
					</div>

					<ReasonField
						ref={reasonRef}
						id={id('reason')}
						label={__('Reason', 'creo-rombooking')}
						recipient={booking.userName}
						value={reason}
						error={errors.reason}
						onChange={setReason}
					/>

					<label className="creo-rombooking-radio" htmlFor={id('attach')}>
						<input
							id={id('attach')}
							type="checkbox"
							checked={attach}
							onChange={(event) => setAttach(event.target.checked)}
						/>
						{__('Attach a proposal of another room', 'creo-rombooking')}
					</label>

					{attach && (
						<>
							<div className="creo-rombooking-grid2">
								<div className="creo-rombooking-field">
									<label htmlFor={id('room')}>
										{__('Other room, same time', 'creo-rombooking')}
									</label>
									<select
										id={id('room')}
										className="creo-rombooking-input"
										value={roomId}
										aria-invalid={errors.alternativeRoomId ? true : undefined}
										aria-describedby={
											[
												errors.alternativeRoomId && id('room-error'),
												id('status'),
											]
												.filter(Boolean)
												.join(' ') || undefined
										}
										onChange={(event) => {
											setRoomId(Number(event.target.value));
											setErrors({});
										}}
									>
										{others.map((r) => (
											<option key={r.id} value={r.id}>
												{`${r.name} (${placesLabel(r.capacity)})`}
											</option>
										))}
									</select>
									<FieldError
										id={id('room-error')}
										message={errors.alternativeRoomId}
									/>
								</div>
								<DeadlineField
									id={id('deadline')}
									value={deadline}
									locale={locale}
									timezone={timezone}
									onChange={setDeadline}
								/>
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
						</>
					)}

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
						className="creo-rombooking-button is-danger"
						disabled={busy}
					>
						{props.submitLabel}
					</button>
				</div>
			</form>
		</Dialog>
	);
}
