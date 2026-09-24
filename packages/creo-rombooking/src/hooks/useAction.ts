import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import type { ActionResult } from '../api/adminTypes';
import { errorMessage } from '../api/client';

export type Errors = Record<string, string>;

/**
 * Runs an administrator's action and keeps track of whether it is running,
 * and of the errors, by field or in general.
 *
 * @param onDone Called with the confirmation when the action succeeds.
 */
export default function useAction(onDone: (message: string) => void) {
	const [busy, setBusy] = useState(false);
	const [errors, setErrors] = useState<Errors>({});
	const [error, setError] = useState<string | null>(null);

	const run = async (action: () => Promise<ActionResult>) => {
		setBusy(true);
		setError(null);
		setErrors({});
		try {
			const result = await action();
			setBusy(false);
			onDone(result.message);
			return true;
		} catch (caught) {
			const fields = (caught as { data?: { errors?: Errors } } | null)?.data
				?.errors;
			if (fields) {
				setErrors(fields);
			} else {
				setError(
					errorMessage(caught) ??
						__('Could not save. Try again.', 'creo-rombooking')
				);
			}
			setBusy(false);
			return false;
		}
	};

	return { busy, errors, error, run, setErrors, setError };
}
