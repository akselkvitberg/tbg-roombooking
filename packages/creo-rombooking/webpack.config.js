const createConfig = require('@creo-wp/scripts/webpack.config.js');

module.exports = createConfig({
	entry: {
		creoRombookingEditor: './src/editor.tsx',
		creoRombookingPublic: './src/public.tsx',
	},
});
