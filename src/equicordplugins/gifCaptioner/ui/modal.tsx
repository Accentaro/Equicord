import { Button } from "@components/Button";
import { React, useCallback, useMemo, useState } from "@webpack/common";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps as VencordModalProps, ModalRoot, ModalSize } from "@utils/modal";
import { BaseText } from "@components/BaseText";
import type { OnSubmit } from "../render/gifRenderer";
import Captioner from "./captioner";
import type { GifTransform } from "../render/gifRenderer";
import { clearStatus, showCreating } from "./statusCard";

interface ModalProps extends VencordModalProps {
	width: number;
	element: HTMLElement;
	onSubmit: OnSubmit;
	onConfirm?: (transform?: GifTransform) => void;
}

export default function Modal({ width, element, onSubmit, onConfirm, ...modalProps }: ModalProps) {
	const [submitCallback, setSubmitCallback] = useState<(() => GifTransform) | null>(null);

	// Clone element to avoid DOM manipulation conflicts
	const captionElement = useMemo(() => {
		const cloned = element.cloneNode(true) as HTMLElement;
		if (cloned instanceof HTMLImageElement && element instanceof HTMLImageElement) {
			cloned.src = element.src;
		} else if (cloned instanceof HTMLVideoElement && element instanceof HTMLVideoElement) {
			cloned.src = element.src;
		}
		return cloned;
	}, [element]);

	const handleApply = () => {
		showCreating();
		const result = submitCallback?.();
		if (result) {
			onConfirm?.(result);
		} else {
			clearStatus();
		}
		modalProps.onClose();
	};

	return (
		<ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
			<ModalHeader separator={false} className="gc-modal-header">
				<BaseText
					size="lg"
					weight="semibold"
					color="text-strong"
					tag="h1"
					className="gc-modal-title"
				>
					Edit GIF
				</BaseText>
				<ModalCloseButton onClick={modalProps.onClose} />
			</ModalHeader>
			<ModalContent className="gc-modal">
				<Captioner width={width} element={captionElement} onSubmit={useCallback((cb) => {
					setSubmitCallback(() => cb);
				}, [])} />
			</ModalContent>
			<ModalFooter>
				<Button variant="secondary" onClick={modalProps.onClose}>Cancel</Button>
				<Button onClick={handleApply}>Apply</Button>
			</ModalFooter>
		</ModalRoot>
	);
}
