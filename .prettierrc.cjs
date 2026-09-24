/** @typedef {import('prettier').Config} PrettierConfig */
/** @typedef {import('@wordpress/prettier-config').WPPrettierOptions} WPPrettierOptions */

const defaultConfig = require('@wordpress/prettier-config');

/** @type {PrettierConfig & WPPrettierOptions} */
const config = {
	...defaultConfig,
	tabWidth: 2,
	parenSpacing: false,
};

module.exports = config;
