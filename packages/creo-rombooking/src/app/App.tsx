import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import EmptyState from '../components/EmptyState';
import Tabs, { Tab } from '../components/Tabs';
import { Settings } from '../settings';
import AdminInboxView from '../views/AdminInboxView';
import BookView from '../views/BookView';
import SmsLogView from '../views/SmsLogView';

interface Props {
	settings: Settings;
}

function getTabs(isAdmin: boolean): Tab[] {
	const tabs: Tab[] = [
		{ id: 'book', label: __('Book a room', 'creo-rombooking') },
		{ id: 'mine', label: __('My bookings', 'creo-rombooking') },
	];

	if (isAdmin) {
		tabs.push(
			{ id: 'requests', label: __('Requests', 'creo-rombooking') },
			{ id: 'admin-matrix', label: __('Overview', 'creo-rombooking') },
			{ id: 'rooms', label: __('Rooms', 'creo-rombooking') },
			{ id: 'sms', label: __('Text message log', 'creo-rombooking') }
		);
	}

	return tabs;
}

/**
 * Reads the selected tab from the URL hash, e.g. `#rombooking=mine`.
 *
 * @param tabs The available tabs.
 */
function tabFromHash(tabs: Tab[]): string {
	const match = window.location.hash.match(/rombooking=([\w-]+)/);
	const id = match?.[1];
	return tabs.some((tab) => tab.id === id) ? (id as string) : tabs[0].id;
}

export default function App({ settings }: Props) {
	const tabs = getTabs(settings.user.isAdmin);
	const [selected, setSelected] = useState(() => tabFromHash(tabs));

	useEffect(() => {
		const onHashChange = () => setSelected(tabFromHash(tabs));
		window.addEventListener('hashchange', onHashChange);
		return () => window.removeEventListener('hashchange', onHashChange);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const select = (id: string) => {
		setSelected(id);
		window.history.replaceState(null, '', `#rombooking=${id}`);
	};

	const current = tabs.find((tab) => tab.id === selected) ?? tabs[0];

	return (
		<div className="creo-rombooking-app">
			<Tabs
				tabs={tabs}
				selected={current.id}
				label={__('Room booking', 'creo-rombooking')}
				onSelect={select}
			/>

			<div
				role="tabpanel"
				id={`creo-rombooking-panel-${current.id}`}
				aria-labelledby={`creo-rombooking-tab-${current.id}`}
				tabIndex={0}
				className="creo-rombooking-panel"
			>
				{current.id === 'book' && <BookView settings={settings} />}
				{current.id === 'requests' && <AdminInboxView settings={settings} />}
				{current.id === 'sms' && <SmsLogView settings={settings} />}
				{!['book', 'requests', 'sms'].includes(current.id) && (
					<EmptyState title={current.label}>
						{__('This part is not built yet.', 'creo-rombooking')}
					</EmptyState>
				)}
			</div>
		</div>
	);
}
