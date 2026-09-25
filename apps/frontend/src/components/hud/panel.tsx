import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface HudPanelProps {
	title: string;
	/** Extra controls on the right of the header. */
	actions?: ReactNode;
	className?: string;
	/** e.g. hide the title visually on narrow screens when the actions need the room. */
	titleClassName?: string;
	bodyClassName?: string;
	children: ReactNode;
}

export function HudPanel({ title, actions, className, titleClassName, bodyClassName, children }: HudPanelProps) {
	return (
		<section className={twMerge("hud-panel hud-boot flex min-h-0 min-w-0 flex-col", className)}>
			<header className="flex shrink-0 items-center gap-2 border-hud/15 border-b px-2.5 py-1">
				<span className="size-1.5 rotate-45 bg-hud" aria-hidden />
				<h2
					className={twMerge("truncate font-display text-[10px] text-hud uppercase tracking-[0.2em]", titleClassName)}
				>
					{title}
				</h2>
				{actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
			</header>
			<div className={twMerge("relative min-h-0 flex-1 p-2", bodyClassName)}>{children}</div>
		</section>
	);
}
