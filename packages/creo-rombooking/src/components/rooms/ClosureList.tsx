import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { addClosure, deleteClosure } from '../../api/rooms';
import type { Closure } from '../../api/roomTypes';
import useAction from '../../hooks/useAction';
import { slotTimes, SLOT } from '../../lib/admin';
import {
	capitalize,
	formatDayAndMonth,
	formatTime,
	formatTimeRange,
} from '../../lib/dates';
import { closureTypeLabel } from '../../lib/rooms';
import FieldError from '../admin/FieldError';
import Icon from '../Icon';

interface Props {
	roomId: number;
	roomName: string;
	closures: Closure[];
	today: string;
	locale: string;
	onChange: (message: string, closures: Closure[]) => void;
}

const id = (field: string) => `creo-rombooking-closure-${field}`;

/**
 * Dates when the room is closed, or times when it is blocked, e.g. for
 * cleaning. They are saved at once, apart from the room's other settings.
 *
 * @param props The component props.
 */
export default function ClosureList(props: Props) {
	const { roomId, roomName, closures, today, locale, onChange } = props;
	const [date, setDate] = useState(today);
	const [wholeDay, setWholeDay] = useState(true);
	const [start, setStart] = useState(480);
	const [end, setEnd] = useState(720);
	const [type, setType] = useState<'closed' | 'blocked'>('closed');
	const [reason, setReason] = useState('');
	const add = useAction(() => undefined);
	const remove = useAction(() => undefined);

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		let added: Closure | null = null;
		let message = '';
		const ok = await add.run(async () => {
			const result = await addClosure(roomId, {
				date,
				wholeDay,
				start,
				end,
				type,
				reason,
			});
			added = result.closure;
			message = result.message;
			return result;
		});
		if (ok && added) {
			const next = [...closures, added as Closure].sort((a, b) =>
				`${a.date}${a.start ?? 0}`.localeCompare(`${b.date}${b.start ?? 0}`)
			);
			setReason('');
			onChange(message, next);
		}
	};

	const describe = (closure: Closure) =>
		`${capitalize(formatDayAndMonth(closure.date, locale))}, ${
			closure.start === null || closure.end === null
				? __('the whole day', 'creo-rombooking')
				: formatTimeRange(closure.start, closure.end)
		}`;

	return (
		<section
			className="creo-rombooking-section"
			aria-labelledby={id('heading')}
		>
			<h3 id={id('heading')}>
				{__('Closed and blocked times', 'creo-rombooking')}
			</h3>
			<p className="creo-rombooking-help">
				{__(
					'Closed: the room cannot be used, e.g. during maintenance. Blocked: the room is set aside, e.g. for cleaning. Members see the reason in the matrix. Existing bookings are not changed.',
					'creo-rombooking'
				)}
			</p>

			{closures.length > 0 ? (
				<ul className="creo-rombooking-box">
					{closures.map((closure) => (
						<li key={closure.id}>
							<Icon name="lock" size={18} />
							<span className="creo-rombooking-grow">
								<strong>{describe(closure)}</strong>
								<span className="creo-rombooking-help">
									{[closureTypeLabel(closure.type), closure.reason]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</span>
							<button
								type="button"
								className="creo-rombooking-button is-secondary is-small"
								disabled={remove.busy}
								aria-label={sprintf(
									/* translators: %s: date and time */
									__('Remove %s', 'creo-rombooking'),
									describe(closure)
								)}
								onClick={() =>
									remove.run(async () => {
										const result = await deleteClosure(roomId, closure.id);
										onChange(
											result.message,
											closures.filter((c) => c.id !== closure.id)
										);
										return result;
									})
								}
							>
								{__('Remove', 'creo-rombooking')}
							</button>
						</li>
					))}
				</ul>
			) : (
				<p className="creo-rombooking-muted">
					{sprintf(
						/* translators: %s: room name */
						__('%s has no closed or blocked times ahead.', 'creo-rombooking'),
						roomName
					)}
				</p>
			)}
			{remove.error && (
				<p className="creo-rombooking-error" role="alert">
					{remove.error}
				</p>
			)}

			<form
				noValidate
				className="creo-rombooking-action-panel"
				aria-labelledby={id('add-heading')}
				onSubmit={submit}
			>
				<h4 id={id('add-heading')}>
					{__('Add a closed or blocked time', 'creo-rombooking')}
				</h4>
				<div className="creo-rombooking-grid2">
					<div className="creo-rombooking-field">
						<label htmlFor={id('date')}>{__('Date', 'creo-rombooking')}</label>
						<input
							id={id('date')}
							className="creo-rombooking-input"
							type="date"
							min={today}
							value={date}
							aria-invalid={add.errors.date ? true : undefined}
							aria-describedby={
								add.errors.date ? `${id('date')}-error` : undefined
							}
							onChange={(event) => setDate(event.target.value)}
						/>
						<FieldError id={`${id('date')}-error`} message={add.errors.date} />
					</div>
					<fieldset className="creo-rombooking-fieldset">
						<legend>{__('Type', 'creo-rombooking')}</legend>
						<div className="creo-rombooking-pills">
							{(['closed', 'blocked'] as const).map((value) => (
								<label
									key={value}
									className="creo-rombooking-pill"
									htmlFor={id(`type-${value}`)}
								>
									<input
										id={id(`type-${value}`)}
										type="radio"
										name="creo-rombooking-closure-type"
										checked={type === value}
										onChange={() => setType(value)}
									/>
									{closureTypeLabel(value)}
								</label>
							))}
						</div>
					</fieldset>
				</div>
				<label className="creo-rombooking-radio" htmlFor={id('whole-day')}>
					<input
						id={id('whole-day')}
						type="checkbox"
						checked={wholeDay}
						onChange={(event) => setWholeDay(event.target.checked)}
					/>
					{__('The whole day', 'creo-rombooking')}
				</label>
				{!wholeDay && (
					<div className="creo-rombooking-grid2">
						<div className="creo-rombooking-field">
							<label htmlFor={id('start')}>
								{__('From', 'creo-rombooking')}
							</label>
							<select
								id={id('start')}
								className="creo-rombooking-input"
								value={start}
								onChange={(event) => setStart(Number(event.target.value))}
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
								aria-invalid={add.errors.end ? true : undefined}
								aria-describedby={
									add.errors.end ? `${id('end')}-error` : undefined
								}
								onChange={(event) => setEnd(Number(event.target.value))}
							>
								{slotTimes().map((minute) => (
									<option key={minute} value={minute + SLOT}>
										{formatTime(minute + SLOT)}
									</option>
								))}
							</select>
							<FieldError id={`${id('end')}-error`} message={add.errors.end} />
						</div>
					</div>
				)}
				<div className="creo-rombooking-field">
					<label htmlFor={id('reason')}>
						{__('Reason', 'creo-rombooking')}{' '}
						<span className="creo-rombooking-optional">
							{__('(optional)', 'creo-rombooking')}
						</span>
					</label>
					<input
						id={id('reason')}
						className="creo-rombooking-input"
						maxLength={200}
						value={reason}
						aria-describedby={id('reason-hint')}
						onChange={(event) => setReason(event.target.value)}
					/>
					<p id={id('reason-hint')} className="creo-rombooking-help">
						{__(
							'Shown to members, e.g. «Maintenance». Do not write codes or passwords.',
							'creo-rombooking'
						)}
					</p>
				</div>
				{add.error && (
					<p className="creo-rombooking-error" role="alert">
						{add.error}
					</p>
				)}
				<div className="creo-rombooking-actions">
					<button
						type="submit"
						className="creo-rombooking-button"
						disabled={add.busy}
					>
						{__('Add', 'creo-rombooking')}
					</button>
				</div>
			</form>
		</section>
	);
}
