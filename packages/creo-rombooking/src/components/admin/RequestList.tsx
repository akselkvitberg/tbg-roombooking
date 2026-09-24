import { __, sprintf } from '@wordpress/i18n';

import type { RequestItem } from '../../api/adminTypes';
import {
	formatDateTime,
	groupItems,
	seriesCounts,
	seriesSummary,
} from '../../lib/admin';
import { capitalize, formatShortDate, formatTimeRange } from '../../lib/dates';

import KindTag from './KindTag';

interface Props {
	items: RequestItem[];
	selected: string | null;
	locale: string;
	onSelect: (id: string) => void;
}

export function whenLabel(item: RequestItem, locale: string): string {
	const time = formatTimeRange(item.start, item.end);
	if (item.kind === 'series') {
		return sprintf(
			/* translators: 1: rule, e.g. «Weekly», 2: first date, 3: time */
			__('%1$s from %2$s · %3$s', 'creo-rombooking'),
			ruleLabel(item.rule),
			formatShortDate(item.date, locale),
			time
		);
	}
	return `${capitalize(formatShortDate(item.date, locale))} · ${time}`;
}

export function ruleLabel(rule: 'weekly' | 'biweekly' | 'monthly'): string {
	return {
		weekly: __('Weekly', 'creo-rombooking'),
		biweekly: __('Every other week', 'creo-rombooking'),
		monthly: __('Monthly', 'creo-rombooking'),
	}[rule];
}

/**
 * The waiting requests, grouped, as a list of buttons that select one.
 *
 * @param props          The component props.
 * @param props.items
 * @param props.selected
 * @param props.locale
 * @param props.onSelect
 */
export default function RequestList({
	items,
	selected,
	locale,
	onSelect,
}: Props) {
	return (
		<nav
			className="creo-rombooking-queue"
			aria-label={__('Waiting requests', 'creo-rombooking')}
		>
			{groupItems(items).map((group) => (
				<section key={group.kind} className="creo-rombooking-queue-group">
					<h3>{`${group.title} (${group.items.length})`}</h3>
					<ul>
						{group.items.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									className="creo-rombooking-queue-item"
									aria-current={item.id === selected ? 'true' : undefined}
									onClick={() => onSelect(item.id)}
								>
									<span className="creo-rombooking-queue-top">
										<strong>{item.room.name}</strong>
										<KindTag item={item} />
									</span>
									<span>{whenLabel(item, locale)}</span>
									<span className="creo-rombooking-help">
										{sprintf(
											/* translators: 1: name of the member, 2: date and time */
											__('%1$s · Sent %2$s', 'creo-rombooking'),
											item.user.name,
											formatDateTime(item.sentAt, locale)
										)}
									</span>
									{item.kind === 'series' && (
										<span className="creo-rombooking-help">
											{seriesSummary(seriesCounts(item.occurrences))}
										</span>
									)}
								</button>
							</li>
						))}
					</ul>
				</section>
			))}
		</nav>
	);
}
