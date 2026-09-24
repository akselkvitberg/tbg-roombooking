import classnames from 'classnames';

import { forwardRef } from '@wordpress/element';

import type { Status } from '../../api/types';
import { formatTimeRange } from '../../lib/dates';
import { isActionable, Segment } from '../../lib/segments';
import Icon, { IconName } from '../Icon';

import { closedReason, segmentLabel, statusLabel } from './statusText';

export const statusIcons: Record<Status, IconName> = {
	free: 'plus',
	busy: 'busy',
	requested: 'clock',
	'mine-requested': 'clock',
	closed: 'lock',
	mine: 'check',
};

interface Props {
	segment: Segment;
	/** The room (day view) or date (week view), for the accessible name. */
	where: string;
	/** Whether the segment is the one in the tab order. */
	isTabStop: boolean;
	/** How much text fits: none, the status, or the status and time. */
	detail: 'icon' | 'label' | 'full';
	/** In a list, the time is shown first and every segment has a label. */
	layout?: 'grid' | 'list';
	onChoose: () => void;
	onKeyDown: (event: React.KeyboardEvent) => void;
	onFocus: () => void;
}

/**
 * A segment in the matrix. Every status has its own color, icon and text,
 * so that it never relies on color alone.
 */
const SegmentButton = forwardRef<HTMLButtonElement, Props>(
	function SegmentButton(props, ref) {
		const {
			segment,
			where,
			isTabStop,
			detail,
			layout = 'grid',
			onChoose,
			onKeyDown,
			onFocus,
		} = props;
		const actionable = isActionable(segment);
		const time = formatTimeRange(segment.start, segment.end);
		const title =
			segment.status === 'closed'
				? `${statusLabel('closed')} ${time} – ${closedReason(segment)}`
				: `${statusLabel(segment.status)} ${time}`;

		return (
			<button
				ref={ref}
				type="button"
				className={classnames(
					'creo-rombooking-segment',
					`is-${segment.status}`,
					`is-${layout}`,
					{ 'is-past': segment.past }
				)}
				data-start={segment.start}
				tabIndex={isTabStop ? 0 : -1}
				aria-label={segmentLabel(where, segment)}
				aria-disabled={actionable ? undefined : true}
				title={title}
				onClick={() => actionable && onChoose()}
				onKeyDown={onKeyDown}
				onFocus={onFocus}
			>
				{layout === 'list' && (
					<span className="creo-rombooking-segment-time">{time}</span>
				)}
				<Icon name={statusIcons[segment.status]} size={14} />
				{layout === 'list' && (
					<span className="creo-rombooking-segment-text">
						{segment.status === 'closed'
							? closedReason(segment)
							: statusLabel(segment.status)}
					</span>
				)}
				{layout === 'grid' &&
					segment.status !== 'free' &&
					detail !== 'icon' && (
						<span className="creo-rombooking-segment-text">
							<span>{statusLabel(segment.status)}</span>
							{detail === 'full' && (
								<span className="creo-rombooking-segment-time">{time}</span>
							)}
						</span>
					)}
			</button>
		);
	}
);

export default SegmentButton;
