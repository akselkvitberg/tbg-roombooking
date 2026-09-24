interface Props {
	title: string;
	children?: React.ReactNode;
}

export default function EmptyState({ title, children }: Props) {
	return (
		<div className="creo-rombooking-empty">
			<p className="creo-rombooking-empty-title">{title}</p>
			{children && <div className="creo-rombooking-empty-text">{children}</div>}
		</div>
	);
}
