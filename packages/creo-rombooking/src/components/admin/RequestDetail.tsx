import { forwardRef, Fragment, useState } from '@wordpress/element';
import { __, _n, _x, sprintf } from '@wordpress/i18n';

import {
	approve,
	approveAndCancelExisting,
	approveFree,
	reject,
	rejectRest,
} from '../../api/admin';
import type {
	Existing,
	RequestItem,
	SeriesItem,
	SingleItem,
} from '../../api/adminTypes';
import type { Room } from '../../api/types';
import useAction from '../../hooks/useAction';
import {
	approvalLabel,
	formatDateTime,
	occurrenceLabel,
	overlap,
	placesLabel,
	seriesCounts,
	seriesSummary,
} from '../../lib/admin';
import {
	capitalize,
	formatDayAndMonth,
	formatDayMonth,
	formatShortDate,
	formatTimeRange,
} from '../../lib/dates';
import Icon, { IconName } from '../Icon';

import CancelDialog from './CancelDialog';
import DeclinePanel from './DeclinePanel';
import KindTag from './KindTag';
import MovePanel from './MovePanel';
import ProposePanel from './ProposePanel';
import { ruleLabel } from './RequestList';

interface Props {
	item: RequestItem;
	rooms: Room[];
	today: string;
	locale: string;
	timezone: string;
	onDone: (message: string) => void;
	/** Moves focus back to the heading, e.g. when a panel is closed. */
	onFocusHeading: () => void;
}

type Mode = 'decline' | 'propose' | 'move' | 'cancel' | null;

export const HEADING_ID = 'creo-rombooking-detail-heading';

/**
 * One request with everything the administrator needs to decide.
 */
const RequestDetail = forwardRef<HTMLHeadingElement, Props>(
	function RequestDetail(props, headingRef) {
		const { item, rooms, today, locale, timezone, onDone, onFocusHeading } =
			props;
		const [mode, setMode] = useState<Mode>(null);
		const [proposeRoom, setProposeRoom] = useState<number | null>(null);
		const action = useAction(onDone);

		const close = () => {
			setMode(null);
			onFocusHeading();
		};

		const time = formatTimeRange(item.start, item.end);
		const heading =
			item.kind === 'series'
				? `${item.room.name} · ${ruleLabel(item.rule)} · ${time}`
				: `${item.room.name} · ${capitalize(
						formatDayAndMonth(item.date, locale)
				  )} · ${time}`;

		const sub = [
			placesLabel(item.room.capacity),
			approvalLabel(item.room.approval),
		];
		if (item.kind === 'series') {
			sub.push(
				sprintf(
					/* translators: 1: first date, 2: number of dates */
					_n(
						'from %1$s, %2$d time',
						'from %1$s, %2$d times',
						item.occurrences.length,
						'creo-rombooking'
					),
					formatDayAndMonth(item.date, locale),
					item.occurrences.length
				)
			);
		}

		return (
			<section className="creo-rombooking-detail" aria-labelledby={HEADING_ID}>
				<div className="creo-rombooking-detail-head">
					<div className="creo-rombooking-actions">
						<KindTag item={item} />
						{item.room.approval === 'manual' && item.kind === 'approval' && (
							<span className="creo-rombooking-tag is-outside">
								{__('The room needs approval', 'creo-rombooking')}
							</span>
						)}
					</div>
					<h3 id={HEADING_ID} ref={headingRef} tabIndex={-1}>
						{heading}
					</h3>
					<p className="creo-rombooking-muted">{sub.join(' · ')}</p>
				</div>

				{action.error && (
					<div className="creo-rombooking-message is-error" role="alert">
						<Icon name="warning" size={20} />
						<div>
							<strong>{action.error}</strong>
						</div>
					</div>
				)}

				{item.kind === 'series' ? (
					<SeriesBody
						item={item}
						locale={locale}
						busy={action.busy}
						onApprove={(bookingId) => action.run(() => approve(bookingId))}
						onReject={(bookingId) => action.run(() => reject(bookingId, ''))}
						onApproveFree={() => action.run(() => approveFree(item.seriesId))}
						onDeclineRest={() => setMode('decline')}
					/>
				) : (
					<SingleBody
						item={item}
						locale={locale}
						busy={action.busy}
						onApprove={() => action.run(() => approve(item.bookingId))}
						onMode={(next, roomId) => {
							setProposeRoom(roomId ?? null);
							setMode(next);
						}}
					/>
				)}

				{mode === 'decline' && (
					<DeclinePanel
						title={
							item.kind === 'series'
								? __('Decline the rest of the series', 'creo-rombooking')
								: __('Decline the request', 'creo-rombooking')
						}
						submitLabel={
							item.kind === 'series'
								? __('Decline the rest', 'creo-rombooking')
								: __('Decline request', 'creo-rombooking')
						}
						recipient={item.user.name}
						onSubmit={(reason) =>
							item.kind === 'series'
								? rejectRest(item.seriesId, reason)
								: reject(item.bookingId, reason)
						}
						onDone={onDone}
						onCancel={close}
					/>
				)}

				{mode === 'propose' && item.kind !== 'series' && (
					<ProposePanel
						key={proposeRoom ?? 'default'}
						item={item}
						rooms={rooms}
						roomId={proposeRoom}
						today={today}
						locale={locale}
						timezone={timezone}
						onDone={onDone}
						onCancel={close}
					/>
				)}

				{mode === 'move' && item.kind === 'conflict' && (
					<MovePanel
						item={item}
						locale={locale}
						onDone={onDone}
						onCancel={close}
					/>
				)}

				{mode === 'cancel' && item.kind === 'conflict' && (
					<CancelDialog
						booking={{
							roomId: item.room.id,
							roomName: item.room.name,
							date: item.existing[0].date,
							start: Math.min(...item.existing.map((e) => e.start)),
							end: Math.max(...item.existing.map((e) => e.end)),
							purpose: item.existing
								.map((e) => e.purpose)
								.filter(Boolean)
								.join(', '),
							people: Math.max(...item.existing.map((e) => e.people)),
							userName: [
								...new Set(item.existing.map((e) => e.user.name)),
							].join(', '),
						}}
						replacement={{ name: item.user.name, purpose: item.purpose }}
						rooms={rooms}
						preferred={item.moveOptions.map((room) => room.id)}
						locale={locale}
						timezone={timezone}
						submitLabel={__('Approve and cancel', 'creo-rombooking')}
						onSubmit={(reason, alternative) =>
							approveAndCancelExisting(item.bookingId, reason, alternative)
						}
						onDone={onDone}
						onClose={() => setMode(null)}
					/>
				)}
			</section>
		);
	}
);

export default RequestDetail;

interface SingleProps {
	item: SingleItem;
	locale: string;
	busy: boolean;
	onApprove: () => void;
	onMode: (mode: Mode, roomId?: number) => void;
}

function SingleBody({ item, locale, busy, onApprove, onMode }: SingleProps) {
	const isConflict = item.kind === 'conflict';

	return (
		<>
			{isConflict ? (
				<>
					<div className="creo-rombooking-compare">
						<article
							className="creo-rombooking-card is-new"
							aria-labelledby="creo-rombooking-compare-new"
						>
							<div className="creo-rombooking-card-head">
								<h4 id="creo-rombooking-compare-new">
									{__('New request', 'creo-rombooking')}
								</h4>
								<span className="creo-rombooking-tag is-conflict">
									<Icon name="clock" size={14} />
									{__('Waiting', 'creo-rombooking')}
								</span>
							</div>
							<Details
								rows={[
									[__('Name', 'creo-rombooking'), item.user.name],
									[__('Purpose', 'creo-rombooking'), item.purpose],
									[__('Time', 'creo-rombooking'), dayAndTime(item, locale)],
									[
										__('Number of people', 'creo-rombooking'),
										peopleText(item.people),
									],
									[
										__('Sent', 'creo-rombooking'),
										formatDateTime(item.sentAt, locale),
									],
								]}
							/>
						</article>
						{item.existing.map((existing) => (
							<ExistingCard
								key={existing.id}
								existing={existing}
								locale={locale}
							/>
						))}
					</div>
					<div className="creo-rombooking-message is-warning">
						<Icon name="warning" size={20} />
						<div>
							<strong>
								{sprintf(
									/* translators: %s: time range */
									__('Overlaps %s', 'creo-rombooking'),
									item.existing
										.map((existing) => overlap(item, existing))
										.join(', ')
								)}
							</strong>
							<p>
								{__(
									'Choose how to solve the conflict. Everyone affected gets a text message.',
									'creo-rombooking'
								)}
							</p>
						</div>
					</div>
				</>
			) : (
				<>
					<article className="creo-rombooking-card">
						<Details
							rows={[
								[__('Name', 'creo-rombooking'), item.user.name],
								[__('Purpose', 'creo-rombooking'), item.purpose],
								[__('Time', 'creo-rombooking'), dayAndTime(item, locale)],
								[
									__('Number of people', 'creo-rombooking'),
									peopleText(item.people),
								],
								[
									__('Sent', 'creo-rombooking'),
									formatDateTime(item.sentAt, locale),
								],
							]}
						/>
					</article>
					{!item.closed && (
						<div className="creo-rombooking-message is-info">
							<Icon name="info" size={20} />
							<div>
								<strong>{__('No conflict', 'creo-rombooking')}</strong>
								<p>
									{item.room.approval === 'manual'
										? sprintf(
												/* translators: %s: room name */
												__(
													'The time is available. %s is set to manual approval.',
													'creo-rombooking'
												),
												item.room.name
										  )
										: __('The time is available now.', 'creo-rombooking')}
								</p>
							</div>
						</div>
					)}
				</>
			)}

			{item.closed && (
				<div className="creo-rombooking-message is-warning">
					<Icon name="lock" size={20} />
					<div>
						<strong>
							{__('The room is closed at this time', 'creo-rombooking')}
						</strong>
						<p>
							{__(
								'The request cannot be approved. Propose another room or time, or decline it.',
								'creo-rombooking'
							)}
						</p>
					</div>
				</div>
			)}

			<SuggestionList
				item={item}
				onPropose={(roomId) => onMode('propose', roomId)}
			/>

			{isConflict ? (
				<div
					className="creo-rombooking-actions"
					role="group"
					aria-label={__('Solve the conflict', 'creo-rombooking')}
				>
					<button
						type="button"
						className="creo-rombooking-button"
						disabled={busy || item.closed}
						onClick={() => onMode('cancel')}
					>
						{__('Approve and cancel existing', 'creo-rombooking')}
					</button>
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						disabled={busy || item.closed || item.existing.length !== 1}
						onClick={() => onMode('move')}
					>
						<Icon name="move" size={16} />
						{__('Move existing booking', 'creo-rombooking')}
					</button>
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						disabled={busy}
						onClick={() => onMode('propose')}
					>
						{__('Propose another room or time', 'creo-rombooking')}
					</button>
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						disabled={busy}
						onClick={() => onMode('decline')}
					>
						{__('Decline', 'creo-rombooking')}
					</button>
				</div>
			) : (
				<div className="creo-rombooking-actions">
					<button
						type="button"
						className="creo-rombooking-button"
						disabled={busy || item.closed}
						onClick={onApprove}
					>
						<Icon name="check" size={16} />
						{__('Approve', 'creo-rombooking')}
					</button>
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						disabled={busy}
						onClick={() => onMode('propose')}
					>
						{__('Propose another room or time', 'creo-rombooking')}
					</button>
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						disabled={busy}
						onClick={() => onMode('decline')}
					>
						{__('Decline', 'creo-rombooking')}
					</button>
				</div>
			)}
		</>
	);
}

function ExistingCard({
	existing,
	locale,
}: {
	existing: Existing;
	locale: string;
}) {
	const headingId = `creo-rombooking-compare-existing-${existing.id}`;
	return (
		<article
			className="creo-rombooking-card is-existing"
			aria-labelledby={headingId}
		>
			<div className="creo-rombooking-card-head">
				<h4 id={headingId}>{__('Existing booking', 'creo-rombooking')}</h4>
				<span className="creo-rombooking-tag is-busy">
					<Icon name="busy" size={14} />
					{existing.seriesStart
						? __('Confirmed (series)', 'creo-rombooking')
						: __('Confirmed', 'creo-rombooking')}
				</span>
			</div>
			<Details
				rows={[
					[__('Name', 'creo-rombooking'), existing.user.name],
					[__('Purpose', 'creo-rombooking'), existing.purpose],
					[__('Time', 'creo-rombooking'), dayAndTime(existing, locale)],
					[
						__('Number of people', 'creo-rombooking'),
						peopleText(existing.people),
					],
					[
						_x('Booked', 'when the booking was made', 'creo-rombooking'),
						existing.seriesStart
							? sprintf(
									/* translators: %s: date */
									__('Recurring since %s', 'creo-rombooking'),
									formatDayMonth(existing.seriesStart, locale)
							  )
							: formatDateTime(existing.bookedAt, locale),
					],
				]}
			/>
		</article>
	);
}

function SuggestionList({
	item,
	onPropose,
}: {
	item: SingleItem;
	onPropose: (roomId: number) => void;
}) {
	const { free, tooSmall, unavailable } = item.suggestions;
	const note = [
		tooSmall.length > 0 &&
			sprintf(
				/* translators: %s: room names */
				__('Too small: %s.', 'creo-rombooking'),
				tooSmall.join(', ')
			),
		unavailable.length > 0 &&
			sprintf(
				/* translators: %s: room names */
				__('Booked or closed: %s.', 'creo-rombooking'),
				unavailable.join(', ')
			),
	]
		.filter(Boolean)
		.join(' ');

	return (
		<section
			className="creo-rombooking-section"
			aria-labelledby="creo-rombooking-suggestions"
		>
			<div className="creo-rombooking-section-head">
				<h4 id="creo-rombooking-suggestions">
					{__('Free rooms with enough places', 'creo-rombooking')}
				</h4>
				<span className="creo-rombooking-help">
					{sprintf(
						/* translators: 1: number of places, 2: time range */
						__('At least %1$s · %2$s', 'creo-rombooking'),
						placesLabel(item.people),
						formatTimeRange(item.start, item.end)
					)}
				</span>
			</div>
			{free.length > 0 ? (
				<ul className="creo-rombooking-box">
					{free.slice(0, 3).map((room) => (
						<li key={room.id}>
							<Icon name="plus" size={18} />
							<span className="creo-rombooking-grow">
								<strong>{room.name}</strong>
								<span className="creo-rombooking-help">
									{`${placesLabel(room.capacity)} · ${approvalLabel(
										room.approval
									)}`}
								</span>
							</span>
							<span className="creo-rombooking-tag is-free">
								{__('Available', 'creo-rombooking')}
							</span>
							<button
								type="button"
								className="creo-rombooking-button is-secondary"
								aria-label={sprintf(
									/* translators: %s: room name */
									__('Propose %s', 'creo-rombooking'),
									room.name
								)}
								onClick={() => onPropose(room.id)}
							>
								{__('Propose', 'creo-rombooking')}
							</button>
						</li>
					))}
				</ul>
			) : (
				<p className="creo-rombooking-muted">
					{__(
						'No other rooms with enough places are free at this time. Propose another time.',
						'creo-rombooking'
					)}
				</p>
			)}
			{note && <p className="creo-rombooking-help">{note}</p>}
		</section>
	);
}

interface SeriesProps {
	item: SeriesItem;
	locale: string;
	busy: boolean;
	onApprove: (bookingId: number) => void;
	onReject: (bookingId: number) => void;
	onApproveFree: () => void;
	onDeclineRest: () => void;
}

const OCCURRENCE_TAGS: Record<string, [string, IconName]> = {
	free: ['is-free', 'plus'],
	conflict: ['is-conflict', 'warning'],
	closed: ['is-outside', 'lock'],
	outside: ['is-outside', 'lock'],
	approved: ['is-approved', 'check'],
	rejected: ['is-rejected', 'close'],
	cancelled: ['is-rejected', 'close'],
	proposed: ['is-info', 'clock'],
};

function SeriesBody(props: SeriesProps) {
	const { item, locale, busy } = props;
	const counts = seriesCounts(item.occurrences);
	const pending = item.occurrences.some((o) => o.pending);
	const time = formatTimeRange(item.start, item.end);

	return (
		<>
			<article className="creo-rombooking-card">
				<Details
					rows={[
						[__('Name', 'creo-rombooking'), item.user.name],
						[__('Purpose', 'creo-rombooking'), item.purpose],
						[
							__('Number of people', 'creo-rombooking'),
							peopleText(item.people),
						],
						[
							__('Sent', 'creo-rombooking'),
							formatDateTime(item.sentAt, locale),
						],
					]}
				/>
			</article>

			<section
				className="creo-rombooking-section"
				aria-labelledby="creo-rombooking-series-dates"
			>
				<div className="creo-rombooking-section-head">
					<h4 id="creo-rombooking-series-dates">
						{__('Dates', 'creo-rombooking')}
					</h4>
					<span className="creo-rombooking-help">{seriesSummary(counts)}</span>
				</div>
				{/* The table scrolls sideways on narrow screens. */}
				{/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
				<div
					className="creo-rombooking-table-scroll"
					tabIndex={0}
					role="region"
					aria-labelledby="creo-rombooking-series-dates"
				>
					<table className="creo-rombooking-table">
						<thead>
							<tr>
								<th scope="col">{__('Date', 'creo-rombooking')}</th>
								<th scope="col">{__('Time', 'creo-rombooking')}</th>
								<th scope="col">{__('Status', 'creo-rombooking')}</th>
								<th scope="col">{__('Action', 'creo-rombooking')}</th>
							</tr>
						</thead>
						<tbody>
							{item.occurrences.map((occurrence) => {
								const label = capitalize(
									formatShortDate(occurrence.date, locale)
								);
								const [tagClass, icon] = OCCURRENCE_TAGS[occurrence.status];
								return (
									<tr key={occurrence.date}>
										<th scope="row">{label}</th>
										<td>{time}</td>
										<td>
											<span className={`creo-rombooking-tag ${tagClass}`}>
												<Icon name={icon} size={14} />
												{occurrenceLabel(occurrence.status)}
											</span>
											{occurrence.conflictWith && (
												<span className="creo-rombooking-help">
													{sprintf(
														/* translators: 1: name, 2: purpose */
														__('Booked: %1$s – %2$s', 'creo-rombooking'),
														occurrence.conflictWith.name,
														occurrence.conflictWith.purpose
													)}
												</span>
											)}
										</td>
										<td>
											<div className="creo-rombooking-actions">
												{occurrence.pending && occurrence.status === 'free' && (
													<button
														type="button"
														className="creo-rombooking-button is-secondary is-small"
														disabled={busy}
														aria-label={sprintf(
															/* translators: %s: date */
															__('Approve %s', 'creo-rombooking'),
															label
														)}
														onClick={() =>
															props.onApprove(occurrence.bookingId!)
														}
													>
														{__('Approve', 'creo-rombooking')}
													</button>
												)}
												{occurrence.pending && (
													<button
														type="button"
														className="creo-rombooking-button is-secondary is-small"
														disabled={busy}
														aria-label={sprintf(
															/* translators: %s: date */
															__('Decline %s', 'creo-rombooking'),
															label
														)}
														onClick={() =>
															props.onReject(occurrence.bookingId!)
														}
													>
														{__('Decline', 'creo-rombooking')}
													</button>
												)}
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			<div className="creo-rombooking-actions">
				<button
					type="button"
					className="creo-rombooking-button"
					disabled={busy || counts.freePending === 0}
					onClick={props.onApproveFree}
				>
					<Icon name="check" size={16} />
					{sprintf(
						/* translators: %d: number of dates */
						__('Approve all available (%d)', 'creo-rombooking'),
						counts.freePending
					)}
				</button>
				<button
					type="button"
					className="creo-rombooking-button is-secondary"
					disabled={busy || !pending}
					onClick={props.onDeclineRest}
				>
					{__('Decline the rest of the series', 'creo-rombooking')}
				</button>
			</div>
		</>
	);
}

function Details({ rows }: { rows: Array<[string, string]> }) {
	return (
		<dl className="creo-rombooking-summary">
			{rows.map(([term, value]) => (
				<Fragment key={term}>
					<dt>{term}</dt>
					<dd>{value || '–'}</dd>
				</Fragment>
			))}
		</dl>
	);
}

function dayAndTime(
	booking: { date: string; start: number; end: number },
	locale: string
): string {
	return `${capitalize(
		formatDayAndMonth(booking.date, locale)
	)}, ${formatTimeRange(booking.start, booking.end)}`;
}

function peopleText(people: number): string {
	return people > 0 ? String(people) : '';
}
