import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { errorMessage } from '../api/client';
import { getRoomSetup, reorderRooms } from '../api/rooms';
import type { RoomSetup } from '../api/roomTypes';
import Icon from '../components/Icon';
import ClosureList from '../components/rooms/ClosureList';
import RoomForm from '../components/rooms/RoomForm';
import { approvalLabel, placesLabel } from '../lib/admin';
import { emptyRoom, move } from '../lib/rooms';
import type { Settings } from '../settings';

interface Props {
	settings: Settings;
}

type Editing = { kind: 'new' } | { kind: 'room'; id: number } | null;

/**
 * The administrator's room setup: the rooms in order, and a form for each.
 *
 * @param props          The component props.
 * @param props.settings
 */
export default function RoomSetupView({ settings }: Props) {
	const { today, locale } = settings;
	const [rooms, setRooms] = useState<RoomSetup[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [editing, setEditing] = useState<Editing>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const focusTarget = useRef<string | null>(null);

	const load = useCallback(async () => {
		setError(null);
		try {
			setRooms(await getRoomSetup());
		} catch (caught) {
			setError(errorMessage(caught) ?? '');
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	// Moves focus after the view changes, e.g. to the heading or a moved room.
	useEffect(() => {
		const target = focusTarget.current;
		if (target) {
			focusTarget.current = null;
			(document.getElementById(target) ?? headingRef.current)?.focus();
		}
	});

	const open = (next: Editing) => {
		setToast(null);
		setEditing(next);
		focusTarget.current = 'creo-rombooking-rooms-heading';
	};

	const reorder = async (index: number, direction: -1 | 1) => {
		if (!rooms) {
			return;
		}
		const next = move(rooms, index, direction);
		setRooms(next);
		focusTarget.current = `creo-rombooking-room-${next[index + direction].id}-${
			direction === -1 ? 'up' : 'down'
		}`;
		try {
			await reorderRooms(next.map((room) => room.id));
			setToast(
				sprintf(
					/* translators: %s: room name */
					__('%s is moved.', 'creo-rombooking'),
					next[index + direction].name
				)
			);
		} catch (caught) {
			setError(errorMessage(caught) ?? '');
			load();
		}
	};

	const current =
		editing?.kind === 'room'
			? rooms?.find((room) => room.id === editing.id)
			: null;

	return (
		<div className="creo-rombooking-admin">
			<div className="creo-rombooking-admin-head">
				<h2 id="creo-rombooking-rooms-heading" ref={headingRef} tabIndex={-1}>
					{editing === null && __('Rooms', 'creo-rombooking')}
					{editing?.kind === 'new' && __('New room', 'creo-rombooking')}
					{current &&
						sprintf(
							/* translators: %s: room name */
							__('Edit %s', 'creo-rombooking'),
							current.name
						)}
				</h2>
				{editing !== null && (
					<p>
						<button
							type="button"
							className="creo-rombooking-link-button"
							onClick={() => open(null)}
						>
							<Icon name="chevronLeft" size={16} />
							{__('Back to the rooms', 'creo-rombooking')}
						</button>
					</p>
				)}
			</div>

			<div role="status" className="creo-rombooking-live">
				{toast && (
					<div className="creo-rombooking-message is-ok">
						<Icon name="check" size={20} />
						<div>
							<strong>{toast}</strong>
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
							{__('Could not load the rooms.', 'creo-rombooking')}
						</strong>
						{error && <p>{error}</p>}
					</div>
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						onClick={load}
					>
						{__('Try again', 'creo-rombooking')}
					</button>
				</div>
			)}

			{!rooms && error === null && (
				<p className="creo-rombooking-loading" role="status">
					{__('Loading…', 'creo-rombooking')}
				</p>
			)}

			{rooms && editing === null && (
				<>
					<div className="creo-rombooking-actions">
						<button
							type="button"
							className="creo-rombooking-button"
							onClick={() => open({ kind: 'new' })}
						>
							<Icon name="plus" size={16} />
							{__('New room', 'creo-rombooking')}
						</button>
					</div>
					<ul className="creo-rombooking-bookings">
						{rooms.map((room, index) => (
							<li
								key={room.id}
								className="creo-rombooking-booking"
								aria-labelledby={`creo-rombooking-room-${room.id}-name`}
							>
								{room.imageUrl ? (
									<img
										className="creo-rombooking-room-thumb"
										src={room.imageUrl}
										alt=""
									/>
								) : (
									<div
										className="creo-rombooking-room-thumb"
										aria-hidden="true"
									/>
								)}
								<div className="creo-rombooking-grow">
									<h4 id={`creo-rombooking-room-${room.id}-name`}>
										{room.name}
									</h4>
									<p>
										{[
											placesLabel(room.capacity),
											approvalLabel(room.approval),
											sprintf(
												/* translators: %d: number of closed or blocked times */
												__('%d closures ahead', 'creo-rombooking'),
												room.closures.length
											),
										].join(' · ')}
									</p>
									{!room.active && (
										<span className="creo-rombooking-tag is-outside">
											{__('Cannot be booked', 'creo-rombooking')}
										</span>
									)}
								</div>
								<div className="creo-rombooking-actions">
									<button
										id={`creo-rombooking-room-${room.id}-up`}
										type="button"
										className="creo-rombooking-icon-button is-outlined"
										disabled={index === 0}
										onClick={() => reorder(index, -1)}
									>
										<Icon name="chevronLeft" size={18} className="is-up" />
										<span className="creo-rombooking-sr">
											{sprintf(
												/* translators: %s: room name */
												__('Move %s up', 'creo-rombooking'),
												room.name
											)}
										</span>
									</button>
									<button
										id={`creo-rombooking-room-${room.id}-down`}
										type="button"
										className="creo-rombooking-icon-button is-outlined"
										disabled={index === rooms.length - 1}
										onClick={() => reorder(index, 1)}
									>
										<Icon name="chevronRight" size={18} className="is-down" />
										<span className="creo-rombooking-sr">
											{sprintf(
												/* translators: %s: room name */
												__('Move %s down', 'creo-rombooking'),
												room.name
											)}
										</span>
									</button>
									<button
										type="button"
										className="creo-rombooking-button is-secondary"
										aria-describedby={`creo-rombooking-room-${room.id}-name`}
										onClick={() => open({ kind: 'room', id: room.id })}
									>
										{__('Edit', 'creo-rombooking')}
									</button>
								</div>
							</li>
						))}
					</ul>
				</>
			)}

			{rooms && editing !== null && (editing.kind === 'new' || current) && (
				<>
					<RoomForm
						key={editing.kind === 'new' ? 'new' : editing.id}
						room={current ?? { ...emptyRoom(), id: null }}
						locale={locale}
						onSaved={(message, saved) => {
							setRooms((list) =>
								list?.some((room) => room.id === saved.id)
									? list.map((room) => (room.id === saved.id ? saved : room))
									: [...(list ?? []), saved]
							);
							setToast(message);
							setEditing({ kind: 'room', id: saved.id });
							focusTarget.current = 'creo-rombooking-rooms-heading';
						}}
					/>
					{current && (
						<ClosureList
							roomId={current.id}
							roomName={current.name}
							closures={current.closures}
							today={today}
							locale={locale}
							onChange={(message, closures) => {
								setRooms(
									(list) =>
										list?.map((room) =>
											room.id === current.id ? { ...room, closures } : room
										) ?? null
								);
								setToast(message);
							}}
						/>
					)}
				</>
			)}
		</div>
	);
}
