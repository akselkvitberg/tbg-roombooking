import { useEffect, useRef, useState } from '@wordpress/element';

/**
 * Measures the width of an element, so that the layout follows the space
 * the theme gives the app rather than the size of the window.
 */
export default function useElementWidth<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState<number | null>(null);

	useEffect(() => {
		const element = ref.current;
		if (!element) {
			return;
		}
		setWidth(element.getBoundingClientRect().width);
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width)
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return [ref, width] as const;
}
