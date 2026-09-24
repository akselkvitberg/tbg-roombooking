import { useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import Icon from './Icon';

interface Props {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
	footer?: React.ReactNode;
}

/**
 * A modal dialog built on the native `<dialog>` element, which traps focus,
 * closes on Escape and makes the rest of the page inert. Focus returns to
 * the element that opened it.
 *
 * @param props The component props.
 */
export default function Dialog(props: Props) {
	const { title, onClose, children, footer } = props;
	const ref = useRef<HTMLDialogElement>(null);
	const titleId = useRef(
		`creo-rombooking-dialog-${Math.random().toString(36).slice(2)}`
	).current;

	useEffect(() => {
		const dialog = ref.current;
		const opener = dialog?.ownerDocument.activeElement as HTMLElement | null;

		dialog?.showModal();

		return () => {
			dialog?.close();
			opener?.focus();
		};
	}, []);

	return (
		// The native dialog handles Escape through its `cancel` event.
		<dialog
			ref={ref}
			className="creo-rombooking-dialog"
			aria-labelledby={titleId}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<div className="creo-rombooking-dialog-head">
				<h2 id={titleId} className="creo-rombooking-dialog-title">
					{title}
				</h2>
				<button
					type="button"
					className="creo-rombooking-icon-button"
					onClick={onClose}
				>
					<Icon name="close" size={20} />
					<span className="creo-rombooking-sr">
						{__('Close', 'creo-rombooking')}
					</span>
				</button>
			</div>
			<div className="creo-rombooking-dialog-body">{children}</div>
			{footer && <div className="creo-rombooking-dialog-foot">{footer}</div>}
		</dialog>
	);
}
