import { twMerge } from "tailwind-merge";

/**
 * Concentric counter-rotating rings — the HUD "reactor" used by the loader and the auth screens.
 */
export function HudRings({ className }: { className?: string }) {
	const spin = (seconds: number, reverse = false) => ({
		transformOrigin: "50px 50px",
		animation: `hud-spin ${seconds}s linear infinite${reverse ? " reverse" : ""}`
	});
	return (
		<svg viewBox="0 0 100 100" className={twMerge("size-28 text-hud", className)} fill="none" aria-hidden>
			<circle
				cx={50}
				cy={50}
				r={47}
				stroke="currentColor"
				strokeOpacity={0.35}
				strokeDasharray="1 5"
				style={spin(20)}
			/>
			<g style={spin(1.6, true)}>
				<path d="M50 9a41 41 0 0141 41" stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" />
				<path d="M50 91a41 41 0 01-41-41" stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" />
			</g>
			<circle cx={50} cy={50} r={33} stroke="currentColor" strokeOpacity={0.2} strokeWidth={6} />
			<circle
				cx={50}
				cy={50}
				r={33}
				stroke="currentColor"
				strokeWidth={6}
				strokeDasharray="6 14"
				strokeOpacity={0.7}
				style={spin(4)}
			/>
			<circle
				cx={50}
				cy={50}
				r={22}
				stroke="currentColor"
				strokeOpacity={0.5}
				style={spin(3, true)}
				strokeDasharray="30 8"
			/>
			<path
				d="M50 40l10 10-10 10-10-10z"
				fill="currentColor"
				className="hud-pulse"
				style={{ filter: "drop-shadow(0 0 6px currentColor)" }}
			/>
		</svg>
	);
}
