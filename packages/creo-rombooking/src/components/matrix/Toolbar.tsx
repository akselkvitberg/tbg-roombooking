import { __ } from '@wordpress/i18n';

import { addDays, isDateString } from '../../lib/dates';
import Icon from '../Icon';

export type View = 'day' | 'week';

interface Props {
	date: string;
	today: string;
	view: View;
	/** E.g. «Onsdag 30. september 2026» or «Storsalen · Uke 40 · 28. sep.–4. okt. 2026». */
	heading: string;
	/** Whether the day and week toggle is shown. */
	canChangeView?: boolean;
	onDateChange: (date: string) => void;
	onViewChange: (view: View) => void;
}

export default function Toolbar(props: Props) {
	const { date, today, view, heading, onDateChange, onViewChange } = props;
	const canChangeView = props.canChangeView ?? true;
	const step = view === 'week' ? 7 : 1;

	return (
		<div className="creo-rombooking-toolbar">
			<div
				className="creo-rombooking-datenav"
				role="group"
				aria-label={__('Choose date', 'creo-rombooking')}
			>
				<button
					type="button"
					className="creo-rombooking-icon-button is-outlined"
					onClick={() => onDateChange(addDays(date, -step))}
				>
					<Icon name="chevronLeft" size={20} />
					<span className="creo-rombooking-sr">
						{view === 'week'
							? __('Previous week', 'creo-rombooking')
							: __('Previous day', 'creo-rombooking')}
					</span>
				</button>
				<label className="creo-rombooking-sr" htmlFor="creo-rombooking-date">
					{__('Date', 'creo-rombooking')}
				</label>
				<input
					id="creo-rombooking-date"
					className="creo-rombooking-input"
					type="date"
					value={date}
					onChange={(event) => {
						if (isDateString(event.target.value)) {
							onDateChange(event.target.value);
						}
					}}
				/>
				<button
					type="button"
					className="creo-rombooking-icon-button is-outlined"
					onClick={() => onDateChange(addDays(date, step))}
				>
					<Icon name="chevronRight" size={20} />
					<span className="creo-rombooking-sr">
						{view === 'week'
							? __('Next week', 'creo-rombooking')
							: __('Next day', 'creo-rombooking')}
					</span>
				</button>
				<button
					type="button"
					className="creo-rombooking-button is-secondary"
					onClick={() => onDateChange(today)}
					disabled={date === today}
				>
					{__('Today', 'creo-rombooking')}
				</button>
			</div>

			<h2 className="creo-rombooking-heading" aria-live="polite">
				{heading}
			</h2>

			{canChangeView && (
				<div
					className="creo-rombooking-toggle"
					role="group"
					aria-label={__('View', 'creo-rombooking')}
				>
					<button
						type="button"
						aria-pressed={view === 'day'}
						onClick={() => onViewChange('day')}
					>
						{__('Day', 'creo-rombooking')}
					</button>
					<button
						type="button"
						aria-pressed={view === 'week'}
						onClick={() => onViewChange('week')}
					>
						{__('Week', 'creo-rombooking')}
					</button>
				</div>
			)}
		</div>
	);
}
