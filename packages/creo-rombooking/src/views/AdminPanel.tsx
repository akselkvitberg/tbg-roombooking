import type { Settings } from '../settings';

import AdminInboxView from './AdminInboxView';
import AdminMatrixView from './AdminMatrixView';
import RoomSetupView from './RoomSetupView';
import SmsLogView from './SmsLogView';

export type AdminTab = 'requests' | 'admin-matrix' | 'rooms' | 'sms';

interface Props {
	tab: AdminTab;
	settings: Settings;
}

/**
 * The administrator's tabs. They are loaded as a separate file, only when an
 * administrator opens one, so that members download less.
 *
 * @param props          The component props.
 * @param props.tab
 * @param props.settings
 */
export default function AdminPanel({ tab, settings }: Props) {
	switch (tab) {
		case 'requests':
			return <AdminInboxView settings={settings} />;
		case 'admin-matrix':
			return <AdminMatrixView settings={settings} />;
		case 'rooms':
			return <RoomSetupView settings={settings} />;
		case 'sms':
			return <SmsLogView settings={settings} />;
	}
}
