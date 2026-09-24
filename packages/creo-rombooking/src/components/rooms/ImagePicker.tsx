import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import Icon from '../Icon';

interface MediaFrame {
	on: (event: string, callback: () => void) => void;
	open: () => void;
	state: () => {
		get: (name: string) => {
			first: () => {
				toJSON: () => {
					id: number;
					url: string;
					sizes?: Record<string, { url: string }>;
				};
			};
		};
	};
}

declare global {
	interface Window {
		wp?: {
			media?: (options: object) => MediaFrame;
		};
	}
}

interface Props {
	imageId: number;
	imageUrl: string | null;
	roomName: string;
	onChange: (imageId: number, imageUrl: string | null) => void;
}

/**
 * Chooses the room's image from the WordPress media library.
 *
 * @param props The component props.
 */
export default function ImagePicker(props: Props) {
	const { imageId, imageUrl, roomName, onChange } = props;
	const [unavailable, setUnavailable] = useState(false);

	const choose = () => {
		if (!window.wp?.media) {
			setUnavailable(true);
			return;
		}
		const frame = window.wp.media({
			title: __('Choose an image of the room', 'creo-rombooking'),
			button: { text: __('Use the image', 'creo-rombooking') },
			library: { type: 'image' },
			multiple: false,
		});
		frame.on('select', () => {
			const image = frame.state().get('selection').first().toJSON();
			onChange(image.id, image.sizes?.medium?.url ?? image.url);
		});
		frame.open();
	};

	return (
		<div className="creo-rombooking-field">
			<span className="creo-rombooking-label" id="creo-rombooking-room-image">
				{__('Image', 'creo-rombooking')}
			</span>
			<div
				className="creo-rombooking-image-picker"
				role="group"
				aria-labelledby="creo-rombooking-room-image"
			>
				{imageId && imageUrl ? (
					<img src={imageUrl} alt={roomName} />
				) : (
					<div className="creo-rombooking-image-empty" aria-hidden="true">
						<Icon name="image" size={28} />
					</div>
				)}
				<div className="creo-rombooking-actions">
					<button
						type="button"
						className="creo-rombooking-button is-secondary"
						onClick={choose}
					>
						{imageId
							? __('Change the image', 'creo-rombooking')
							: __('Choose an image', 'creo-rombooking')}
					</button>
					{imageId > 0 && (
						<button
							type="button"
							className="creo-rombooking-button is-secondary"
							onClick={() => onChange(0, null)}
						>
							{__('Remove the image', 'creo-rombooking')}
						</button>
					)}
				</div>
			</div>
			{unavailable && (
				<p className="creo-rombooking-error" role="alert">
					{__('The media library could not be opened.', 'creo-rombooking')}
				</p>
			)}
		</div>
	);
}
