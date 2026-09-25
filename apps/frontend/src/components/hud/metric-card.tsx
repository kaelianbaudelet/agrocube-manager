import { type SensorKey, type SensorReading, type SensorStatus, sensorStatus } from "@repo/shared";
import { ArcGauge, TankGauge } from "./gauges";
import { HudPanel } from "./panel";
import { formatValue, SENSORS, StatusChip } from "./sensors";

/** Indeterminate bar standing in for the value while the cube is unreachable. */
function SignalLoader() {
	return (
		<span
			role="status"
			aria-label="Signal perdu"
			className="block h-[clamp(0.95rem,2.6vh,1.35rem)] w-16 py-[0.4em] lg:h-[clamp(1.1rem,4.2vh,2.6rem)] lg:w-20"
		>
			<span className="relative block h-full overflow-hidden bg-muted-fg/15">
				<span
					className="absolute inset-y-0 left-0 w-1/3 bg-muted-fg/60"
					style={{ animation: "hud-loading 1.2s ease-in-out infinite" }}
				/>
			</span>
		</span>
	);
}

interface MetricCardProps {
	sensor: SensorKey;
	reading: SensorReading | null;
	/** Link to the cube lost: hide the last collected value instead of passing it off as current. */
	offline?: boolean;
}

/**
 * Recolours the whole card (border, corners, title, background glow all derive from --hud) to match
 * its status chip.
 */
const STATUS_TINT: Partial<Record<SensorStatus, string>> = {
	warning: "[--hud:var(--warn)]",
	critical: "[--hud:var(--crit)]"
};

export function MetricCard({ sensor, reading, offline = false }: MetricCardProps) {
	const meta = SENSORS[sensor];
	const value = offline ? null : reading?.[sensor];
	const status = sensorStatus(sensor, value);
	const Gauge = sensor === "waterLevel" ? TankGauge : ArcGauge;

	return (
		<HudPanel
			title={meta.label}
			className={
				offline ? "flex-1 *:opacity-60 *:grayscale max-sm:h-40" : `flex-1 max-sm:h-40 ${STATUS_TINT[status] ?? ""}`
			}
			bodyClassName="flex items-center gap-2 lg:gap-3"
		>
			<div className="flex h-full max-h-32 min-w-0 flex-1 items-center justify-center">
				<Gauge meta={meta} value={value} status={status} />
			</div>
			<div className="flex min-w-0 flex-col items-start gap-1">
				{offline ? (
					<SignalLoader />
				) : (
					<p className="font-display text-[clamp(0.95rem,2.6vh,1.35rem)] text-fg lg:text-[clamp(1.1rem,4.2vh,2.6rem)] leading-none hud-glow">
						{formatValue(meta, value)}
						<span className="ml-0.5 text-[0.45em] text-muted-fg">{meta.unit}</span>
					</p>
				)}
				{offline ? <StatusChip status="unknown" label="Signal perdu" /> : <StatusChip status={status} />}
			</div>
		</HudPanel>
	);
}
