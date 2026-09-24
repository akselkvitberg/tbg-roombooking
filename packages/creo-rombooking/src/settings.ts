export interface Settings {
	restNamespace: string;
	/** Today's date in the site's timezone (Y-m-d). */
	today: string;
	user: {
		id: number;
		name: string;
		isAdmin: boolean;
		hasPhone: boolean;
		phoneSource: 'token' | 'profile' | null;
	};
}

declare global {
	interface Window {
		creoRombookingSettings?: Settings;
	}
}

export function getSettings(): Settings {
	if (!window.creoRombookingSettings) {
		throw new Error('window.creoRombookingSettings is missing.');
	}
	return window.creoRombookingSettings;
}
