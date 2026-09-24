import classnames from 'classnames';

import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import type { Room } from '../../api/types';
import {
	capitalize,
	formatDayAndMonth,
	formatTime,
	isoWeek,
	parseDate,
} from '../../lib/dates';
import { indexAt, navigate, Position, weekKey } from '../../lib/navigation';
import type { Segment } from '../../lib/segments';

import SegmentButton from './SegmentButton';

export interface WeekDay {
	date: string;
	segments: Segment[];
}

interface Props {
	room: Room;
	days: WeekDay[];
	/** The day to start on, e.g. the chosen date. */
	initialDate: string;
	today: string;
	locale: string;
	dayStart: number;
	dayEnd: number;
	slot: number;
	busy: boolean;
	helpId: string;
	onChoose: (day: WeekDay, index: number) => void;
	onWeekChange: (weeks: number) => void;
}

/**
 * Height of a slot in pixels.
 */
const SLOT_HEIGHT = 22;

/**
 * How much text fits in a segment that spans a number of slots.
 *
 * @param span The number of slots.
 */
function detailFor(span: number): 'icon' | 'label' | 'full' {
	if (span >= 3) {
		return 'full';
	}
	return span >= 2 ? 'label' : 'icon';
}

/**
 * The week view: one room, with the days as columns and time running
 * downwards. Each day is a row in the WAI-ARIA grid, so arrow keys up and
 * down move within a day, and left and right move between days.
 *
 * @param props The component props.
 */
export default function WeekMatrix(props: Props) {
	const { room, days, today, locale, dayStart, dayEnd, slot, busy, helpId } =
		props;
	const firstRow = Math.max(
		0,
		days.findIndex((day) => day.date === props.initialDate)
	);
	const [position, setPositionState] = useState<Position>({
		row: firstRow,
		minute: dayStart,
	});
	// Mirrors the position synchronously, since focus events fire before React re-renders.
	const positionRef = useRef(position);
	const setPosition = (next: Position) => {
		positionRef.current = next;
		setPositionState(next);
	};
	const buttons = useRef(new Map<string, HTMLButtonElement>());
	const shouldFocus = useRef(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	// On narrow screens the days scroll sideways; start with the chosen day in view.
	useEffect(() => {
		const scroller = scrollRef.current;
		const column =
			scroller?.querySelectorAll<HTMLElement>('[role="row"]')[firstRow];
		if (scroller && column && scroller.scrollWidth > scroller.clientWidth) {
			const timeAxis = scroller.querySelector<HTMLElement>(
				'.creo-rombooking-week-times'
			);
			scroller.scrollLeft = column.offsetLeft - (timeAxis?.offsetWidth ?? 0);
		}
		// Only when the view opens.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const row = Math.min(position.row, days.length - 1);
	const segmentsAt = (r: number) => days[r].segments;
	const keyAt = (target: Position) =>
		`${target.row}-${
			segmentsAt(target.row)[indexAt(segmentsAt(target.row), target.minute)]
				.start
		}`;
	const tabStopKey =
		days.length > 0 ? keyAt({ row, minute: position.minute }) : '';

	// After Page Up or Page Down, focus the same place when the new week has loaded.
	useEffect(() => {
		if (shouldFocus.current) {
			buttons.current.get(tabStopKey)?.focus();
			shouldFocus.current = false;
		}
	}, [tabStopKey, days]);

	const onKeyDown = (event: React.KeyboardEvent) => {
		const result = navigate(
			days.map((day) => day.segments),
			{ row, minute: position.minute },
			weekKey(event.key),
			event.ctrlKey || event.metaKey
		);
		if (!result) {
			return;
		}
		event.preventDefault();
		if (result.type === 'move') {
			setPosition(result.position);
			buttons.current.get(keyAt(result.position))?.focus();
		} else {
			shouldFocus.current = true;
			props.onWeekChange(result.type === 'next-day' ? 1 : -1);
		}
	};

	const hours: number[] = [];
	for (let minute = dayStart; minute < dayEnd; minute += 60) {
		hours.push(minute);
	}

	return (
		<div className="creo-rombooking-week-scroll" ref={scrollRef}>
			<div
				className="creo-rombooking-week"
				role="grid"
				aria-label={sprintf(
					/* translators: 1: room name, 2: week number */
					__('%1$s, week %2$d', 'creo-rombooking'),
					room.name,
					days.length > 0 ? isoWeek(days[0].date) : 0
				)}
				aria-describedby={helpId}
				aria-busy={busy}
				style={
					{
						'--creo-rombooking-slot-height': `${SLOT_HEIGHT}px`,
					} as React.CSSProperties
				}
			>
				<div className="creo-rombooking-week-times" aria-hidden="true">
					<div className="creo-rombooking-week-corner" />
					{hours.map((minute) => (
						<div key={minute} className="creo-rombooking-week-time">
							{formatTime(minute)}
						</div>
					))}
				</div>

				{days.map((day, rowIndex) => {
					const isToday = day.date === today;
					const weekday = new Intl.DateTimeFormat(locale, {
						weekday: 'short',
						timeZone: 'UTC',
					}).format(parseDate(day.date));
					const long = capitalize(formatDayAndMonth(day.date, locale));

					return (
						<div key={day.date} className="creo-rombooking-week-day" role="row">
							<div
								className={classnames('creo-rombooking-week-head', {
									'is-today': isToday,
								})}
								role="rowheader"
							>
								<span aria-hidden="true">
									{capitalize(weekday)}{' '}
									<strong>{parseDate(day.date).getUTCDate()}</strong>
								</span>
								<span className="creo-rombooking-sr">
									{isToday
										? sprintf(
												/* translators: %s: date */
												__('%s (today)', 'creo-rombooking'),
												long
										  )
										: long}
								</span>
							</div>
							{day.segments.map((segment, index) => {
								const span = (segment.end - segment.start) / slot;
								const key = `${rowIndex}-${segment.start}`;
								return (
									<div
										key={segment.start}
										className="creo-rombooking-week-cell"
										role="gridcell"
										style={{ height: `${span * SLOT_HEIGHT}px` }}
										data-hour-start={
											(segment.start - dayStart) % 60 === 0 ? true : undefined
										}
									>
										<SegmentButton
											ref={(element) => {
												if (element) {
													buttons.current.set(key, element);
												} else {
													buttons.current.delete(key);
												}
											}}
											segment={segment}
											where={long}
											isTabStop={key === tabStopKey}
											detail={detailFor(span)}
											onChoose={() => props.onChoose(day, index)}
											onKeyDown={onKeyDown}
											onFocus={() => {
												const current = positionRef.current;
												const contains =
													current.row === rowIndex &&
													segment.start <= current.minute &&
													current.minute < segment.end;
												if (!contains) {
													setPosition({ row: rowIndex, minute: segment.start });
												}
											}}
										/>
									</div>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
