import Icon from '../Icon';

interface Props {
	id: string;
	message?: string;
}

export default function FieldError({ id, message }: Props) {
	if (!message) {
		return null;
	}
	return (
		<p id={id} className="creo-rombooking-error">
			<Icon name="warning" size={16} />
			<span>{message}</span>
		</p>
	);
}
