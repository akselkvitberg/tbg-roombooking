import { useCallback, useEffect, useState } from '@wordpress/element';

import { errorMessage, getAvailability, getRooms } from '../api/client';
import type { Availability, Room } from '../api/types';

interface State {
	rooms: Room[] | null;
	availability: Availability | null;
	loading: boolean;
	error: string | null;
	reload: () => void;
}

/**
 * Loads the rooms once, and the availability for a date range. While a new
 * range loads, the previous one stays visible.
 *
 * @param from              The first date.
 * @param to                The last date.
 * @param fetchAvailability Loads the availability; the administrator's version includes names.
 */
export default function useAvailability(
	from: string,
	to: string,
	fetchAvailability: (
		from: string,
		to: string
	) => Promise<Availability> = getAvailability
): State {
	const [rooms, setRooms] = useState<Room[] | null>(null);
	const [availability, setAvailability] = useState<Availability | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);

		Promise.all([
			rooms ? Promise.resolve(rooms) : getRooms(),
			fetchAvailability(from, to),
		])
			.then(([loadedRooms, loadedAvailability]) => {
				if (!cancelled) {
					setRooms(loadedRooms);
					setAvailability(loadedAvailability);
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setError(errorMessage(err) ?? '');
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
		// Rooms are loaded once; they are not a dependency.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [from, to, attempt]);

	const reload = useCallback(() => setAttempt((n) => n + 1), []);

	return { rooms, availability, loading, error, reload };
}
