import classnames from 'classnames';

import { useRef } from '@wordpress/element';

export interface Tab {
	id: string;
	label: string;
}

interface Props {
	tabs: Tab[];
	selected: string;
	label: string;
	onSelect: (id: string) => void;
}

/**
 * Tabs following the WAI-ARIA tabs pattern: arrow keys, Home and End move
 * between tabs, and only the selected tab is in the tab order.
 *
 * @param props The component props.
 */
export default function Tabs(props: Props) {
	const { tabs, selected, label, onSelect } = props;
	const refs = useRef<Array<HTMLButtonElement | null>>([]);

	const focus = (index: number) => {
		const next = (index + tabs.length) % tabs.length;
		onSelect(tabs[next].id);
		refs.current[next]?.focus();
	};

	const onKeyDown = (event: React.KeyboardEvent, index: number) => {
		const keys: Record<string, () => void> = {
			ArrowRight: () => focus(index + 1),
			ArrowLeft: () => focus(index - 1),
			Home: () => focus(0),
			End: () => focus(tabs.length - 1),
		};
		if (keys[event.key]) {
			event.preventDefault();
			keys[event.key]();
		}
	};

	return (
		<div role="tablist" aria-label={label} className="creo-rombooking-tabs">
			{tabs.map((tab, index) => {
				const isSelected = tab.id === selected;
				return (
					<button
						key={tab.id}
						ref={(el) => (refs.current[index] = el)}
						type="button"
						role="tab"
						id={`creo-rombooking-tab-${tab.id}`}
						aria-selected={isSelected}
						aria-controls={`creo-rombooking-panel-${tab.id}`}
						tabIndex={isSelected ? 0 : -1}
						className={classnames('creo-rombooking-tab', {
							'is-selected': isSelected,
						})}
						onClick={() => onSelect(tab.id)}
						onKeyDown={(event) => onKeyDown(event, index)}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
