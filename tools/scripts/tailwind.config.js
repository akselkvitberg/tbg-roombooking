module.exports = {
	darkMode: 'class',
	theme: {
		extend: {
			screens: {
				'3xl': '1920px',
				'4xl': '2560px',
			},
			borderRadius: {
				DEFAULT: '4px', // TODO: Convert to variable and make configurable.
			},
			colors: {
				slate: {
					// These colors are used mostly by dark mode, but they
					// are slightly too bluish. So we adjust them here.
					600: '#4d596b',
					700: '#323d4a',
					800: '#232a36',
					900: '#1b202b',
					950: '#13161f',
				},
			},
			typography: () => ({
				DEFAULT: {
					css: {
						maxWidth: 'none',
					},
				},
			}),
		},
	},
	corePlugins: {
		container: false,
	},
	plugins: [require('@tailwindcss/typography'), require('@tailwindcss/forms')],
};
