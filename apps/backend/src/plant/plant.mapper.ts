import { type Command, type Device, type SensorReading, toLampColor, type WateringSchedule } from "@repo/shared";
import type {
	Command as PrismaCommand,
	Device as PrismaDevice,
	SensorReading as PrismaSensorReading,
	WateringSchedule as PrismaWateringSchedule
} from "../../generated/prisma/client";

export const toReading = (r: PrismaSensorReading): SensorReading => ({
	recordedAt: r.recordedAt.toISOString(),
	temperature: r.temperature,
	soilMoisture: r.soilMoisture,
	light: r.light,
	waterLevel: r.waterLevel
});

export const toCommand = (c: PrismaCommand): Command => ({
	id: c.id,
	deviceId: c.deviceId,
	type: c.type,
	durationMs: c.durationMs,
	lampOn: c.lampOn,
	lampColor: c.lampColor === null ? null : toLampColor(c.lampColor),
	scheduleId: c.scheduleId,
	status: c.status,
	error: c.error,
	createdAt: c.createdAt.toISOString(),
	completedAt: c.completedAt?.toISOString() ?? null
});

/** `online` is live socket state, not stored: the caller (controller) fills it in. */
export const toDevice = (d: PrismaDevice, latest: PrismaSensorReading | null): Omit<Device, "online"> => ({
	id: d.id,
	name: d.name,
	createdAt: d.createdAt.toISOString(),
	state: d.state,
	initializedAt: d.initializedAt?.toISOString() ?? null,
	lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
	lampOn: d.lampOn,
	lampColor: toLampColor(d.lampColor),
	latestReading: latest ? toReading(latest) : null
});

/** `nextRunAt` lives in the job scheduler (Redis), not in the database. */
export const toSchedule = (s: PrismaWateringSchedule, nextRunAt: number | null): WateringSchedule => ({
	id: s.id,
	deviceId: s.deviceId,
	time: s.time,
	durationMs: s.durationMs,
	recurrence: s.recurrence,
	weekdays: s.weekdays,
	dayOfMonth: s.dayOfMonth,
	enabled: s.enabled,
	nextRunAt: nextRunAt ? new Date(nextRunAt).toISOString() : null,
	lastRunAt: s.lastRunAt?.toISOString() ?? null,
	createdAt: s.createdAt.toISOString()
});
