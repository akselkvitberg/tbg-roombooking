import { useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { saveRoom } from '../../api/rooms';
import type { RoomInput, RoomSetup } from '../../api/roomTypes';
import useAction from '../../hooks/useAction';
import { slotTimes, SLOT } from '../../lib/admin';
import { formatTime } from '../../lib/dates';
import {
	DayHours,
	DESCRIPTION_MAX,
	fromDayHours,
	INSTRUCTIONS_MAX,
	toDayHours,
	weekdayName,
} from '../../lib/rooms';
import FieldError from '../admin/FieldError';
import Icon from '../Icon';

import ImagePicker from './ImagePicker';

interface Props {
	room: Omit<RoomSetup, 'id'> & { id: number | null };
	locale: string;
	onSaved: (message: string, room: RoomSetup) => void;
}

const id = (field: string) => `creo-rombooking-room-${field}`;

/**
 * The room's details, weekly opening hours, image and instructions.
 *
 * @param props         The component props.
 * @param props.room
 * @param props.locale
 * @param props.onSaved
 */
export default function RoomForm({ room, locale, onSaved }: Props) {
	const [name, setName] = useState(room.name);
	const [description, setDescription] = useState(room.description);
	const [capacity, setCapacity] = useState(room.capacity);
	const [approval, setApproval] = useState(room.approval);
	const [active, setActive] = useState(room.active);
	const [image, setImage] = useState({ id: room.imageId, url: room.imageUrl });
	const [instructions, setInstructions] = useState(room.instructions);
	const [days, setDays] = useState<DayHours[]>(() =>
		toDayHours(room.openingHours)
	);
	const summaryRef = useRef<HTMLDivElement>(null);
	const { busy, errors, error, run, setErrors } = useAction(() => undefined);

	const updateDay = (weekday: number, changes: Partial<DayHours>) =>
		setDays((current) =>
			current.map((day) =>
				day.weekday === weekday ? { ...day, ...changes } : day
			)
		);

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		const found: Record<string, string> = {};
		if (!name.trim()) {
			found.name = __(
				'Write a name of at most 100 characters.',
				'creo-rombooking'
			);
		}
		if (!Number.isInteger(capacity) || capacity < 1) {
			found.capacity = __(
				'Write the number of places, from 1 to 9999.',
				'creo-rombooking'
			);
		}
		days.forEach((day) => {
			if (day.open && day.end <= day.start) {
				found[`openingHours.${day.weekday}`] = __(
					'The closing time must be after the opening time.',
					'creo-rombooking'
				);
			}
		});
		if (Object.keys(found).length > 0) {
			setErrors(found);
			setTimeout(() => summaryRef.current?.focus());
			return;
		}

		const input: RoomInput = {
			name: name.trim(),
			description,
			capacity,
			approval,
			active,
			imageId: image.id,
			instructions,
			openingHours: fromDayHours(days),
		};
		let saved: RoomSetup | null = null;
		const ok = await run(async () => {
			const result = await saveRoom(room.id, input);
			saved = result.room;
			return result;
		});
		if (ok && saved) {
			onSaved(
				sprintf(
					/* translators: %s: room name */
					__('%s is saved.', 'creo-rombooking'),
					input.name
				),
				saved
			);
		} else {
			setTimeout(() => summaryRef.current?.focus());
		}
	};

	const fieldError = (field: string) => (
		<FieldError id={`${id(field)}-error`} message={errors[field]} />
	);
	const invalid = (field: string, hint?: string) => ({
		'aria-invalid': errors[field] ? true : undefined,
		'aria-describedby':
			[errors[field] && `${id(field)}-error`, hint].filter(Boolean).join(' ') ||
			undefined,
	});
	const summary = Object.entries(errors);

	return (
		<form noValidate className="creo-rombooking-room-form" onSubmit={submit}>
			{(summary.length > 0 || error) && (
				<div
					ref={summaryRef}
					className="creo-rombooking-message is-error"
					role="alert"
					tabIndex={-1}
				>
					<Icon name="warning" size={20} />
					<div>
						<strong>{__('Correct before you save', 'creo-rombooking')}</strong>
						{error && <p>{error}</p>}
						{summary.length > 0 && (
							<ul>
								{summary.map(([field, message]) => (
									<li key={field}>
										<a href={`#${id(field.replace('.', '-'))}`}>{message}</a>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			)}

			<section
				className="creo-rombooking-section"
				aria-labelledby={id('about')}
			>
				<h3 id={id('about')}>{__('About the room', 'creo-rombooking')}</h3>
				<div className="creo-rombooking-grid2">
					<div className="creo-rombooking-field">
						<label htmlFor={id('name')}>{__('Name', 'creo-rombooking')}</label>
						<input
							id={id('name')}
							className="creo-rombooking-input"
							maxLength={100}
							value={name}
							{...invalid('name')}
							onChange={(event) => setName(event.target.value)}
						/>
						{fieldError('name')}
					</div>
					<div className="creo-rombooking-field">
						<label htmlFor={id('capacity')}>
							{__('Number of places', 'creo-rombooking')}
						</label>
						<input
							id={id('capacity')}
							className="creo-rombooking-input creo-rombooking-input-short"
							type="number"
							min={1}
							max={9999}
							inputMode="numeric"
							value={capacity || ''}
							{...invalid('capacity')}
							onChange={(event) =>
								setCapacity(parseInt(event.target.value, 10) || 0)
							}
						/>
						{fieldError('capacity')}
					</div>
				</div>
				<div className="creo-rombooking-field">
					<label htmlFor={id('description')}>
						{__('Description', 'creo-rombooking')}{' '}
						<span className="creo-rombooking-optional">
							{__('(optional)', 'creo-rombooking')}
						</span>
					</label>
					<textarea
						id={id('description')}
						className="creo-rombooking-input"
						rows={2}
						maxLength={DESCRIPTION_MAX}
						value={description}
						{...invalid('description')}
						onChange={(event) => setDescription(event.target.value)}
					/>
					{fieldError('description')}
				</div>
				<fieldset className="creo-rombooking-fieldset">
					<legend>{__('Approval', 'creo-rombooking')}</legend>
					<div className="creo-rombooking-pills">
						{(
							[
								[
									'auto',
									__('Automatic when the time is available', 'creo-rombooking'),
								],
								['manual', __('The administrator approves', 'creo-rombooking')],
							] as const
						).map(([value, label]) => (
							<label
								key={value}
								className="creo-rombooking-pill"
								htmlFor={id(`approval-${value}`)}
							>
								<input
									id={id(`approval-${value}`)}
									type="radio"
									name="creo-rombooking-room-approval"
									checked={approval === value}
									onChange={() => setApproval(value)}
								/>
								{label}
							</label>
						))}
					</div>
				</fieldset>
				<label className="creo-rombooking-radio" htmlFor={id('active')}>
					<input
						id={id('active')}
						type="checkbox"
						checked={active}
						aria-describedby={id('active-hint')}
						onChange={(event) => setActive(event.target.checked)}
					/>
					{__('The room can be booked', 'creo-rombooking')}
				</label>
				<p id={id('active-hint')} className="creo-rombooking-help">
					{__(
						'Rooms are not deleted, so that earlier bookings are kept. Turn this off for a room that is no longer used.',
						'creo-rombooking'
					)}
				</p>
				<ImagePicker
					imageId={image.id}
					imageUrl={image.url}
					roomName={name}
					onChange={(imageId, url) => setImage({ id: imageId, url })}
				/>
			</section>

			<section
				className="creo-rombooking-section"
				aria-labelledby={id('hours')}
			>
				<h3 id={id('hours')}>{__('Opening hours', 'creo-rombooking')}</h3>
				<p className="creo-rombooking-help">
					{__(
						'Outside the opening hours, the room is shown as closed and cannot be booked.',
						'creo-rombooking'
					)}
				</p>
				{/* The table scrolls sideways on narrow screens. */}
				{/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
				<div
					className="creo-rombooking-table-scroll creo-rombooking-hours"
					tabIndex={0}
					role="region"
					aria-labelledby={id('hours')}
				>
					<table className="creo-rombooking-table">
						<thead>
							<tr>
								<th scope="col">{__('Day', 'creo-rombooking')}</th>
								<th scope="col">{__('Open', 'creo-rombooking')}</th>
								<th scope="col">{__('From', 'creo-rombooking')}</th>
								<th scope="col">{__('To', 'creo-rombooking')}</th>
							</tr>
						</thead>
						<tbody>
							{days.map((day) => {
								const dayName = weekdayName(day.weekday, locale);
								const field = `openingHours.${day.weekday}`;
								const fieldId = id(`openingHours-${day.weekday}`);
								return (
									<tr key={day.weekday}>
										<th scope="row">
											{dayName.charAt(0).toUpperCase() + dayName.slice(1)}
										</th>
										<td>
											<input
												id={fieldId}
												type="checkbox"
												checked={day.open}
												aria-label={sprintf(
													/* translators: %s: weekday */
													__('Open on %s', 'creo-rombooking'),
													dayName
												)}
												onChange={(event) =>
													updateDay(day.weekday, { open: event.target.checked })
												}
											/>
										</td>
										<td>
											<select
												className="creo-rombooking-input"
												value={day.start}
												disabled={!day.open}
												aria-label={sprintf(
													/* translators: %s: weekday */
													__('Opens on %s', 'creo-rombooking'),
													dayName
												)}
												onChange={(event) =>
													updateDay(day.weekday, {
														start: Number(event.target.value),
													})
												}
											>
												{slotTimes().map((minute) => (
													<option key={minute} value={minute}>
														{formatTime(minute)}
													</option>
												))}
											</select>
										</td>
										<td>
											<select
												className="creo-rombooking-input"
												value={day.end}
												disabled={!day.open}
												aria-label={sprintf(
													/* translators: %s: weekday */
													__('Closes on %s', 'creo-rombooking'),
													dayName
												)}
												aria-invalid={errors[field] ? true : undefined}
												aria-describedby={
													errors[field] ? `${id(field)}-error` : undefined
												}
												onChange={(event) =>
													updateDay(day.weekday, {
														end: Number(event.target.value),
													})
												}
											>
												{slotTimes().map((minute) => (
													<option key={minute} value={minute + SLOT}>
														{formatTime(minute + SLOT)}
													</option>
												))}
											</select>
											{fieldError(field)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			<section
				className="creo-rombooking-section"
				aria-labelledby={id('instructions-heading')}
			>
				<h3 id={id('instructions-heading')}>
					{__('Room instructions', 'creo-rombooking')}
				</h3>
				<div className="creo-rombooking-message is-warning">
					<Icon name="warning" size={20} />
					<div>
						<strong>
							{__('Never write codes or passwords', 'creo-rombooking')}
						</strong>
						<p id={id('instructions-warning')}>
							{__(
								'Everyone with a confirmed booking of the room sees the instructions under My bookings. Write how to get in and what to do afterwards, but not door codes, alarm codes, passwords or where keys are hidden.',
								'creo-rombooking'
							)}
						</p>
					</div>
				</div>
				<div className="creo-rombooking-field">
					<label htmlFor={id('instructions')}>
						{__('Instructions', 'creo-rombooking')}{' '}
						<span className="creo-rombooking-optional">
							{__('(optional)', 'creo-rombooking')}
						</span>
					</label>
					<textarea
						id={id('instructions')}
						className="creo-rombooking-input"
						rows={4}
						maxLength={INSTRUCTIONS_MAX}
						value={instructions}
						{...invalid(
							'instructions',
							`${id('instructions-warning')} ${id('instructions-count')}`
						)}
						onChange={(event) => setInstructions(event.target.value)}
					/>
					<p id={id('instructions-count')} className="creo-rombooking-help">
						{sprintf(
							/* translators: 1: characters used, 2: maximum */
							__('%1$d of %2$d characters', 'creo-rombooking'),
							instructions.length,
							INSTRUCTIONS_MAX
						)}
					</p>
					{fieldError('instructions')}
				</div>
			</section>

			<div className="creo-rombooking-actions">
				<button
					type="submit"
					className="creo-rombooking-button"
					disabled={busy}
				>
					{room.id === null
						? __('Create the room', 'creo-rombooking')
						: __('Save the room', 'creo-rombooking')}
				</button>
			</div>
		</form>
	);
}
