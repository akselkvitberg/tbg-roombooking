const baseConfig = require('@creo-wp/scripts/tailwind.config.js');

/**
 * Colors from the creo theme's palette (theme.json). The values come from the
 * theme at runtime through its CSS custom properties.
 */
const paletteSlugs = [
	'dark-green',
	'dark-green-80',
	'dark-green-60',
	'light-green',
	'light-green-80',
	'light-green-60',
	'black',
	'black-80',
	'warm-gray',
	'warm-gray-80',
	'warm-gray-60',
	'warm-gray-40',
	'warm-gray-20',
	'warm-gray-10',
	'sand',
	'sand-80',
	'sand-60',
	'sand-40',
	'rust',
	'rust-80',
	'rust-60',
	'rust-40',
	'glacier',
	'glacier-80',
	'glacier-60',
	'glacier-40',
];

module.exports = {
	content: ['./src/**/*.{ts,tsx}', './includes/**/*.php'],
	...baseConfig,
	// The theme already includes Tailwind's base styles.
	corePlugins: {
		...baseConfig.corePlugins,
		preflight: false,
	},
	theme: {
		...baseConfig.theme,
		extend: {
			...baseConfig.theme.extend,
			colors: {
				...baseConfig.theme.extend.colors,
				...Object.fromEntries(
					paletteSlugs.map((slug) => [
						slug,
						`var(--wp--preset--color--${slug})`,
					])
				),
			},
		},
	},
};
