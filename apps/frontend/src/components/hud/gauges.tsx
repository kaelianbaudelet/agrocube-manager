import type { SensorStatus } from "@repo/shared";
import { type SensorMeta, STATUS_COLOR } from "./sensors";

const START = 135;
const SWEEP = 270;
const R = 46;
const C = 60;

const polar = (deg: number, r = R) => {
	const rad = (deg * Math.PI) / 180;
	return [C + r * Math.cos(rad), C + r * Math.sin(rad)] as const;
};

function arcPath(from: number, to: number, r = R) {
	const [x1, y1] = polar(from, r);
	const [x2, y2] = polar(to, r);
	return `M${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

interface GaugeProps {
	meta: SensorMeta;
	value: number | null | undefined;
	status: SensorStatus;
}

/**
 * 270° radial gauge: value arc in the status colour, tick ring and a fixed inner half ring.
 */
export function ArcGauge({ meta, value, status }: GaugeProps) {
	const toDeg = (v: number) =>
		START + ((Math.min(meta.max, Math.max(meta.min, v)) - meta.min) / (meta.max - meta.min)) * SWEEP;
	const color = STATUS_COLOR[status];
	const end = value === null || value === undefined ? START : toDeg(value);

	return (
		<svg
			viewBox="0 0 120 120"
			className="h-full max-h-full w-auto max-w-full"
			role="img"
			aria-label={`${meta.label} ${value ?? "inconnue"} ${meta.unit}`}
		>
			{Array.from({ length: 28 }, (_, i) => {
				const deg = START + (i / 27) * SWEEP;
				const [x1, y1] = polar(deg, 56);
				const [x2, y2] = polar(deg, i % 3 === 0 ? 51 : 53);
				return (
					<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--hud)" strokeOpacity={0.35} strokeWidth={1} />
				);
			})}
			<path d={arcPath(START, START + SWEEP)} stroke="var(--hud)" strokeOpacity={0.12} strokeWidth={7} fill="none" />
			{/* Inner half ring (top half), the same on every gauge. */}
			<path d={arcPath(180, 360, 38)} stroke="var(--hud)" strokeOpacity={0.35} strokeWidth={2} fill="none" />
			{end > START && (
				<path
					d={arcPath(START, end)}
					stroke={color}
					strokeWidth={7}
					fill="none"
					style={{ filter: `drop-shadow(0 0 4px ${color})` }}
				/>
			)}
			{end > START && (
				<circle cx={polar(end)[0]} cy={polar(end)[1]} r={3.2} fill="var(--bg)" stroke={color} strokeWidth={1.5} />
			)}
			<text
				x={C}
				y={C + 5}
				textAnchor="middle"
				className="font-display"
				fontSize={13}
				fill="var(--hud)"
				letterSpacing={2}
			>
				{meta.short}
			</text>
			<text x={C} y={108} textAnchor="middle" fontSize={7} fill="var(--muted-fg)" letterSpacing={1}>
				{`${meta.min}–${meta.max}`}
			</text>
		</svg>
	);
}

/**
 * Segmented vertical level, like a fuel gauge. Used for the reservoir.
 */
export function TankGauge({ meta, value, status }: GaugeProps) {
	const segments = 16;
	const lit = value === null || value === undefined ? 0 : Math.round((value / meta.max) * segments);
	const color = STATUS_COLOR[status];
	return (
		// biome-ignore lint/a11y/useSemanticElements: <meter> cannot render segmented children
		<div
			role="meter"
			aria-label={meta.label}
			aria-valuemin={meta.min}
			aria-valuemax={meta.max}
			aria-valuenow={value ?? undefined}
			className="flex h-full w-full max-w-14 flex-col-reverse gap-[2px] border border-hud/25 p-[3px]"
		>
			{Array.from({ length: segments }, (_, i) => (
				<div
					key={i}
					className="min-h-0 flex-1 transition-colors duration-500"
					style={
						i < lit
							? { background: color, boxShadow: `0 0 6px color-mix(in oklab, ${color} 60%, transparent)` }
							: { background: "color-mix(in oklab, var(--hud) 8%, transparent)" }
					}
				/>
			))}
		</div>
	);
}
