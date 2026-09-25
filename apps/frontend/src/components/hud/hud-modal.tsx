import type { ReactNode } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { twMerge } from "tailwind-merge";

interface HudModalProps {
	title: string;
	code?: string;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	/** Blocks closing (Escape, outside click, ✕) while an operation is running. */
	isLocked?: boolean;
	className?: string;
	children: ReactNode;
}

export function HudModal({ title, code, isOpen, onOpenChange, isLocked, className, children }: HudModalProps) {
	return (
		<ModalOverlay
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			isDismissable={!isLocked}
			isKeyboardDismissDisabled={isLocked}
			className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-bg/70 p-4 backdrop-blur-sm entering:fade-in entering:animate-in exiting:fade-out exiting:animate-out"
		>
			<Modal className={twMerge("hud-panel hud-boot w-full max-w-lg bg-bg/95 outline-none", className)}>
				<Dialog className="flex max-h-[calc(100dvh-2rem)] flex-col outline-none">
					<header className="flex shrink-0 items-center gap-2 border-hud/15 border-b px-3 py-2">
						<span className="size-1.5 rotate-45 bg-hud" aria-hidden />
						<Heading slot="title" className="font-display text-hud text-xs uppercase tracking-[0.2em]">
							{title}
						</Heading>
						{code && <span className="text-[9px] text-muted-fg tracking-widest">{code}</span>}
						<Button
							slot={null}
							aria-label="Fermer"
							onPress={() => onOpenChange(false)}
							isDisabled={isLocked}
							className="ml-auto flex size-6 cursor-pointer items-center justify-center text-muted-fg outline-none hover:text-fg focus-visible:ring-1 focus-visible:ring-hud disabled:opacity-40"
						>
							<svg
								viewBox="0 0 16 16"
								className="size-3.5"
								fill="none"
								stroke="currentColor"
								strokeWidth={1.8}
								aria-hidden
							>
								<path d="M4 4l8 8M12 4l-8 8" />
							</svg>
						</Button>
					</header>
					<div className="min-h-0 overflow-y-auto p-4">{children}</div>
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
