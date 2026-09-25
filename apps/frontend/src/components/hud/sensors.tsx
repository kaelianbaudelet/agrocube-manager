import {
	SENSOR_KEYS,
	SENSOR_THRESHOLDS,
	type SensorKey,
	type SensorReading,
	type SensorStatus,
	sensorStatus
} from "@repo/shared";
import { twMerge } from "tailwind-merge";

export interface SensorMeta {
	key: SensorKey;
	label: string;
	short: string;
	code: string;
	unit: string;
	/** Fixed scale for gauges and charts, so the comfort zone never moves. */
	min: number;
	max: number;
	decimals: number;
}

export const SENSORS: Record<SensorKey, SensorMeta> = {
	temperature: {
		key: "temperature",
		label: "Température",
		short: "TEMP",
		code: "SNS-01",
		unit: "°C",
		min: 0,
		max: 40,
		decimals: 1
	},
	soilMoisture: {
		key: "soilMoisture",
		label: "Humidité du sol",
		short: "H. SOL",
		code: "SNS-02",
		unit: "%",
		min: 0,
		max: 100,
		decimals: 0
	},
	light: { key: "light", label: "Luminosité", short: "LUM", code: "SNS-03", unit: "%", min: 0, max: 100, decimals: 0 },
	waterLevel: {
		key: "waterLevel",
		label: "Réservoir",
		short: "EAU",
		code: "SNS-04",
		unit: "%",
		min: 0,
		max: 100,
		decimals: 0
	}
};

/** Comfort zone clamped to the display scale (thresholds use ±1 sentinels for "no limit"). */
export function comfortZone(meta: SensorMeta) {
	const t = SENSOR_THRESHOLDS[meta.key];
	return { low: Math.max(meta.min, t.warnLow), high: Math.min(meta.max, t.warnHigh) };
}

export const formatValue = (meta: SensorMeta, value: number | null | undefined) =>
	value === null || value === undefined ? "--" : value.toFixed(meta.decimals);

/** What is wrong and what to do, when a sensor is out of its critical range (`v` = value with unit). */
const CRITICAL_FIX: Record<SensorKey, { low: (v: string) => string; high: (v: string) => string }> = {
	temperature: {
		low: (v) => `Il fait trop froid (${v}), rapprochez le cube d'une source de chaleur et éloignez-le des fenêtres.`,
		high: (v) => `Il fait trop chaud (${v}), placez le cube à l'ombre et aérez la pièce.`
	},
	soilMoisture: {
		low: (v) => `Le sol est trop sec (${v}), arrosez la plante.`,
		high: (v) => `Le sol est détrempé (${v}), arrêtez l'arrosage et vérifiez que l'eau s'écoule.`
	},
	light: {
		low: (v) => `La plante manque de lumière (${v}), allumez la lampe ou rapprochez le cube d'une fenêtre.`,
		high: (v) => `La plante reçoit trop de lumière (${v}), éteignez la lampe ou éloignez le cube du soleil direct.`
	},
	waterLevel: {
		low: (v) => `Le réservoir est presque vide (${v}), remplissez-le d'eau.`,
		high: (v) => `Le réservoir est trop plein (${v}), retirez un peu d'eau.`
	}
};

export interface CriticalIssue {
	sensor: SensorMeta;
	value: number;
	fix: string;
}

/** Sensors currently in the critical range, with the fix to apply. */
export function criticalIssues(reading: SensorReading | null): CriticalIssue[] {
	if (!reading) return [];
	return SENSOR_KEYS.flatMap((key) => {
		const value = reading[key];
		if (value === null || sensorStatus(key, value) !== "critical") return [];
		const side = value < SENSOR_THRESHOLDS[key].critLow ? "low" : "high";
		const meta = SENSORS[key];
		return [{ sensor: meta, value, fix: CRITICAL_FIX[key][side](`${formatValue(meta, value)} ${meta.unit}`) }];
	});
}

export const STATUS_COLOR: Record<SensorStatus, string> = {
	ok: "var(--ok)",
	warning: "var(--warn)",
	critical: "var(--crit)",
	unknown: "var(--muted-fg)"
};

const STATUS_LABEL: Record<SensorStatus, string> = {
	ok: "Normal",
	warning: "Attention",
	critical: "Critique",
	unknown: "Aucune donnée"
};

const STATUS_RANK: Record<SensorStatus, number> = { unknown: 0, ok: 1, warning: 2, critical: 3 };

export const worstStatus = (statuses: SensorStatus[]) =>
	statuses.reduce<SensorStatus>((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), "unknown");

const STATUS_ICON: Record<SensorStatus, React.ReactNode> = {
	ok: <path d="M3 8.5l3 3 7-7" />,
	warning: <path d="M8 2l6.5 12h-13zM8 7v3M8 12v.01" />,
	critical: <path d="M5.2 1.5h5.6l3.7 3.7v5.6l-3.7 3.7H5.2l-3.7-3.7V5.2zM6 6l4 4M10 6l-4 4" />,
	unknown: <circle cx="8" cy="8" r="6" strokeDasharray="2 2" />
};

/** Decorative: always paired with a text label, so status is never conveyed by colour alone. */
export function StatusIcon({ status, className }: { status: SensorStatus; className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			className={twMerge("size-3 shrink-0", className)}
			aria-hidden
		>
			{STATUS_ICON[status]}
		</svg>
	);
}

export function StatusChip({ status, label, className }: { status: SensorStatus; label?: string; className?: string }) {
	return (
		<span
			className={twMerge(
				"inline-flex items-center gap-1 border px-1.5 py-px text-[10px] uppercase tracking-widest",
				className
			)}
			style={{
				color: STATUS_COLOR[status],
				borderColor: `color-mix(in oklab, ${STATUS_COLOR[status]} 45%, transparent)`,
				background: `color-mix(in oklab, ${STATUS_COLOR[status]} 10%, transparent)`
			}}
		>
			<StatusIcon status={status} />
			{label ?? STATUS_LABEL[status]}
		</span>
	);
}
