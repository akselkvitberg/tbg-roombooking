// eslint-disable-next-line import/named
import { BlockConfiguration, registerBlockType } from '@wordpress/blocks';
import { __ } from '@wordpress/i18n';

import './editor.pcss';

import metadata from '../blocks/app/block.json';

const settings: Partial<BlockConfiguration> = {
	title: __('Room booking', 'creo-rombooking'),
	description: __(
		'Room booking for members, with requests and conflict handling for administrators.',
		'creo-rombooking'
	),
	edit() {
		return (
			<div className="creo-rombooking-editor-placeholder">
				<strong>{__('Room booking', 'creo-rombooking')}</strong>
				<p>
					{__(
						'The booking calendar is shown here for logged-in members.',
						'creo-rombooking'
					)}
				</p>
			</div>
		);
	},
	save() {
		return null;
	},
};

registerBlockType(metadata.name, settings as BlockConfiguration);
