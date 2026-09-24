import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import type { Room } from '../../api/types';
import { formatDayAndMonth, formatTime } from '../../lib/dates';
import { navigate, indexAt, Position } from '../../lib/navigation';
import type { Segment } from '../../lib/segments';

import SegmentButton from './SegmentButton';

export interface MatrixRow {
	room: Room;
	segments: Segment[];
}

/**
 * What the administrator's overview adds: who booked, and moving bookings
 * by dragging them to another room or time.
 */
export interface AdminOptions {
	text: (segment: Segment) => string | undefined;
	description: (segment: Segment) => string | undefined;
	actionable: (segment: Segment) => boolean;
	/** Whether a segment can be dragged. */
	canMove: (segment: Segment) => boolean;
	/** A segment was dropped on a room, starting at a minute. */
	onDrop: (
		segment: Segment,
		from: MatrixRow,
		to: MatrixRow,
		start: number
	) => void;
}

interface Drag {
	segment: Segment;
	row: number;
	/** Where in the segment it was grabbed, in minutes from its start. */
	offset: number;
}

interface Props {
	rows: MatrixRow[];
	date: string;
	locale: string;
	dayStart: number;
	dayEnd: number;
	slot: number;
	busy: boolean;
	helpId: string;
	onChoose: (row: MatrixRow, index: number) => void;
	onDayChange: (days: number) => void;
	admin?: AdminOptions;
}

/**
 * How much text fits in a segment that spans a number of slots.
 *
 * @param span The number of slots.
 */
function detailFor(span: number): 'icon' | 'label' | 'full' {
	if (span >= 6) {
		return 'full';
	}
	return span >= 3 ? 'label' : 'icon';
}

export function roomMeta(room: Room): string {
	const places = sprintf(
		/* translators: %d: number of people the room fits */
		_n('%d place', '%d places', room.capacity, 'creo-rombooking'),
		room.capacity
	);
	const approval =
		room.approval === 'manual'
			? __('approval', 'creo-rombooking')
			: __('automatic', 'creo-rombooking');
	return `${places} · ${approval}`;
}

/**
 * The day view: rooms as rows and half hours from 08:00 to 22:00 as columns.
 * Follows the WAI-ARIA grid pattern, with one segment in the tab order.
 *
 * @param props The component props.
 */
export default function DayMatrix(props: Props) {
	const { rows, date, locale, dayStart, dayEnd, slot, busy, helpId } = props;
	const [position, setPositionState] = useState<Position>({
		row: 0,
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
	const drag = useRef<Drag | null>(null);
	const [dropTarget, setDropTarget] = useState<{
		row: number;
		start: number;
		end: number;
	} | null>(null);
	const { admin } = props;

	const row = Math.min(position.row, rows.length - 1);
	const tabStop =
		rows.length > 0
			? rows[row].segments[indexAt(rows[row].segments, position.minute)]
			: null;
	const tabStopKey = tabStop ? `${row}-${tabStop.start}` : '';

	const keyAt = (target: Position) => {
		const segments = rows[target.row].segments;
		return `${target.row}-${segments[indexAt(segments, target.minute)].start}`;
	};

	// After Page Up or Page Down, focus the same place when the new day has loaded.
	useEffect(() => {
		if (shouldFocus.current) {
			buttons.current.get(tabStopKey)?.focus();
			shouldFocus.current = false;
		}
	}, [tabStopKey, date]);

	const onKeyDown = (event: React.KeyboardEvent) => {
		const result = navigate(
			rows.map((r) => r.segments),
			{ row, minute: position.minute },
			event.key,
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
			props.onDayChange(result.type === 'next-day' ? 1 : -1);
		}
	};

	/**
	 * The slot under the pointer in a row, where a dragged booking would start.
	 *
	 * @param event The drag event over the row.
	 */
	const startAt = (event: React.DragEvent<HTMLElement>): number | null => {
		const current = drag.current;
		const cells = event.currentTarget.querySelector<HTMLElement>(
			'.creo-rombooking-matrix-rowhead'
		);
		if (!current || !cells) {
			return null;
		}
		const rect = event.currentTarget.getBoundingClientRect();
		const left = rect.left + cells.offsetWidth;
		const fraction = (event.clientX - left) / (rect.right - left);
		const length = current.segment.end - current.segment.start;
		const pointer = dayStart + fraction * (dayEnd - dayStart) - current.offset;
		const snapped = Math.round((pointer - dayStart) / slot) * slot + dayStart;
		return Math.min(Math.max(snapped, dayStart), dayEnd - length);
	};

	const dropProps = (rowIndex: number) =>
		admin
			? {
					onDragOver: (event: React.DragEvent<HTMLElement>) => {
						const start = startAt(event);
						if (start === null || !drag.current) {
							return;
						}
						event.preventDefault();
						event.dataTransfer.dropEffect = 'move';
						const end =
							start + drag.current.segment.end - drag.current.segment.start;
						if (dropTarget?.row !== rowIndex || dropTarget.start !== start) {
							setDropTarget({ row: rowIndex, start, end });
						}
					},
					onDrop: (event: React.DragEvent<HTMLElement>) => {
						const start = startAt(event);
						const current = drag.current;
						event.preventDefault();
						setDropTarget(null);
						drag.current = null;
						if (start !== null && current) {
							admin.onDrop(
								current.segment,
								rows[current.row],
								rows[rowIndex],
								start
							);
						}
					},
			  }
			: {};

	const hours: number[] = [];
	for (let minute = dayStart; minute < dayEnd; minute += 60) {
		hours.push(minute);
	}
	const slotsPerHour = 60 / slot;

	return (
		<div className="creo-rombooking-matrix-scroll">
			<div
				className="creo-rombooking-matrix"
				role="grid"
				aria-label={sprintf(
					/* translators: %s: date, e.g. «wednesday 23 September» */
					__('Rooms and times, %s', 'creo-rombooking'),
					formatDayAndMonth(date, locale)
				)}
				aria-describedby={helpId}
				aria-busy={busy}
				style={
					{
						'--creo-rombooking-slots': (dayEnd - dayStart) / slot,
					} as React.CSSProperties
				}
			>
				<div className="creo-rombooking-matrix-row is-head" role="row">
					<div className="creo-rombooking-matrix-rowhead" role="columnheader">
						{__('Room', 'creo-rombooking')}
					</div>
					{hours.map((minute) => (
						<div
							key={minute}
							className="creo-rombooking-matrix-hour"
							role="columnheader"
							aria-colspan={slotsPerHour}
							style={{ gridColumn: `span ${slotsPerHour}` }}
						>
							{formatTime(minute)}
						</div>
					))}
				</div>

				{rows.map((matrixRow, rowIndex) => (
					<div
						key={matrixRow.room.id}
						className="creo-rombooking-matrix-row"
						role="row"
						{...dropProps(rowIndex)}
					>
						<div className="creo-rombooking-matrix-rowhead" role="rowheader">
							<span className="creo-rombooking-room-name">
								{matrixRow.room.name}
							</span>
							<span className="creo-rombooking-room-meta">
								{roomMeta(matrixRow.room)}
							</span>
						</div>
						{matrixRow.segments.map((segment, index) => {
							const span = (segment.end - segment.start) / slot;
							const key = `${rowIndex}-${segment.start}`;
							return (
								<div
									key={segment.start}
									className="creo-rombooking-matrix-cell"
									role="gridcell"
									aria-colspan={span > 1 ? span : undefined}
									style={{ gridColumn: `span ${span}` }}
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
										where={matrixRow.room.name}
										isTabStop={key === tabStopKey}
										detail={detailFor(span)}
										text={admin?.text(segment)}
										description={admin?.description(segment)}
										actionable={admin?.actionable(segment)}
										onDragStart={
											admin?.canMove(segment)
												? (event) => {
														const rect =
															event.currentTarget.getBoundingClientRect();
														const fraction =
															(event.clientX - rect.left) / rect.width;
														drag.current = {
															segment,
															row: rowIndex,
															offset:
																Math.floor(
																	(fraction * (segment.end - segment.start)) /
																		slot
																) * slot,
														};
														event.dataTransfer.effectAllowed = 'move';
														event.dataTransfer.setData(
															'text/plain',
															String(segment.period.booking?.id ?? '')
														);
												  }
												: undefined
										}
										onDragEnd={() => {
											drag.current = null;
											setDropTarget(null);
										}}
										onChoose={() => props.onChoose(matrixRow, index)}
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
						{dropTarget?.row === rowIndex && (
							<div
								className="creo-rombooking-drop"
								aria-hidden="true"
								style={
									{
										'--creo-rombooking-drop-start':
											(dropTarget.start - dayStart) / (dayEnd - dayStart),
										'--creo-rombooking-drop-length':
											(dropTarget.end - dropTarget.start) / (dayEnd - dayStart),
									} as React.CSSProperties
								}
							>
								{formatTime(dropTarget.start)}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
