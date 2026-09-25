import type { ReadingRange, SensorKey, SensorReading } from "@repo/shared";
import { type PointerEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { comfortZone, formatValue, SENSORS } from "./sensors";

const RANGE_MS: Record<ReadingRange, number> = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000 };
/** A hole longer than this fraction of the range (device offline) breaks the line. */
const GAP_FRACTION = 0.1;
const PAD = { top: 6, right: 8, bottom: 16, left: 26 };

function useSize<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	useLayoutEffect(() => {
		if (!ref.current) return;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			setSize({ width, height });
		});
		observer.observe(ref.current);
		return () => observer.disconnect();
	}, []);
	return [ref, size] as const;
}

const formatTime = (t: number, range: ReadingRange) =>
	new Date(t).toLocaleString(
		"fr-FR",
		range === "7d" ? { weekday: "short", hour: "2-digit" } : { hour: "2-digit", minute: "2-digit" }
	);

interface TelemetryChartProps {
	sensor: SensorKey;
	range: ReadingRange;
	readings: SensorReading[];
	/** Latest live frame, appended when newer than the (bucketed) history. */
	live: SensorReading | null;
	now: number;
}

export function TelemetryChart({ sensor, range, readings, live, now }: TelemetryChartProps) {
	const meta = SENSORS[sensor];
	const [ref, { width, height }] = useSize<HTMLDivElement>();
	const [hover, setHover] = useState<number | null>(null);

	const points = useMemo(() => {
		const all = [...readings];
		if (live && (!all.length || live.recordedAt > all[all.length - 1].recordedAt)) all.push(live);
		const from = now - RANGE_MS[range];
		return all
			.map((r) => ({ t: new Date(r.recordedAt).getTime(), v: r[sensor] }))
			.filter((p): p is { t: number; v: number } => p.v !== null && p.t >= from);
	}, [readings, live, sensor, range, now]);

	const innerW = Math.max(0, width - PAD.left - PAD.right);
	const innerH = Math.max(0, height - PAD.top - PAD.bottom);
	const from = now - RANGE_MS[range];
	const x = (t: number) => PAD.left + ((t - from) / RANGE_MS[range]) * innerW;
	const y = (v: number) => PAD.top + (1 - (v - meta.min) / (meta.max - meta.min)) * innerH;

	// Split into segments on gaps, so an offline period is not drawn as a straight line.
	const segments = useMemo(() => {
		const maxGap = RANGE_MS[range] * GAP_FRACTION;
		const out: { t: number; v: number }[][] = [];
		for (const p of points) {
			const current = out[out.length - 1];
			if (!current || p.t - current[current.length - 1].t > maxGap) out.push([p]);
			else current.push(p);
		}
		return out;
	}, [points, range]);

	const zone = comfortZone(meta);
	const ticks = [meta.min, meta.min + (meta.max - meta.min) / 2, meta.max];
	const xTicks = [from, from + RANGE_MS[range] / 2, now];
	const hovered = hover !== null ? points[hover] : null;

	function onPointerMove(e: PointerEvent<HTMLDivElement>) {
		if (!points.length) return;
		const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
		const t = from + ((px - PAD.left) / innerW) * RANGE_MS[range];
		let best = 0;
		for (let i = 1; i < points.length; i++) {
			if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
		}
		setHover(best);
	}

	return (
		<div
			ref={ref}
			className="relative h-full w-full touch-none select-none"
			onPointerMove={onPointerMove}
			onPointerDown={onPointerMove}
			onPointerLeave={() => setHover(null)}
		>
			{width > 0 && height > 0 && (
				<svg
					width={width}
					height={height}
					className="absolute inset-0"
					role="img"
					aria-label={`Historique ${meta.label}`}
				>
					<defs>
						<linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor="var(--hud)" stopOpacity={0.35} />
							<stop offset="1" stopColor="var(--hud)" stopOpacity={0} />
						</linearGradient>
					</defs>

					{/* Comfort zone */}
					<rect
						x={PAD.left}
						y={y(zone.high)}
						width={innerW}
						height={Math.max(0, y(zone.low) - y(zone.high))}
						fill="var(--ok)"
						fillOpacity={0.06}
					/>
					{ticks.map((v) => (
						<g key={v}>
							<line x1={PAD.left} x2={PAD.left + innerW} y1={y(v)} y2={y(v)} stroke="var(--hud)" strokeOpacity={0.1} />
							<text x={PAD.left - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted-fg)">
								{v}
							</text>
						</g>
					))}
					{xTicks.map((t, i) => (
						<text
							key={t}
							x={x(t)}
							y={height - 3}
							textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
							fontSize={9}
							fill="var(--muted-fg)"
						>
							{i === 2 ? "MAINTENANT" : formatTime(t, range)}
						</text>
					))}

					{segments.map((seg) => {
						const line = seg.map((p, i) => `${i ? "L" : "M"}${x(p.t)} ${y(p.v)}`).join("");
						const area = `${line}L${x(seg[seg.length - 1].t)} ${PAD.top + innerH}L${x(seg[0].t)} ${PAD.top + innerH}Z`;
						if (seg.length === 1)
							return <circle key={seg[0].t} cx={x(seg[0].t)} cy={y(seg[0].v)} r={2} fill="var(--hud)" />;
						return (
							<g key={seg[0].t}>
								<path d={area} fill="url(#chart-area)" />
								<path
									d={line}
									fill="none"
									stroke="var(--hud)"
									strokeWidth={2}
									strokeLinejoin="round"
									style={{ filter: "drop-shadow(0 0 3px var(--hud))" }}
								/>
							</g>
						);
					})}

					{points.length > 0 && !hovered && (
						<circle
							cx={x(points[points.length - 1].t)}
							cy={y(points[points.length - 1].v)}
							r={4}
							fill="var(--hud)"
							className="hud-pulse"
						/>
					)}

					{hovered && (
						<g>
							<line
								x1={x(hovered.t)}
								x2={x(hovered.t)}
								y1={PAD.top}
								y2={PAD.top + innerH}
								stroke="var(--hud)"
								strokeOpacity={0.6}
								strokeDasharray="2 3"
							/>
							<circle
								cx={x(hovered.t)}
								cy={y(hovered.v)}
								r={4.5}
								fill="var(--bg)"
								stroke="var(--hud)"
								strokeWidth={2}
							/>
						</g>
					)}
				</svg>
			)}

			{hovered && (
				<div
					className="pointer-events-none absolute top-1 border border-hud/40 bg-bg/90 px-2 py-1 text-[11px] leading-tight"
					style={x(hovered.t) > width / 2 ? { right: width - x(hovered.t) + 8 } : { left: x(hovered.t) + 8 }}
				>
					<p className="font-display text-fg">
						{formatValue(meta, hovered.v)}
						<span className="text-muted-fg"> {meta.unit}</span>
					</p>
					<p className="text-muted-fg">
						{new Date(hovered.t).toLocaleString("fr-FR", {
							weekday: range === "7d" ? "short" : undefined,
							hour: "2-digit",
							minute: "2-digit",
							second: range === "1h" ? "2-digit" : undefined
						})}
					</p>
				</div>
			)}

			{width > 0 && points.length === 0 && (
				<p className="absolute inset-0 flex items-center justify-center text-muted-fg text-xs uppercase tracking-widest">
					Aucune donnée sur la période
				</p>
			)}
		</div>
	);
}
