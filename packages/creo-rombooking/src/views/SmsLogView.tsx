import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { getSmsLog } from '../api/admin';
import type { SmsLog } from '../api/adminTypes';
import { errorMessage } from '../api/client';
import EmptyState from '../components/EmptyState';
import { formatDateTime } from '../lib/admin';
import type { Settings } from '../settings';

interface Props {
	settings: Settings;
}

/**
 * The text messages the plugin would have sent. No provider is connected yet.
 *
 * @param props          The component props.
 * @param props.settings
 */
export default function SmsLogView({ settings }: Props) {
	const [page, setPage] = useState(1);
	const [log, setLog] = useState<SmsLog | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let current = true;
		setError(null);
		getSmsLog(page)
			.then((result) => current && setLog(result))
			.catch((caught) => current && setError(errorMessage(caught) ?? ''));
		return () => {
			current = false;
		};
	}, [page]);

	return (
		<div className="creo-rombooking-admin">
			<div className="creo-rombooking-admin-head">
				<h2>{__('Text message log', 'creo-rombooking')}</h2>
				<p className="creo-rombooking-muted">
					{__(
						'No text messages are sent yet. This is what would have been sent, newest first.',
						'creo-rombooking'
					)}
				</p>
			</div>

			{error !== null && (
				<div className="creo-rombooking-message is-error" role="alert">
					<div>
						<strong>{__('Could not load the log.', 'creo-rombooking')}</strong>
						{error && <p>{error}</p>}
					</div>
				</div>
			)}

			{!log && error === null && (
				<p className="creo-rombooking-loading" role="status">
					{__('Loading…', 'creo-rombooking')}
				</p>
			)}

			{log && log.items.length === 0 && (
				<EmptyState title={__('No text messages yet', 'creo-rombooking')}>
					{__(
						'Messages about bookings, approvals and cancellations are shown here.',
						'creo-rombooking'
					)}
				</EmptyState>
			)}

			{log && log.items.length > 0 && (
				<>
					<ol className="creo-rombooking-sms">
						{log.items.map((entry) => (
							<li key={entry.id}>
								<div className="creo-rombooking-sms-head">
									<strong>
										{entry.to.phone
											? `${entry.to.name} (${entry.to.phone})`
											: entry.to.name}
									</strong>
									<span className="creo-rombooking-help">
										{formatDateTime(entry.sentAt, settings.locale)}
									</span>
								</div>
								<p>{entry.text}</p>
							</li>
						))}
					</ol>
					{log.pages > 1 && (
						<nav
							className="creo-rombooking-actions"
							aria-label={__('Pages', 'creo-rombooking')}
						>
							<button
								type="button"
								className="creo-rombooking-button is-secondary"
								disabled={page <= 1}
								onClick={() => setPage(page - 1)}
							>
								{__('Newer', 'creo-rombooking')}
							</button>
							<span aria-live="polite">
								{sprintf(
									/* translators: 1: page, 2: number of pages */
									__('Page %1$d of %2$d', 'creo-rombooking'),
									page,
									log.pages
								)}
							</span>
							<button
								type="button"
								className="creo-rombooking-button is-secondary"
								disabled={page >= log.pages}
								onClick={() => setPage(page + 1)}
							>
								{__('Older', 'creo-rombooking')}
							</button>
						</nav>
					)}
				</>
			)}
		</div>
	);
}
