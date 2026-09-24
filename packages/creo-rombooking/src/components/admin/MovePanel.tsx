import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { moveExisting } from '../../api/admin';
import type { SingleItem } from '../../api/adminTypes';
import useAction from '../../hooks/useAction';
import { placesLabel } from '../../lib/admin';
import {
	capitalize,
	formatDayAndMonth,
	formatTimeRange,
} from '../../lib/dates';

import FieldError from './FieldError';
import ReasonField, { reasonRequired } from './ReasonField';

interface Props {
	item: SingleItem;
	locale: string;
	onDone: (message: string) => void;
	onCancel: () => void;
}

const id = (field: string) => `creo-rombooking-move-${field}`;

export default function MovePanel({ item, locale, onDone, onCancel }: Props) {
	const existing = item.existing[0];
	const options = item.moveOptions;
	const [roomId, setRoomId] = useState(options[0]?.id ?? 0);
	const [reason, setReason] = useState('');
	const reasonRef = useRef<HTMLTextAreaElement>(null);
	const firstRef = useRef<HTMLInputElement>(null);
	const { busy, errors, error, run, setErrors } = useAction(onDone);

	useEffect(() => (firstRef.current ?? reasonRef.current)?.focus(), []);

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		if (!reason.trim()) {
			setErrors({ reason: reasonRequired() });
			reasonRef.current?.focus();
			return;
		}
		run(() => moveExisting(item.bookingId, roomId, reason.trim()));
	};

	return (
		<form
			className="creo-rombooking-action-panel"
			noValidate
			aria-labelledby={id('title')}
			onSubmit={submit}
		>
			<h4 id={id('title')}>
				{sprintf(
					/* translators: %s: name of the owner of the booking */
					__('Move the booking of %s', 'creo-rombooking'),
					existing.user.name
				)}
			</h4>
			<p className="creo-rombooking-muted">
				{sprintf(
					/* translators: 1: date and time, 2: number of people */
					_n(
						'%1$s · %2$d person. When the booking has been moved, the new request is approved.',
						'%1$s · %2$d people. When the booking has been moved, the new request is approved.',
						existing.people,
						'creo-rombooking'
					),
					`${capitalize(
						formatDayAndMonth(existing.date, locale)
					)}, ${formatTimeRange(existing.start, existing.end)}`,
					existing.people
				)}
			</p>

			{options.length > 0 ? (
				<fieldset className="creo-rombooking-fieldset">
					<legend>{__('New room', 'creo-rombooking')}</legend>
					<div className="creo-rombooking-radio-cards">
						{options.map((option, index) => (
							// The label's text is the room name and places below.
							// eslint-disable-next-line jsx-a11y/label-has-associated-control
							<label
								key={option.id}
								className="creo-rombooking-radio-card"
								htmlFor={id(`room-${option.id}`)}
							>
								<input
									ref={index === 0 ? firstRef : undefined}
									id={id(`room-${option.id}`)}
									type="radio"
									name="creo-rombooking-move-room"
									checked={roomId === option.id}
									onChange={() => setRoomId(option.id)}
								/>
								<span>
									<strong>{option.name}</strong>
									<span className="creo-rombooking-help">
										{sprintf(
											/* translators: %s: number of places */
											__('%s · free at the same time', 'creo-rombooking'),
											placesLabel(option.capacity)
										)}
									</span>
								</span>
							</label>
						))}
					</div>
					<FieldError id={id('roomId-error')} message={errors.roomId} />
				</fieldset>
			) : (
				<p className="creo-rombooking-error">
					{__(
						'No room with enough places is free at the same time.',
						'creo-rombooking'
					)}
				</p>
			)}

			<ReasonField
				ref={reasonRef}
				id={id('reason')}
				label={sprintf(
					/* translators: %s: name of the owner of the booking */
					__('Reason to %s', 'creo-rombooking'),
					existing.user.name
				)}
				recipient={existing.user.name}
				value={reason}
				error={errors.reason}
				onChange={setReason}
			/>

			{error && (
				<p className="creo-rombooking-error" role="alert">
					{error}
				</p>
			)}

			<div className="creo-rombooking-actions">
				<button
					type="submit"
					className="creo-rombooking-button"
					disabled={busy || options.length === 0}
				>
					{__('Move and approve', 'creo-rombooking')}
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
