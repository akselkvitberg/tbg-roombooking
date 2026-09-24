import { __ } from '@wordpress/i18n';

import type { Status } from '../../api/types';
import Icon from '../Icon';

import { statusIcons } from './SegmentButton';
import { statusLabel } from './statusText';

const statuses: Status[] = ['free', 'busy', 'requested', 'closed', 'mine'];

export default function Legend() {
	return (
		<ul
			className="creo-rombooking-legend"
			aria-label={__('Legend', 'creo-rombooking')}
		>
			{statuses.map((status) => (
				<li key={status}>
					<span className={`creo-rombooking-swatch is-${status}`}>
						<Icon name={statusIcons[status]} size={16} />
					</span>
					{statusLabel(status)}
				</li>
			))}
		</ul>
	);
}
