import { forwardRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { REASON_MAX } from '../../lib/admin';
import Icon from '../Icon';

import FieldError from './FieldError';

interface Props {
	id: string;
	label: string;
	/** Who gets the reason by text message. */
	recipient: string;
	value: string;
	error?: string;
	onChange: (value: string) => void;
}

/**
 * A required reason, sent by text message, with a warning not to write
 * sensitive information.
 */
const ReasonField = forwardRef<HTMLTextAreaElement, Props>(
	function ReasonField(props, ref) {
		const { id, label, recipient, value, error, onChange } = props;
		const hintId = `${id}-hint`;
		const errorId = `${id}-error`;

		return (
			<div className="creo-rombooking-field">
				<label htmlFor={id}>
					{label}{' '}
					<span className="creo-rombooking-optional">
						{__('(required)', 'creo-rombooking')}
					</span>
				</label>
				<textarea
					ref={ref}
					id={id}
					className="creo-rombooking-input"
					rows={3}
					maxLength={REASON_MAX}
					required
					aria-required="true"
					aria-invalid={error && !value.trim() ? true : undefined}
					aria-describedby={[error && !value.trim() && errorId, hintId]
						.filter(Boolean)
						.join(' ')}
					value={value}
					onChange={(event) => onChange(event.target.value)}
				/>
				<p id={hintId} className="creo-rombooking-help is-with-icon">
					<Icon name="info" size={14} />
					<span>
						{sprintf(
							/* translators: %s: name of the member */
							__(
								'Sent by text message to %s. Do not write sensitive information, codes or passwords.',
								'creo-rombooking'
							),
							recipient
						)}
					</span>
				</p>
				{/* A missing reason stops being an error as soon as something is written. */}
				<FieldError id={errorId} message={value.trim() ? undefined : error} />
			</div>
		);
	}
);

export default ReasonField;

/**
 * The error for a missing reason.
 */
export function reasonRequired(): string {
	return __('Write a reason. It is sent as a text message.', 'creo-rombooking');
}
