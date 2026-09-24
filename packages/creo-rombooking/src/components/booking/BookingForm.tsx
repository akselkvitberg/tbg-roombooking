import classnames from 'classnames';

import { useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { createBooking, errorMessage, fieldErrors } from '../../api/client';
import type {
	BookingInput,
	FieldErrors,
	OccurrenceStatus,
	Repeat,
	Room,
} from '../../api/types';
import usePreview from '../../hooks/usePreview';
import {
	approvalMessage,
	PEOPLE_MAX,
	PURPOSE_MAX,
	submitLabel,
	validateForm,
	withStart,
} from '../../lib/bookingForm';
import {
	capitalize,
	formatDayAndMonth,
	formatTime,
	formatTimeRange,
} from '../../lib/dates';
import Icon, { IconName } from '../Icon';
import { roomMeta } from '../matrix/DayMatrix';

interface Props {
	rooms: Room[];
	initial: BookingInput;
	/** Whether the chosen time was booked when the form opened. */
	fromBusy: boolean;
	askForPhone: boolean;
	locale: string;
	dayStart: number;
	dayEnd: number;
	slot: number;
	onCancel: () => void;
	onBooked: (message: string, kind: 'ok' | 'info') => void;
}

const id = (field: string) => `creo-rombooking-field-${field}`;
const errorId = (field: string) => `${id(field)}-error`;

/**
 * Fields that show their error right away; the others after the first try to send.
 */
const IMMEDIATE: (keyof BookingInput)[] = ['end', 'start'];

const FIELD_ORDER: (keyof BookingInput)[] = [
	'roomId',
	'date',
	'start',
	'end',
	'people',
	'purpose',
	'count',
	'endDate',
	'phone',
];

export default function BookingForm(props: Props) {
	const { rooms, locale, dayStart, dayEnd, slot } = props;
	const [form, setForm] = useState<BookingInput>(props.initial);
	const [showAll, setShowAll] = useState(false);
	const [serverErrors, setServerErrors] = useState<FieldErrors>({});
	const [sending, setSending] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);
	const summaryRef = useRef<HTMLDivElement>(null);

	const room = rooms.find((r) => r.id === form.roomId);
	const clientErrors = validateForm(form, {
		room,
		submitting: showAll,
		askForPhone: props.askForPhone,
	});
	// The number of people and phone number do not change which dates are available.
	const { preview, loading } = usePreview(
		form,
		Object.keys(clientErrors).every(
			(field) => field === 'people' || field === 'phone'
		)
	);
	const errors: FieldErrors = {
		...(preview?.errors ?? {}),
		...serverErrors,
		...clientErrors,
	};
	const visible = Object.fromEntries(
		Object.entries(errors).filter(
			([field]) =>
				showAll ||
				IMMEDIATE.includes(field as keyof BookingInput) ||
				// Too many people for the room is shown right away.
				(field === 'people' && form.people > 0)
		)
	) as FieldErrors;

	const repeating = form.repeat !== 'none';
	const counts = preview?.counts ?? null;
	const approval = preview?.approval ?? room?.approval ?? null;
	const message =
		counts && approval && room
			? approvalMessage(counts, approval, room.name, repeating)
			: null;

	// The error for too many people says the same, so the hint gives way to it.
	const showCapacity =
		!!room && room.capacity > 0 && !(visible.people && form.people > 0);

	const update = (changes: Partial<BookingInput>) => {
		setForm((current) => ({ ...current, ...changes }));
		setServerErrors({});
	};

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		setShowAll(true);
		setSendError(null);

		if (
			Object.keys({
				...errors,
				...validateForm(form, {
					room,
					submitting: true,
					askForPhone: props.askForPhone,
				}),
			}).length > 0
		) {
			summaryRef.current?.focus();
			return;
		}

		setSending(true);
		try {
			const result = await createBooking(form);
			props.onBooked(result.message, result.approved > 0 ? 'ok' : 'info');
		} catch (error) {
			const fields = fieldErrors(error);
			if (fields) {
				setServerErrors(fields);
			} else {
				setSendError(
					errorMessage(error) ??
						__('Could not send. Try again.', 'creo-rombooking')
				);
			}
			setSending(false);
			// Wait for the summary to render before moving focus to it.
			setTimeout(() => summaryRef.current?.focus());
		}
	};

	const fieldProps = (field: keyof BookingInput, hint?: string) => ({
		id: id(field),
		'aria-invalid': visible[field] ? true : undefined,
		'aria-describedby':
			[visible[field] && errorId(field), hint].filter(Boolean).join(' ') ||
			undefined,
	});

	const fieldError = (field: keyof BookingInput) =>
		visible[field] && (
			<p id={errorId(field)} className="creo-rombooking-error">
				<Icon name="warning" size={16} />
				{visible[field]}
			</p>
		);

	const summaryErrors = FIELD_ORDER.filter((field) => visible[field]);
	const startTimes: number[] = [];
	for (let minute = dayStart; minute < dayEnd; minute += slot) {
		startTimes.push(minute);
	}

	return (
		<form
			className="creo-rombooking-form"
			onSubmit={submit}
			noValidate
			aria-busy={sending}
		>
			<div className="creo-rombooking-dialog-body">
				{(summaryErrors.length > 0 && showAll) || sendError ? (
					<div
						ref={summaryRef}
						className="creo-rombooking-message is-error"
						role="alert"
						tabIndex={-1}
					>
						<Icon name="warning" size={20} />
						<div>
							<strong>
								{__('Correct the errors before you send', 'creo-rombooking')}
							</strong>
							{sendError && <p>{sendError}</p>}
							<ul>
								{summaryErrors.map((field) => (
									<li key={field}>
										<a
											href={`#${id(field)}`}
											onClick={(event) => {
												event.preventDefault();
												document.getElementById(id(field))?.focus();
											}}
										>
											{visible[field]}
										</a>
									</li>
								))}
							</ul>
						</div>
					</div>
				) : (
					<div ref={summaryRef} tabIndex={-1} />
				)}

				{props.fromBusy && !repeating && counts?.conflict === 1 && (
					<div className="creo-rombooking-message is-warning">
						<Icon name="warning" size={20} />
						<div>
							<strong>{__('This time is booked', 'creo-rombooking')}</strong>
							<p>
								{__(
									'Your request goes to the administrator, who decides whether it can be approved. You get a text message with the answer.',
									'creo-rombooking'
								)}
							</p>
						</div>
					</div>
				)}

				<div className="creo-rombooking-grid2">
					<div className="creo-rombooking-field">
						<label htmlFor={id('roomId')}>
							{__('Room', 'creo-rombooking')}
						</label>
						<select
							{...fieldProps('roomId')}
							className="creo-rombooking-input"
							value={form.roomId}
							onChange={(event) =>
								update({ roomId: Number(event.target.value) })
							}
						>
							{rooms.map((option) => (
								<option key={option.id} value={option.id}>
									{`${option.name} (${roomMeta(option)})`}
								</option>
							))}
						</select>
						{fieldError('roomId')}
					</div>

					<div className="creo-rombooking-field">
						<label htmlFor={id('date')}>{__('Date', 'creo-rombooking')}</label>
						<input
							{...fieldProps('date')}
							className="creo-rombooking-input"
							type="date"
							value={form.date}
							onChange={(event) => update({ date: event.target.value })}
						/>
						{fieldError('date')}
					</div>

					<div className="creo-rombooking-field">
						<label htmlFor={id('start')}>{__('From', 'creo-rombooking')}</label>
						<select
							{...fieldProps('start')}
							className="creo-rombooking-input"
							value={form.start}
							onChange={(event) => {
								setForm((current) =>
									withStart(current, Number(event.target.value), dayEnd)
								);
								setServerErrors({});
							}}
						>
							{startTimes.map((minute) => (
								<option key={minute} value={minute}>
									{formatTime(minute)}
								</option>
							))}
						</select>
						{fieldError('start')}
					</div>

					<div className="creo-rombooking-field">
						<label htmlFor={id('end')}>{__('To', 'creo-rombooking')}</label>
						<select
							{...fieldProps('end')}
							className="creo-rombooking-input"
							value={form.end}
							onChange={(event) => update({ end: Number(event.target.value) })}
						>
							{startTimes.map((minute) => (
								<option key={minute} value={minute + slot}>
									{formatTime(minute + slot)}
								</option>
							))}
						</select>
						{fieldError('end')}
					</div>
				</div>

				<div className="creo-rombooking-field">
					<label htmlFor={id('people')}>
						{__('Number of people', 'creo-rombooking')}
					</label>
					<input
						{...fieldProps(
							'people',
							showCapacity ? `${id('people')}-hint` : undefined
						)}
						className="creo-rombooking-input creo-rombooking-input-short"
						type="number"
						min={1}
						max={room?.capacity || PEOPLE_MAX}
						inputMode="numeric"
						required
						aria-required="true"
						value={form.people || ''}
						onChange={(event) =>
							update({ people: parseInt(event.target.value, 10) || 0 })
						}
					/>
					{showCapacity && (
						<p id={`${id('people')}-hint`} className="creo-rombooking-help">
							{sprintf(
								/* translators: 1: room name, 2: capacity */
								_n(
									'%1$s has room for %2$d person.',
									'%1$s has room for %2$d people.',
									room.capacity,
									'creo-rombooking'
								),
								room.name,
								room.capacity
							)}
						</p>
					)}
					{fieldError('people')}
				</div>

				<div className="creo-rombooking-field">
					<label htmlFor={id('purpose')}>
						{__('Purpose', 'creo-rombooking')}{' '}
						<span className="creo-rombooking-optional">
							{__('(optional)', 'creo-rombooking')}
						</span>
					</label>
					<textarea
						{...fieldProps('purpose', `${id('purpose')}-hint`)}
						className="creo-rombooking-input"
						rows={2}
						maxLength={PURPOSE_MAX}
						value={form.purpose}
						onChange={(event) => update({ purpose: event.target.value })}
					/>
					<p id={`${id('purpose')}-hint`} className="creo-rombooking-help">
						{sprintf(
							/* translators: 1: characters used, 2: maximum */
							__('%1$d of %2$d characters', 'creo-rombooking'),
							form.purpose.length,
							PURPOSE_MAX
						)}
					</p>
					{fieldError('purpose')}
				</div>

				<fieldset className="creo-rombooking-fieldset">
					<legend>{__('Repeat', 'creo-rombooking')}</legend>
					<div className="creo-rombooking-pills">
						{(
							[
								['none', __('Does not repeat', 'creo-rombooking')],
								['weekly', __('Weekly', 'creo-rombooking')],
								['biweekly', __('Every other week', 'creo-rombooking')],
								['monthly', __('Monthly', 'creo-rombooking')],
							] as [Repeat, string][]
						).map(([value, label]) => (
							<label
								key={value}
								className="creo-rombooking-pill"
								htmlFor={id(`repeat-${value}`)}
							>
								<input
									id={id(`repeat-${value}`)}
									type="radio"
									name="creo-rombooking-repeat"
									value={value}
									checked={form.repeat === value}
									onChange={() => update({ repeat: value })}
								/>
								{label}
							</label>
						))}
					</div>
				</fieldset>

				{repeating && (
					<fieldset className="creo-rombooking-fieldset">
						<legend>{__('Ends', 'creo-rombooking')}</legend>
						<div className="creo-rombooking-ends">
							<label
								className="creo-rombooking-radio"
								htmlFor={id('end-mode-count')}
							>
								<input
									id={id('end-mode-count')}
									type="radio"
									name="creo-rombooking-end-mode"
									checked={form.endMode === 'count'}
									onChange={() => update({ endMode: 'count' })}
								/>
								{__('After a number of times', 'creo-rombooking')}
							</label>
							<div className="creo-rombooking-field">
								<label htmlFor={id('count')} className="creo-rombooking-sr">
									{__('Number of times', 'creo-rombooking')}
								</label>
								<input
									{...fieldProps('count')}
									className="creo-rombooking-input"
									type="number"
									min={2}
									max={26}
									inputMode="numeric"
									disabled={form.endMode !== 'count'}
									value={Number.isNaN(form.count) ? '' : form.count}
									onChange={(event) =>
										update({ count: parseInt(event.target.value, 10) })
									}
								/>
								{fieldError('count')}
							</div>
							<label
								className="creo-rombooking-radio"
								htmlFor={id('end-mode-date')}
							>
								<input
									id={id('end-mode-date')}
									type="radio"
									name="creo-rombooking-end-mode"
									checked={form.endMode === 'date'}
									onChange={() => update({ endMode: 'date' })}
								/>
								{__('On a date', 'creo-rombooking')}
							</label>
							<div className="creo-rombooking-field">
								<label htmlFor={id('endDate')} className="creo-rombooking-sr">
									{__('End date', 'creo-rombooking')}
								</label>
								<input
									{...fieldProps('endDate')}
									className="creo-rombooking-input"
									type="date"
									disabled={form.endMode !== 'date'}
									value={form.endDate}
									onChange={(event) => update({ endDate: event.target.value })}
								/>
								{fieldError('endDate')}
							</div>
						</div>
					</fieldset>
				)}

				{repeating && preview && preview.occurrences.length > 0 && (
					<Occurrences
						occurrences={preview.occurrences}
						counts={preview.counts!}
						time={formatTimeRange(form.start, form.end)}
						locale={locale}
					/>
				)}

				<div role="status" aria-live="polite" className="creo-rombooking-live">
					{message && !loading && (
						<div className={`creo-rombooking-message is-${message.kind}`}>
							<Icon name={message.kind === 'ok' ? 'check' : 'info'} size={20} />
							<div>
								<strong>{message.title}</strong>
								<p>{message.text}</p>
							</div>
						</div>
					)}
				</div>

				{props.askForPhone && (
					<div className="creo-rombooking-field">
						<label htmlFor={id('phone')}>
							{__('Mobile number', 'creo-rombooking')}
						</label>
						<input
							{...fieldProps('phone', `${id('phone')}-hint`)}
							className="creo-rombooking-input"
							type="tel"
							autoComplete="tel"
							inputMode="tel"
							value={form.phone ?? ''}
							onChange={(event) => update({ phone: event.target.value })}
						/>
						<p id={`${id('phone')}-hint`} className="creo-rombooking-help">
							{__(
								'We send the answer by text message. The number is saved for next time.',
								'creo-rombooking'
							)}
						</p>
						{fieldError('phone')}
					</div>
				)}
			</div>

			<div className="creo-rombooking-dialog-foot">
				<button
					type="button"
					className="creo-rombooking-button is-secondary"
					onClick={props.onCancel}
				>
					{__('Cancel', 'creo-rombooking')}
				</button>
				<button
					type="submit"
					className="creo-rombooking-button"
					disabled={sending}
				>
					{sending
						? __('Sending…', 'creo-rombooking')
						: submitLabel(counts, approval, repeating)}
				</button>
			</div>
		</form>
	);
}

const occurrenceText: Record<
	OccurrenceStatus,
	{ label: () => string; icon: IconName }
> = {
	free: { label: () => __('Available', 'creo-rombooking'), icon: 'check' },
	conflict: {
		label: () => __('Conflict – goes to the administrator', 'creo-rombooking'),
		icon: 'warning',
	},
	outside: {
		label: () => __('Outside opening hours – left out', 'creo-rombooking'),
		icon: 'lock',
	},
};

function Occurrences(props: {
	occurrences: { date: string; status: OccurrenceStatus }[];
	counts: Record<OccurrenceStatus, number>;
	time: string;
	locale: string;
}) {
	const { occurrences, counts, time, locale } = props;
	const headingId = 'creo-rombooking-occurrences';

	return (
		<section
			className="creo-rombooking-occurrences"
			aria-labelledby={headingId}
		>
			<div className="creo-rombooking-occurrences-head">
				<h3 id={headingId}>{__('Preview of the dates', 'creo-rombooking')}</h3>
				<p className="creo-rombooking-help">
					{[
						sprintf(
							/* translators: %d: number of dates */
							_n(
								'%d available',
								'%d available',
								counts.free,
								'creo-rombooking'
							),
							counts.free
						),
						sprintf(
							/* translators: %d: number of dates */
							_n(
								'%d conflict',
								'%d conflicts',
								counts.conflict,
								'creo-rombooking'
							),
							counts.conflict
						),
						sprintf(
							/* translators: %d: number of dates */
							_n(
								'%d left out',
								'%d left out',
								counts.outside,
								'creo-rombooking'
							),
							counts.outside
						),
					].join(' · ')}
				</p>
			</div>
			{/* The list scrolls when it is long, so it must be reachable with the keyboard. */}
			{/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
			<ul tabIndex={0} aria-labelledby={headingId}>
				{occurrences.map((occurrence) => (
					<li
						key={occurrence.date}
						className={classnames({
							'is-outside': occurrence.status === 'outside',
						})}
					>
						<span className="creo-rombooking-occurrence-date">
							{capitalize(formatDayAndMonth(occurrence.date, locale))}
						</span>
						<span className="creo-rombooking-occurrence-time">{time}</span>
						<span className={`creo-rombooking-tag is-${occurrence.status}`}>
							<Icon name={occurrenceText[occurrence.status].icon} size={14} />
							{occurrenceText[occurrence.status].label()}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
