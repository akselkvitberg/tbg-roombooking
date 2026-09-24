export interface Settings {
	restNamespace: string;
	/** Today's date in the site's timezone (Y-m-d). */
	today: string;
	/** BCP 47 language tag, e.g. `nb-NO`. */
	locale: string;
	/** The site's timezone, e.g. `Europe/Oslo` or `+02:00`. */
	timezone: string;
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
