const isProd = process.env.NODE_ENV === 'production';

module.exports = {
	ident: 'postcss',
	sourceMap: !isProd,
	plugins: {
		'postcss-import': {},
		'tailwindcss/nesting': 'postcss-nesting',
		tailwindcss: {},
		'postcss-preset-env': {
			stage: 1,
			features: { 'nesting-rules': false },
		},
		cssnano: isProd
			? {
					preset: [
						'default',
						{
							normalizeCharset: {
								add: true,
							},
							discardComments: {
								removeAll: true,
							},
						},
					],
			  }
			: false,
	},
};
