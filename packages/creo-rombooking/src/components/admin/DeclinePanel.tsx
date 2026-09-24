import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import type { ActionResult } from '../../api/adminTypes';
import useAction from '../../hooks/useAction';

import ReasonField, { reasonRequired } from './ReasonField';

interface Props {
	title: string;
	submitLabel: string;
	recipient: string;
	onSubmit: (reason: string) => Promise<ActionResult>;
	onDone: (message: string) => void;
	onCancel: () => void;
}

export default function DeclinePanel(props: Props) {
	const { title, submitLabel, recipient, onSubmit, onDone, onCancel } = props;
	const [reason, setReason] = useState('');
	const reasonRef = useRef<HTMLTextAreaElement>(null);
	const { busy, errors, error, run, setErrors } = useAction(onDone);

	useEffect(() => reasonRef.current?.focus(), []);

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		if (!reason.trim()) {
			setErrors({ reason: reasonRequired() });
			reasonRef.current?.focus();
			return;
		}
		run(() => onSubmit(reason.trim()));
	};

	return (
		<form
			className="creo-rombooking-action-panel"
			noValidate
			aria-labelledby="creo-rombooking-decline-title"
			onSubmit={submit}
		>
			<h4 id="creo-rombooking-decline-title">{title}</h4>
			<ReasonField
				ref={reasonRef}
				id="creo-rombooking-decline-reason"
				label={__('Reason', 'creo-rombooking')}
				recipient={recipient}
				value={reason}
				error={errors.reason}
				onChange={setReason}
			/>
			{error && (
				<p className="creo-rombooking-error" role="alert">
					{error}
				</p>
			)}
			<div className="creo-rombooking-actions">
				<button
					type="submit"
					className="creo-rombooking-button is-danger"
					disabled={busy}
				>
					{submitLabel}
				</button>
				<button
					type="button"
					className="creo-rombooking-button is-secondary"
					onClick={onCancel}
				>
					{__('Cancel', 'creo-rombooking')}
				</button>
			</div>
		</form>
	);
}
