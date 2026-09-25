import { z } from "zod";

/**
 * Socket.IO contract between the cube (Arduino Yún), the API and the dashboard.
 *
 * Device namespace `/device` — auth: `auth.token` or `Authorization: Bearer <device key>`.
 *   device → api : "telemetry"   TelemetryInput
 *   device → api : "command:ack" CommandAckInput
 *   api → device : "command"     DeviceCommandMessage (WATER / LAMP)
 *   api → device : "state"       DeviceStateMessage, on every connection: the cube re-applies it after a reboot
 *
 * Dashboard namespace `/dashboard` — auth: `auth.token` = user access token (JWT).
 *   api → dashboard : "telemetry"      TelemetryEvent
 *   api → dashboard : "device:status"  DeviceStatusEvent
 *   api → dashboard : "command:update" Command
 *   api → dashboard : "devices:changed" (a cube was created, renamed or deleted: refetch the list)
 *   api → dashboard : "schedules:changed" SchedulesChangedEvent (a cube's watering schedules changed or ran)
 */
export const SOCKET_NAMESPACES = { device: "/device", dashboard: "/dashboard" } as const;

export const SENSOR_KEYS = ["temperature", "soilMoisture", "light", "waterLevel"] as const;
export type SensorKey = (typeof SENSOR_KEYS)[number];

/** A sensor may be absent (unplugged / read error): send null or omit it. */
const zSensor = (min: number, max: number) => z.number().min(min).max(max).nullish();

export const TelemetrySchema = z.object({
	/** °C */
	temperature: zSensor(-40, 85),
	/** Soil moisture, % (0 = dry, 100 = soaked) */
	soilMoisture: zSensor(0, 100),
	/** Light, % of sensor range */
	light: zSensor(0, 100),
	/** Reservoir level, % (computed from the ultrasonic distance) */
	waterLevel: zSensor(0, 100),
	/** Optional measurement time (ISO). Defaults to reception time on the API. */
	recordedAt: z.iso.datetime().optional()
});
export type TelemetryInput = z.infer<typeof TelemetrySchema>;

export interface SensorReading {
	recordedAt: string;
	temperature: number | null;
	soilMoisture: number | null;
	light: number | null;
	waterLevel: number | null;
}

export interface TelemetryEvent {
	deviceId: string;
	reading: SensorReading;
}

export interface DeviceStatusEvent {
	deviceId: string;
	online: boolean;
	lastSeenAt: string | null;
}

/** UNINITIALIZED until the cube has sent its first telemetry frame. */
export type DeviceState = "UNINITIALIZED" | "ACTIVE";

export interface Device {
	id: string;
	name: string;
	/** When the cube was registered (ISO). */
	createdAt: string;
	state: DeviceState;
	initializedAt: string | null;
	online: boolean;
	lastSeenAt: string | null;
	/** Grow lamp state, as last confirmed by the cube. */
	lampOn: boolean;
	/** LED strip colour, as last confirmed by the cube. */
	lampColor: LampColor;
	latestReading: SensorReading | null;
}

export const DeviceNameSchema = z.object({
	name: z.string().trim().min(1, "Nom requis").max(40, "40 caractères max.")
});
export type DeviceNameDto = z.infer<typeof DeviceNameSchema>;

/** Returned once, at creation: the key is stored hashed and can never be read again. */
export interface CreatedDevice {
	device: Device;
	key: string;
}

export const READING_RANGES = ["1h", "24h", "7d"] as const;
export type ReadingRange = (typeof READING_RANGES)[number];
export const ReadingsQuerySchema = z.object({ range: z.enum(READING_RANGES).default("1h") });
export type ReadingsQuery = z.infer<typeof ReadingsQuerySchema>;

export type CommandType = "WATER" | "LAMP";
export type CommandStatus = "PENDING" | "SENT" | "DONE" | "FAILED";

export interface Command {
	id: string;
	deviceId: string;
	type: CommandType;
	/** WATER only: pump run time. */
	durationMs: number | null;
	/** LAMP only: requested lamp state. */
	lampOn: boolean | null;
	/** LAMP only: requested strip colour. */
	lampColor: LampColor | null;
	/** Fired by this watering schedule; null for a manual order. */
	scheduleId: string | null;
	status: CommandStatus;
	error: string | null;
	createdAt: string;
	completedAt: string | null;
}

export const WATER_DURATION = { min: 1000, max: 15000, default: 3000 } as const;
export const WaterCommandSchema = z.object({
	durationMs: z.number().int().min(WATER_DURATION.min).max(WATER_DURATION.max).default(WATER_DURATION.default)
});
export type WaterCommandDto = z.infer<typeof WaterCommandSchema>;

// ---- watering schedules -------------------------------------------------------

export const SCHEDULE_RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ScheduleRecurrence = (typeof SCHEDULE_RECURRENCES)[number];

/** Day of the month is capped at 28 so a monthly schedule runs every month. */
export const MAX_DAY_OF_MONTH = 28;

export const WateringScheduleSchema = z
	.object({
		/** "HH:MM", in the API's scheduler time zone. */
		time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide"),
		durationMs: z.number().int().min(WATER_DURATION.min).max(WATER_DURATION.max),
		recurrence: z.enum(SCHEDULE_RECURRENCES),
		/** WEEKLY: 0 = Sunday … 6 = Saturday. */
		weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
		/** MONTHLY: 1-28. */
		dayOfMonth: z.number().int().min(1).max(MAX_DAY_OF_MONTH).nullish(),
		enabled: z.boolean().default(true)
	})
	.superRefine((s, ctx) => {
		if (s.recurrence === "WEEKLY" && s.weekdays.length === 0)
			ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Choisissez au moins un jour" });
		if (s.recurrence === "MONTHLY" && !s.dayOfMonth)
			ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Choisissez un jour du mois" });
	});
export type WateringScheduleDto = z.input<typeof WateringScheduleSchema>;
export type WateringScheduleInput = z.output<typeof WateringScheduleSchema>;

export interface WateringSchedule {
	id: string;
	deviceId: string;
	time: string;
	durationMs: number;
	recurrence: ScheduleRecurrence;
	weekdays: number[];
	dayOfMonth: number | null;
	enabled: boolean;
	/** Next planned run (ISO), null when disabled. */
	nextRunAt: string | null;
	lastRunAt: string | null;
	createdAt: string;
}

export interface SchedulesChangedEvent {
	deviceId: string;
}

/**
 * Colours the cube's LED strip can show. `rgb` (hex, no #) is sent to the cube as is: it is also the
 * swatch shown in the dashboard.
 */
export const LAMP_COLORS = {
	GROW: { label: "Magenta", rgb: "ff00a0" },
	WHITE: { label: "Blanc", rgb: "ffffff" },
	RED: { label: "Rouge", rgb: "ff0000" },
	ORANGE: { label: "Orange", rgb: "ff6000" },
	YELLOW: { label: "Jaune", rgb: "ffd000" },
	GREEN: { label: "Vert", rgb: "00ff00" },
	CYAN: { label: "Cyan", rgb: "00ffff" },
	BLUE: { label: "Bleu", rgb: "0000ff" },
	PURPLE: { label: "Violet", rgb: "8000ff" },
	PINK: { label: "Rose", rgb: "ff1493" }
} as const;
export type LampColor = keyof typeof LAMP_COLORS;
export const LAMP_COLOR_KEYS = Object.keys(LAMP_COLORS) as [LampColor, ...LampColor[]];
export const DEFAULT_LAMP_COLOR: LampColor = "GROW";

/** Stored as text in the database: an unknown value falls back to the default colour. */
export const toLampColor = (value: string | null | undefined): LampColor =>
	value && value in LAMP_COLORS ? (value as LampColor) : DEFAULT_LAMP_COLOR;

/** `color` omitted: keep the cube's current colour. */
export const LampCommandSchema = z.object({ on: z.boolean(), color: z.enum(LAMP_COLOR_KEYS).optional() });
export type LampCommandDto = z.infer<typeof LampCommandSchema>;

/**
 * Sent to the device, which replies with "command:ack" once done:
 * - WATER: run the pump for `durationMs`;
 * - LAMP: switch the grow lamp on / off, in `rgb` (hex colour of `color`).
 */
export type DeviceCommandMessage =
	| { id: string; type: "WATER"; durationMs: number }
	| { id: string; type: "LAMP"; on: boolean; color: LampColor; rgb: string };

/** Actuator state saved by the API, pushed to the cube when it connects. */
export interface DeviceStateMessage {
	lampOn: boolean;
	lampColor: LampColor;
	rgb: string;
}

export const CommandAckSchema = z.object({
	id: z.string().min(1),
	status: z.enum(["DONE", "FAILED"]),
	error: z.string().max(200).optional()
});
export type CommandAckInput = z.infer<typeof CommandAckSchema>;

/**
 * Comfort ranges for the plant. Outside [warnLow, warnHigh] → warning, outside [critLow, critHigh] → critical.
 */
export const SENSOR_THRESHOLDS: Record<
	SensorKey,
	{ critLow: number; warnLow: number; warnHigh: number; critHigh: number }
> = {
	temperature: { critLow: 10, warnLow: 16, warnHigh: 28, critHigh: 35 },
	soilMoisture: { critLow: 15, warnLow: 30, warnHigh: 80, critHigh: 95 },
	light: { critLow: -1, warnLow: 20, warnHigh: 101, critHigh: 101 },
	waterLevel: { critLow: 10, warnLow: 25, warnHigh: 101, critHigh: 101 }
};

export type SensorStatus = "ok" | "warning" | "critical" | "unknown";

export function sensorStatus(key: SensorKey, value: number | null | undefined): SensorStatus {
	if (value === null || value === undefined) return "unknown";
	const t = SENSOR_THRESHOLDS[key];
	if (value < t.critLow || value > t.critHigh) return "critical";
	if (value < t.warnLow || value > t.warnHigh) return "warning";
	return "ok";
}
