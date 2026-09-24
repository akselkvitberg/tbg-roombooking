import { __, sprintf } from '@wordpress/i18n';

import { DEADLINES, deadlineText } from '../../lib/admin';

interface Props {
	id: string;
	value: number;
	locale: string;
	timezone: string;
	onChange: (hours: number) => void;
}

export function deadlineLabel(hours: number): string {
	return hours % 24 === 0 && hours > 48
		? /* translators: %d: number of days */
		  sprintf(__('%d days', 'creo-rombooking'), hours / 24)
		: /* translators: %d: number of hours */
		  sprintf(__('%d hours', 'creo-rombooking'), hours);
}

export default function DeadlineField(props: Props) {
	const { id, value, locale, timezone, onChange } = props;

	return (
		<div className="creo-rombooking-field">
			<label htmlFor={id}>{__('Deadline for answer', 'creo-rombooking')}</label>
			<select
				id={id}
				className="creo-rombooking-input"
				value={value}
				aria-describedby={`${id}-hint`}
				onChange={(event) => onChange(Number(event.target.value))}
			>
				{DEADLINES.map((hours) => (
					<option key={hours} value={hours}>
						{deadlineLabel(hours)}
					</option>
				))}
			</select>
			<p id={`${id}-hint`} className="creo-rombooking-help">
				{sprintf(
					/* translators: %s: date and time */
					__(
						'Answer by %s. Without an answer, the proposal is deleted.',
						'creo-rombooking'
					),
					deadlineText(value, locale, timezone)
				)}
			</p>
		</div>
	);
}
