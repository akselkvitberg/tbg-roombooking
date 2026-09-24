import domReady from '@wordpress/dom-ready';
import { createRoot } from '@wordpress/element';

import './style.pcss';

import App from './app/App';
import { getSettings } from './settings';

domReady(() => {
	const root = document.getElementById('creo-rombooking-root');

	if (root) {
		createRoot(root).render(<App settings={getSettings()} />);
	}
});
