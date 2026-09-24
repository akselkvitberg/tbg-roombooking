import { useEffect, useState } from '@wordpress/element';

import { previewBooking } from '../api/client';
import type { BookingInput, Preview } from '../api/types';

/**
 * Asks the server which dates are free, in conflict or outside opening
 * hours, shortly after the form stops changing.
 *
 * @param form    The form.
 * @param enabled Whether to ask; false while the form has errors of its own.
 */
export default function usePreview(form: BookingInput, enabled: boolean) {
	const [preview, setPreview] = useState<Preview | null>(null);
	const [loading, setLoading] = useState(false);
	const key = JSON.stringify({ ...form, purpose: '', people: 0, phone: '' });

	useEffect(() => {
		if (!enabled) {
			setPreview(null);
			return;
		}

		const controller = new AbortController();
		setLoading(true);

		const timer = setTimeout(() => {
			// The purpose, number of people and phone number do not affect the preview.
			previewBooking(
				{ ...form, purpose: '', people: 0, phone: '' },
				controller.signal
			)
				.then(setPreview)
				.catch(() => {
					// Aborted, or the connection failed; submitting shows the error.
				})
				.finally(() => {
					if (!controller.signal.aborted) {
						setLoading(false);
					}
				});
		}, 250);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
		// The key covers the form fields that matter.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, enabled]);

	return { preview, loading };
}
