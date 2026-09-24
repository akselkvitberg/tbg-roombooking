import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { errorMessage } from '../api/client';
import { getMyBookings } from '../api/mine';
import type { MyBookings } from '../api/mineTypes';
import Icon from '../components/Icon';
import BookingEntry from '../components/mine/BookingEntry';
import CancelMineDialog, {
	CancelTarget,
} from '../components/mine/CancelMineDialog';
import ProposalCard from '../components/mine/ProposalCard';
import { groupBookings } from '../lib/mine';
import type { Settings } from '../settings';

interface Props {
	settings: Settings;
}

/**
 * The member's bookings: proposals to answer, upcoming bookings and
 * requests, and what was recently declined or cancelled.
 *
 * @param props          The component props.
 * @param props.settings
 */
export default function MyBookingsView({ settings }: Props) {
	const { locale } = settings;
	const [data, setData] = useState<MyBookings | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [cancelling, setCancelling] = useState<CancelTarget | null>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);

	const load = useCallback(async () => {
		setError(null);
		try {
			setData(await getMyBookings());
		} catch (caught) {
			setError(errorMessage(caught) ?? '');
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	// The element that started an action is often gone once the list has
	// reloaded, so focus moves to the heading.
	const done = async (message: string) => {
		setCancelling(null);
		setToast(message);
		await load();
		headingRef.current?.focus();
	};

	const entries = data ? groupBookings(data.upcoming) : [];
	const isEmpty =
		data && data.proposals.length === 0 && data.upcoming.length === 0;

	return (
		<div className="creo-rombooking-admin creo-rombooking-mine">
			<div className="creo-rombooking-admin-head">
				<h2 ref={headingRef} tabIndex={-1}>
					{__('My bookings', 'creo-rombooking')}
				</h2>
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
							{__('Could not load your bookings.', 'creo-rombooking')}
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

			{!data && error === null && (
				<p className="creo-rombooking-loading" role="status">
					{__('Loading…', 'creo-rombooking')}
				</p>
			)}

			{data && data.proposals.length > 0 && (
				<section
					className="creo-rombooking-section"
					aria-labelledby="creo-rombooking-mine-proposals"
				>
					<h3 id="creo-rombooking-mine-proposals">
						{__('Proposals to answer', 'creo-rombooking')}
					</h3>
					{data.proposals.map((proposal) => (
						<ProposalCard
							key={proposal.id}
							proposal={proposal}
							locale={locale}
							onDone={done}
						/>
					))}
				</section>
			)}

			{isEmpty && (
				<div className="creo-rombooking-empty">
					<Icon name="plus" size={32} />
					<p className="creo-rombooking-empty-title">
						{__('You have no upcoming bookings', 'creo-rombooking')}
					</p>
					<div className="creo-rombooking-empty-text">
						<p>
							{__(
								'Bookings and requests you make are shown here.',
								'creo-rombooking'
							)}
						</p>
						<a className="creo-rombooking-button" href="#rombooking=book">
							{__('Book a room', 'creo-rombooking')}
						</a>
					</div>
				</div>
			)}

			{data && data.upcoming.length > 0 && (
				<section
					className="creo-rombooking-section"
					aria-labelledby="creo-rombooking-mine-upcoming"
				>
					<h3 id="creo-rombooking-mine-upcoming">
						{__('Upcoming', 'creo-rombooking')}
					</h3>
					<ul className="creo-rombooking-bookings">
						{entries.map((entry) => (
							<BookingEntry
								key={entry.key}
								entry={entry}
								locale={locale}
								onCancel={setCancelling}
							/>
						))}
					</ul>
				</section>
			)}

			{data && data.closed.length > 0 && (
				<section
					className="creo-rombooking-section"
					aria-labelledby="creo-rombooking-mine-closed"
				>
					<h3 id="creo-rombooking-mine-closed">
						{__('Declined or cancelled', 'creo-rombooking')}
					</h3>
					<ul className="creo-rombooking-bookings is-closed">
						{groupBookings(data.closed).map((entry) => (
							<BookingEntry
								key={entry.key}
								entry={entry}
								locale={locale}
								onCancel={setCancelling}
							/>
						))}
					</ul>
				</section>
			)}

			{cancelling && (
				<CancelMineDialog
					booking={cancelling}
					locale={locale}
					onDone={done}
					onClose={() => setCancelling(null)}
				/>
			)}
		</div>
	);
}
