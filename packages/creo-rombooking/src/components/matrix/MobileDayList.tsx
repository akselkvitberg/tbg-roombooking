import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { formatDayAndMonth } from '../../lib/dates';
import { indexAt, navigate } from '../../lib/navigation';

import type { MatrixRow } from './DayMatrix';
import SegmentButton from './SegmentButton';

interface Props {
	row: MatrixRow;
	date: string;
	locale: string;
	busy: boolean;
	helpId: string;
	onChoose: (row: MatrixRow, index: number) => void;
	onDayChange: (days: number) => void;
}

/**
 * The day view on small screens: one room at a time, with the times as a
 * vertical list. Arrow keys move up and down, with one item in the tab order.
 *
 * @param props The component props.
 */
export default function MobileDayList(props: Props) {
	const { row, date, locale, busy, helpId } = props;
	const [minute, setMinute] = useState(row.segments[0]?.start ?? 0);
	const minuteRef = useRef(minute);
	const buttons = useRef(new Map<number, HTMLButtonElement>());
	const shouldFocus = useRef(false);

	const index = indexAt(row.segments, minute);
	const tabStop = row.segments[index]?.start;

	useEffect(() => {
		if (shouldFocus.current && tabStop !== undefined) {
			buttons.current.get(tabStop)?.focus();
			shouldFocus.current = false;
		}
	}, [tabStop, date, row.room.id]);

	const move = (next: number) => {
		minuteRef.current = next;
		setMinute(next);
		buttons.current.get(next)?.focus();
	};

	const onKeyDown = (event: React.KeyboardEvent) => {
		const keys: Record<string, string> = {
			ArrowDown: 'ArrowRight',
			ArrowUp: 'ArrowLeft',
			Home: 'Home',
			End: 'End',
			PageUp: 'PageUp',
			PageDown: 'PageDown',
		};
		const key = keys[event.key];
		const result = key
			? navigate([row.segments], { row: 0, minute: minuteRef.current }, key)
			: null;
		if (!result) {
			return;
		}
		event.preventDefault();
		if (result.type === 'move') {
			move(result.position.minute);
		} else {
			shouldFocus.current = true;
			props.onDayChange(result.type === 'next-day' ? 1 : -1);
		}
	};

	return (
		<ul
			className="creo-rombooking-list"
			aria-label={sprintf(
				/* translators: 1: room name, 2: date */
				__('Times in %1$s, %2$s', 'creo-rombooking'),
				row.room.name,
				formatDayAndMonth(date, locale)
			)}
			aria-describedby={helpId}
			aria-busy={busy}
		>
			{row.segments.map((segment, segmentIndex) => (
				<li key={segment.start}>
					<SegmentButton
						ref={(element) => {
							if (element) {
								buttons.current.set(segment.start, element);
							} else {
								buttons.current.delete(segment.start);
							}
						}}
						segment={segment}
						where={row.room.name}
						isTabStop={segment.start === tabStop}
						detail="full"
						layout="list"
						onChoose={() => props.onChoose(row, segmentIndex)}
						onKeyDown={onKeyDown}
						onFocus={() => {
							const current = minuteRef.current;
							if (!(segment.start <= current && current < segment.end)) {
								minuteRef.current = segment.start;
								setMinute(segment.start);
							}
						}}
					/>
				</li>
			))}
		</ul>
	);
}
