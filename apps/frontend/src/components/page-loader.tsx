import { HudRings } from "./hud/hud-rings";

/**
 * Global loading screen (route transitions, initial data).
 */
export function PageLoader({ label = "INITIALISATION D'UNE CONNEXION" }: { label?: string }) {
	return (
		<div
			role="status"
			aria-live="polite"
			className="hud fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 overflow-hidden"
		>
			<HudRings className="size-28" />
			<p className="font-data text-hud text-xs leading-none tracking-[0.4em] hud-glow">{label}</p>
		</div>
	);
}
