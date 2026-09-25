import { type SensorReading, sensorStatus } from "@repo/shared";
import { type CriticalIssue, criticalIssues, StatusIcon } from "./sensors";

interface PlantCubeProps {
	reading: SensorReading | null;
	online: boolean;
	pumping: boolean;
	/** Grow lamp switched on: the lamp bar glows whatever the light sensor reads. */
	lampOn?: boolean;
	/** No telemetry ever received from this cube. */
	uninitialized?: boolean;
}

const TANK = { x: 176, y: 128, w: 36, h: 116 };
const LEAF = "M0 0C8-10 26-10 34 0C26 6 8 6 0 0Z";
/** Leaf nodes along the stem: [x, y, side, base angle]. */
const LEAVES: [number, number, 1 | -1, number][] = [
	[118, 198, 1, -22],
	[118, 198, -1, -22],
	[119, 178, 1, -30],
	[119, 178, -1, -26],
	[118, 158, 1, -38],
	[118, 158, -1, -40]
];

const DROOP = { ok: 0, warning: 22, critical: 45, unknown: 10 } as const;

function SensorLabel({
	x,
	y,
	anchor = "start",
	children
}: {
	x: number;
	y: number;
	anchor?: "start" | "end";
	children: string;
}) {
	return (
		<text x={x} y={y} textAnchor={anchor} fontSize={8.5} fill="var(--hud)" letterSpacing={0.6}>
			{/* "\n" splits the label over several lines. */}
			{children
				.toUpperCase()
				.split("\n")
				.map((line, i) => (
					<tspan key={line} x={x} dy={i ? 9.5 : 0}>
						{line}
					</tspan>
				))}
		</text>
	);
}

function SensorDot({ x, y, label }: { x: number; y: number; label?: string }) {
	return (
		<g>
			<circle cx={x} cy={y} r={6} fill="none" stroke="var(--hud)" strokeOpacity={0.5} className="hud-pulse" />
			<circle cx={x} cy={y} r={2.5} fill="var(--hud)" />
			{label && (
				<SensorLabel x={x + 9} y={y + 2.5}>
					{label}
				</SensorLabel>
			)}
		</g>
	);
}

const BANNER_TONE = {
	warn: { border: "border-warn/30", text: "text-warn" },
	crit: { border: "border-crit/30", text: "text-crit" }
} as const;

/** Full-width strip over the cube for states where the drawing shows no live data. */
function CubeBanner({ tone, title, subtitle }: { tone: keyof typeof BANNER_TONE; title: string; subtitle: string }) {
	return (
		<div
			className={`absolute inset-x-0 top-1/2 -translate-y-1/2 space-y-1 border-y bg-bg/85 py-2 text-center backdrop-blur-sm ${BANNER_TONE[tone].border}`}
		>
			<p className={`hud-pulse font-display text-sm tracking-[0.3em] hud-glow ${BANNER_TONE[tone].text}`}>{title}</p>
			<p className="text-[10px] text-muted-fg tracking-widest">{subtitle}</p>
		</div>
	);
}

/** Critical sensors, what is wrong and how to fix it. Pinned to the bottom so the plant stays visible. */
function CriticalBanner({ issues }: { issues: CriticalIssue[] }) {
	return (
		<div
			role="alert"
			className="absolute inset-x-1 bottom-1 border border-crit/50 bg-bg/90 px-2.5 py-1.5 backdrop-blur-sm"
		>
			<p className="hud-pulse flex items-center gap-1.5 font-display text-[10px] text-crit tracking-[0.25em]">
				<StatusIcon status="critical" />
				{issues.length > 1 ? `${issues.length} ÉLÉMENTS CRITIQUES` : "ÉLÉMENT CRITIQUE"}
			</p>
			<ul className="mt-1 space-y-0.5">
				{issues.map(({ sensor, fix }) => (
					<li key={sensor.key} className="text-[11px] text-fg leading-snug">
						{fix}
					</li>
				))}
			</ul>
		</div>
	);
}

/** Whichever banner applies: no data yet, signal lost, or the sensors in critical range. */
function CubeOverlay({ reading, online, uninitialized }: Pick<PlantCubeProps, "reading" | "online" | "uninitialized">) {
	if (uninitialized)
		return <CubeBanner tone="warn" title="NON INITIALISÉ" subtitle="EN ATTENTE DE LA PREMIÈRE TRAME" />;
	if (!online) return <CubeBanner tone="crit" title="SIGNAL PERDU" subtitle="LIAISON AVEC LE CUBE INTERROMPUE" />;
	const issues = criticalIssues(reading);
	return issues.length > 0 ? <CriticalBanner issues={issues} /> : null;
}

/**
 * Isometric glass cube with the plant, lamp, soil tray, reservoir and pump, driven by live telemetry.
 */
export function PlantCube({ reading, online, pumping, lampOn, uninitialized }: PlantCubeProps) {
	const light = reading?.light ?? 0;
	const soil = reading?.soilMoisture ?? 50;
	const level = reading?.waterLevel ?? 0;
	const droop = DROOP[sensorStatus("soilMoisture", reading?.soilMoisture)];
	const dryness = Math.max(0, Math.min(1, (45 - soil) / 35));
	const waterTop = TANK.y + TANK.h - (Math.max(0, Math.min(100, level)) / 100) * (TANK.h - 4);

	return (
		<div className="relative flex h-full w-full items-center justify-center">
			<svg
				viewBox="0 0 320 290"
				className="h-full max-h-full w-full"
				role="img"
				aria-label={`Cube : lumière ${light.toFixed(0)} %, sol ${soil.toFixed(0)} %, réservoir ${level.toFixed(0)} %${pumping ? ", arrosage en cours" : ""}`}
				style={{ filter: online && !uninitialized ? undefined : "grayscale(1) brightness(0.6)" }}
			>
				<defs>
					<linearGradient id="cube-cone" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor="var(--hud)" stopOpacity={0.9} />
						<stop offset="1" stopColor="var(--hud)" stopOpacity={0} />
					</linearGradient>
					<linearGradient id="cube-scan" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor="var(--hud)" stopOpacity={0} />
						<stop offset="1" stopColor="var(--hud)" stopOpacity={0.55} />
					</linearGradient>
					<radialGradient id="cube-base">
						<stop offset="0" stopColor="var(--hud)" stopOpacity={0.35} />
						<stop offset="1" stopColor="var(--hud)" stopOpacity={0} />
					</radialGradient>
					<clipPath id="cube-front">
						<rect x={60} y={70} width={160} height={180} />
					</clipPath>
					<clipPath id="cube-tank">
						<rect x={TANK.x + 2} y={TANK.y + 2} width={TANK.w - 4} height={TANK.h - 4} rx={2} />
					</clipPath>
				</defs>

				{/* Holo base */}
				<ellipse cx={165} cy={262} rx={130} ry={18} fill="url(#cube-base)" />

				{/* Back edges */}
				<g stroke="var(--hud)" strokeOpacity={0.25} strokeDasharray="3 4" fill="none">
					<path d="M110 32V212H270M110 212L60 250" />
				</g>

				{/* Glass faces */}
				<path d="M60 70L110 32H270L220 70Z" fill="var(--hud)" fillOpacity={0.07} />
				<path d="M220 70L270 32V212L220 250Z" fill="var(--hud)" fillOpacity={0.04} />

				{/* Lamp and light cone */}
				<path d="M78 84H202L216 214H64Z" fill="url(#cube-cone)" opacity={0.04 + (light / 100) * 0.4} />
				<rect
					x={72}
					y={76}
					width={136}
					height={6}
					rx={2}
					fill="var(--hud)"
					opacity={lampOn ? 1 : 0.25 + (light / 100) * 0.75}
					style={{ filter: lampOn || light > 5 ? "drop-shadow(0 0 6px var(--hud))" : undefined }}
				/>

				{/* Soil tray */}
				<rect
					x={66}
					y={214}
					width={104}
					height={30}
					fill="var(--hud)"
					fillOpacity={0.06}
					stroke="var(--hud)"
					strokeOpacity={0.4}
				/>
				<path
					d="M67 218q8-4 16 0t16 0 16 0 16 0 16 0 16 0 6 0V243H67Z"
					style={{
						fill: `color-mix(in oklab, oklch(0.55 0.08 70) ${dryness * 100}%, oklch(0.32 0.06 45))`,
						transition: "fill 1s ease"
					}}
				/>

				{/* Plant */}
				<g
					style={{
						transformOrigin: "118px 214px",
						transformBox: "view-box",
						animation: "hud-sway 6s ease-in-out infinite"
					}}
				>
					<path
						d="M118 216C115 192 122 170 118 140"
						stroke="var(--ok)"
						strokeWidth={3}
						fill="none"
						strokeLinecap="round"
					/>
					{LEAVES.map(([x, y, side, angle], i) => (
						<g
							key={i}
							transform={`translate(${x} ${y}) scale(${side} 1) rotate(${angle + droop})`}
							style={{ transition: "transform 1.2s ease" }}
						>
							<path
								d={LEAF}
								style={{
									fill: `color-mix(in oklab, var(--warn) ${dryness * 70}%, var(--ok))`,
									fillOpacity: 0.85,
									filter: "drop-shadow(0 0 3px color-mix(in oklab, var(--ok) 60%, transparent))"
								}}
							/>
							<path d="M2 0H30" stroke="var(--bg)" strokeOpacity={0.5} strokeWidth={0.8} />
						</g>
					))}
					<circle cx={118} cy={138} r={4} fill="var(--ok)" />
				</g>

				{/* Soil probe */}
				<path d="M150 200V236" stroke="var(--hud)" strokeWidth={1.5} />
				<SensorDot x={150} y={200} />
				<SensorLabel x={146} y={235} anchor="end">
					Humidité
				</SensorLabel>

				{/* Pump pipe, animated while pumping */}
				<path
					d="M186 234V112H92V198"
					fill="none"
					stroke="var(--hud)"
					strokeOpacity={0.3}
					strokeWidth={3}
					strokeLinejoin="round"
				/>
				{pumping && (
					<>
						<path
							d="M186 234V112H92V198"
							fill="none"
							stroke="var(--hud)"
							strokeWidth={3}
							strokeDasharray="6 6"
							strokeLinejoin="round"
							style={{ animation: "hud-flow 0.5s linear infinite", filter: "drop-shadow(0 0 4px var(--hud))" }}
						/>
						{[0, 0.25, 0.5].map((delay) => (
							<circle
								key={delay}
								cx={92}
								cy={202}
								r={1.8}
								fill="var(--hud)"
								style={{ animation: `hud-drip 0.75s ${delay}s ease-in infinite` }}
							/>
						))}
					</>
				)}
				<rect x={88} y={196} width={8} height={4} fill="var(--hud)" />

				{/* Reservoir */}
				<g clipPath="url(#cube-tank)">
					{/* Opacity on the group: the waves overlap the water without looking lighter or darker. */}
					<g fill="var(--hud)" opacity={0.35}>
						<rect x={TANK.x} y={waterTop + 2} width={TANK.w} height={TANK.h} style={{ transition: "y 1s ease" }} />
						{/* Troughs touch the water top (waterTop + 2): the waves sit on the surface, not inside it. */}
						<g style={{ transform: `translateY(${waterTop}px)`, transition: "transform 1s ease" }}>
							<path
								d={`M${TANK.x} 0q4.5-4 9 0t9 0 9 0 9 0 9 0 9 0 9 0 9 0V6H${TANK.x}Z`}
								style={{ animation: "hud-wave 2s linear infinite", transformBox: "fill-box" }}
							/>
						</g>
					</g>
				</g>
				<rect
					x={TANK.x}
					y={TANK.y}
					width={TANK.w}
					height={TANK.h}
					rx={3}
					fill="none"
					stroke="var(--hud)"
					strokeOpacity={0.7}
				/>
				{[0.25, 0.5, 0.75].map((f) => (
					<path
						key={f}
						d={`M${TANK.x + TANK.w - 6} ${TANK.y + TANK.h * f}h6`}
						stroke="var(--hud)"
						strokeOpacity={0.6}
					/>
				))}
				<rect x={180} y={232} width={12} height={8} fill="var(--hud)" fillOpacity={pumping ? 1 : 0.5} />

				{/* Ultrasonic sensor */}
				<rect x={183} y={121} width={22} height={4} rx={1} fill="none" stroke="var(--hud)" />
				<SensorDot x={216} y={123} label={"Niveau\nd'eau"} />

				<SensorDot x={74} y={104} label="Température" />
				<SensorDot x={196} y={92} label="Lumière" />

				{/* Scan line */}
				<g clipPath="url(#cube-front)">
					<rect
						x={60}
						y={50}
						width={160}
						height={20}
						fill="url(#cube-scan)"
						style={{ animation: "hud-scan-y 5s linear infinite" }}
					/>
				</g>

				{/* Front edges */}
				<g stroke="var(--hud)" strokeWidth={1.5} fill="none" style={{ filter: "drop-shadow(0 0 3px var(--hud))" }}>
					<path d="M60 70H220V250H60Z" />
					<path d="M60 70L110 32H270L220 70" />
					<path d="M220 250L270 212V32" />
				</g>
			</svg>

			<CubeOverlay reading={reading} online={online} uninitialized={uninitialized} />
		</div>
	);
}
