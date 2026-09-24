const { omit, camelCase } = require('lodash');
const LiveReloadPlugin = require('webpack-livereload-plugin');

const defaultConfig = require('@wordpress/scripts/config/webpack.config.js');

const isDev = process.env.NODE_ENV !== 'production';

/**
 * @typedef Options
 * @property {import('webpack').EntryObject} entry          The entrypoints to build.
 * @property {number?}                       liveReloadPort The port to use for live reloading.
 */

/**
 * @param {Options} options
 */
module.exports = ({ entry, liveReloadPort }) => ({
	...omit(defaultConfig, ['entry']),
	entry,
	externals: {
		...defaultConfig.externals,
		'@wordpress/customize': 'wp.customize',
	},
	plugins: [
		...defaultConfig.plugins,
		isDev && liveReloadPort && new LiveReloadPlugin({ port: liveReloadPort }),
	].filter(Boolean),
	optimization: {
		...defaultConfig.optimization,
		splitChunks: {
			...defaultConfig.optimization.splitChunks,
			// Set a custom delimiter to avoid isses where
			// the server cannot unzip or serve files correctly.
			automaticNameDelimiter: '-',
			cacheGroups: {
				// Omit the default `style` group.
				...omit(defaultConfig.optimization.splitChunks.cacheGroups, ['style']),
				// We want to extract CSS based on the entrypoints instead.
				...Object.keys(entry).reduce((entries, name) => {
					entries[`${camelCase(name)}Styles`] = {
						name,
						enforce: true,
						type: 'css/mini-extract',
						chunks: (chunk) => chunk.name === name,
					};
					return entries;
				}, {}),
			},
		},
	},
});
