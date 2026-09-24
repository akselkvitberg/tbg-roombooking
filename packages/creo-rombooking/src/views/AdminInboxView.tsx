import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { getRequests } from '../api/admin';
import type { RequestItem } from '../api/adminTypes';
import { errorMessage, getRooms } from '../api/client';
import type { Room } from '../api/types';
import RequestDetail from '../components/admin/RequestDetail';
import RequestList from '../components/admin/RequestList';
import Icon from '../components/Icon';
import { inboxSummary } from '../lib/admin';
import type { Settings } from '../settings';

interface Props {
	settings: Settings;
}

/**
 * The administrator's inbox: waiting requests with conflicts first, and the
 * selected request with everything needed to decide.
 *
 * @param props          The component props.
 * @param props.settings
 */
export default function AdminInboxView({ settings }: Props) {
	const { today, locale, timezone } = settings;
	const [items, setItems] = useState<RequestItem[] | null>(null);
	const [rooms, setRooms] = useState<Room[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const emptyRef = useRef<HTMLParagraphElement>(null);
	const focusAfterLoad = useRef(false);

	const load = useCallback(async () => {
		setError(null);
		try {
			const [requests, allRooms] = await Promise.all([
				getRequests(),
				getRooms(),
			]);
			setItems(requests);
			setRooms(allRooms);
			setSelected((current) =>
				requests.some((item) => item.id === current)
					? current
					: requests[0]?.id ?? null
			);
		} catch (caught) {
			setError(errorMessage(caught) ?? '');
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	// After an action or a choice, move focus to the request, or to the empty state.
	useEffect(() => {
		if (focusAfterLoad.current && items) {
			focusAfterLoad.current = false;
			(headingRef.current ?? emptyRef.current)?.focus();
		}
	}, [items, selected]);

	const done = (message: string) => {
		setToast(message);
		focusAfterLoad.current = true;
		load();
	};

	// Choosing a request moves focus to it, which also scrolls to it on narrow screens.
	const select = (id: string) => {
		setSelected(id);
		setToast(null);
		focusAfterLoad.current = true;
	};

	const item = items?.find((i) => i.id === selected) ?? null;

	return (
		<div className="creo-rombooking-admin">
			<div className="creo-rombooking-admin-head">
				<h2>{__('Requests', 'creo-rombooking')}</h2>
				{items && (
					<p className="creo-rombooking-muted">
						{items.length > 0
							? inboxSummary(items)
							: __('Everything has been handled', 'creo-rombooking')}
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
							{__('Could not load the requests.', 'creo-rombooking')}
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

			{items === null && error === null && (
				<p className="creo-rombooking-loading" role="status">
					{__('Loading requests…', 'creo-rombooking')}
				</p>
			)}

			{items && items.length === 0 && (
				<div className="creo-rombooking-empty">
					<Icon name="check" size={32} />
					<p
						className="creo-rombooking-empty-title"
						ref={emptyRef}
						tabIndex={-1}
					>
						{__('No requests are waiting', 'creo-rombooking')}
					</p>
					<div className="creo-rombooking-empty-text">
						{__(
							'New requests and conflicts are shown here, with conflicts first.',
							'creo-rombooking'
						)}
					</div>
				</div>
			)}

			{items && item && (
				<div className="creo-rombooking-inbox">
					<RequestList
						items={items}
						selected={item.id}
						locale={locale}
						onSelect={select}
					/>
					<RequestDetail
						key={item.id}
						ref={headingRef}
						item={item}
						rooms={rooms}
						today={today}
						locale={locale}
						timezone={timezone}
						onDone={done}
						onFocusHeading={() => headingRef.current?.focus()}
					/>
				</div>
			)}
		</div>
	);
}
