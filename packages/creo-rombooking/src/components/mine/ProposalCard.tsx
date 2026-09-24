import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { answerProposal } from '../../api/mine';
import type { Proposal } from '../../api/mineTypes';
import useAction from '../../hooks/useAction';
import {
	capitalize,
	formatDayAndMonth,
	formatTimeRange,
} from '../../lib/dates';
import { formatDeadline } from '../../lib/mine';
import Dialog from '../Dialog';
import Icon from '../Icon';

interface Props {
	proposal: Proposal;
	locale: string;
	onDone: (message: string) => void;
}

function when(
	booking: { date: string; start: number; end: number },
	locale: string
) {
	return `${capitalize(
		formatDayAndMonth(booking.date, locale)
	)}, ${formatTimeRange(booking.start, booking.end)}`;
}

/**
 * An administrator's proposal of another room or time, with Accept and
 * Decline and the deadline for answering.
 *
 * @param props          The component props.
 * @param props.proposal
 * @param props.locale
 * @param props.onDone
 */
export default function ProposalCard({ proposal, locale, onDone }: Props) {
	const [confirmDecline, setConfirmDecline] = useState(false);
	const accept = useAction(onDone);
	const decline = useAction(onDone);
	const headingId = `creo-rombooking-proposal-${proposal.id}`;
	const { original, proposed } = proposal;

	return (
		<article
			className="creo-rombooking-card is-proposal"
			aria-labelledby={headingId}
		>
			<div className="creo-rombooking-card-head">
				<h4 id={headingId}>
					{proposal.wasApproved
						? sprintf(
								/* translators: %s: room name */
								__(
									'Your booking of %s is cancelled – new proposal',
									'creo-rombooking'
								),
								original.room.name
						  )
						: sprintf(
								/* translators: %s: room name */
								__('Proposal instead of %s', 'creo-rombooking'),
								original.room.name
						  )}
				</h4>
				<span className="creo-rombooking-tag is-conflict">
					<Icon name="clock" size={14} />
					{__('Waiting for your answer', 'creo-rombooking')}
				</span>
			</div>

			<div className="creo-rombooking-compare">
				<div className="creo-rombooking-proposal-part">
					<p className="creo-rombooking-help">
						{proposal.wasApproved
							? __('You had', 'creo-rombooking')
							: __('You asked for', 'creo-rombooking')}
					</p>
					<p>
						<strong>{original.room.name}</strong>
						<br />
						{when(original, locale)}
					</p>
				</div>
				<div className="creo-rombooking-proposal-part is-proposed">
					<p className="creo-rombooking-help">
						{__('The administrator proposes', 'creo-rombooking')}
					</p>
					<p>
						<strong>{proposed.room.name}</strong>
						<br />
						{when(proposed, locale)}
					</p>
				</div>
			</div>

			{proposal.message && (
				<blockquote className="creo-rombooking-quote">
					<span className="creo-rombooking-help">
						{__('Message from the administrator', 'creo-rombooking')}
					</span>
					<p>{proposal.message}</p>
				</blockquote>
			)}

			<p className="creo-rombooking-deadline">
				<Icon name="clock" size={16} />
				<span>
					{sprintf(
						/* translators: %s: date and time */
						__(
							'Answer by %s. Without an answer, the proposal expires.',
							'creo-rombooking'
						),
						formatDeadline(proposal.expiresAt, locale)
					)}
				</span>
			</p>

			{(accept.error || decline.error) && (
				<p className="creo-rombooking-error" role="alert">
					{accept.error ?? decline.error}
				</p>
			)}

			<div className="creo-rombooking-actions">
				<button
					type="button"
					className="creo-rombooking-button"
					disabled={accept.busy || decline.busy}
					onClick={() =>
						accept.run(() => answerProposal(proposal.id, 'accept'))
					}
				>
					<Icon name="check" size={16} />
					{__('Accept', 'creo-rombooking')}
				</button>
				<button
					type="button"
					className="creo-rombooking-button is-secondary"
					disabled={accept.busy || decline.busy}
					onClick={() => setConfirmDecline(true)}
				>
					{__('Decline', 'creo-rombooking')}
				</button>
			</div>

			{confirmDecline && (
				<Dialog
					title={__('Decline the proposal?', 'creo-rombooking')}
					onClose={() => setConfirmDecline(false)}
					footer={
						<>
							<button
								type="button"
								className="creo-rombooking-button is-secondary"
								onClick={() => setConfirmDecline(false)}
							>
								{__('Go back', 'creo-rombooking')}
							</button>
							<button
								type="button"
								className="creo-rombooking-button is-danger"
								disabled={decline.busy}
								onClick={() =>
									decline.run(() => answerProposal(proposal.id, 'decline'))
								}
							>
								{__('Decline the proposal', 'creo-rombooking')}
							</button>
						</>
					}
				>
					<p className="creo-rombooking-muted">
						{proposal.wasApproved
							? __(
									'Your booking stays cancelled. You can book another time.',
									'creo-rombooking'
							  )
							: __(
									'Your request is closed. You can book another time.',
									'creo-rombooking'
							  )}
					</p>
					{decline.error && (
						<p className="creo-rombooking-error" role="alert">
							{decline.error}
						</p>
					)}
				</Dialog>
			)}
		</article>
	);
}
