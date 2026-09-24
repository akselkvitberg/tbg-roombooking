import { __ } from '@wordpress/i18n';

import type { RequestItem } from '../../api/adminTypes';
import Icon from '../Icon';

export default function KindTag({ item }: { item: RequestItem }) {
	if (item.kind === 'conflict') {
		return (
			<span className="creo-rombooking-tag is-conflict">
				<Icon name="warning" size={14} />
				{__('Conflict', 'creo-rombooking')}
			</span>
		);
	}
	if (item.kind === 'series') {
		return (
			<span className="creo-rombooking-tag is-info">
				<Icon name="repeat" size={14} />
				{__('Series', 'creo-rombooking')}
			</span>
		);
	}
	return (
		<span className="creo-rombooking-tag is-outside">
			<Icon name="clock" size={14} />
			{__('To approve', 'creo-rombooking')}
		</span>
	);
}
