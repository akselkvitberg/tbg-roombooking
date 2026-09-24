const defaultConfig = require('@wordpress/scripts/config/jest-unit.config');

const ignore = ['<rootDir>/vendor-theme/', '<rootDir>/vendor/', '<rootDir>/.tmp/'];

module.exports = {
	...defaultConfig,
	modulePathIgnorePatterns: ignore,
	testPathIgnorePatterns: [
		...(defaultConfig.testPathIgnorePatterns ?? []),
		...ignore,
		'<rootDir>/tests/e2e/',
	],
};
