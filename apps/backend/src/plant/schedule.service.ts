import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WateringScheduleInput } from "@repo/shared";
import type { Queue } from "bullmq";
import type { WateringSchedule as PrismaWateringSchedule } from "../../generated/prisma/client";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { DashboardGateway } from "./dashboard.gateway";
import { DeviceGateway } from "./device.gateway";
import { toSchedule } from "./plant.mapper";
import { PlantService } from "./plant.service";

export const WATERING_QUEUE = "watering";

export interface WateringJobData {
	scheduleId: string;
}

const schedulerId = (scheduleId: string) => `schedule:${scheduleId}`;

/** "08:30" + recurrence → cron pattern (minute hour day-of-month month day-of-week). */
export function cronPattern(s: Pick<PrismaWateringSchedule, "time" | "recurrence" | "weekdays" | "dayOfMonth">) {
	const [hour, minute] = s.time.split(":").map(Number);
	switch (s.recurrence) {
		case "DAILY":
			return `${minute} ${hour} * * *`;
		case "WEEKLY":
			return `${minute} ${hour} * * ${[...s.weekdays].sort((a, b) => a - b).join(",")}`;
		case "MONTHLY":
			return `${minute} ${hour} ${s.dayOfMonth} * *`;
	}
}

/**
 * Watering schedules: stored in Postgres, fired by BullMQ job schedulers (Redis), one per enabled schedule.
 * Postgres is the source of truth: the job schedulers are re-synced from it on boot.
 */
@Injectable()
export class ScheduleService implements OnApplicationBootstrap {
	private readonly logger = new Logger(ScheduleService.name);

	constructor(
		@InjectQueue(WATERING_QUEUE) private readonly queue: Queue<WateringJobData>,
		private readonly prisma: PrismaService,
		private readonly config: ConfigService<Env, true>,
		private readonly plant: PlantService,
		private readonly devices: DeviceGateway,
		private readonly dashboard: DashboardGateway
	) {}

	async onApplicationBootstrap() {
		try {
			const schedules = await this.prisma.wateringSchedule.findMany();
			const wanted = new Set(schedules.filter((s) => s.enabled).map((s) => schedulerId(s.id)));
			for (const s of schedules) await this.sync(s);
			for (const existing of await this.queue.getJobSchedulers()) {
				if (existing.key && !wanted.has(existing.key)) await this.queue.removeJobScheduler(existing.key);
			}
			this.logger.log(`${wanted.size} programmation(s) d'arrosage active(s)`);
		} catch (error) {
			this.logger.error(
				"Synchronisation des programmations impossible (Redis ?)",
				error instanceof Error ? error.stack : error
			);
		}
	}

	async list(deviceId: string) {
		await this.plant.assertDevice(deviceId);
		const schedules = await this.prisma.wateringSchedule.findMany({
			where: { deviceId },
			orderBy: [{ time: "asc" }, { createdAt: "asc" }]
		});
		return Promise.all(schedules.map((s) => this.present(s)));
	}

	async create(deviceId: string, input: WateringScheduleInput, userId: string) {
		await this.plant.assertDevice(deviceId);
		const schedule = await this.prisma.wateringSchedule.create({
			data: { deviceId, createdBy: userId, ...this.normalize(input) }
		});
		await this.sync(schedule);
		this.dashboard.emitSchedulesChanged(deviceId);
		return this.present(schedule);
	}

	async update(deviceId: string, id: string, input: WateringScheduleInput) {
		await this.assertSchedule(deviceId, id);
		const schedule = await this.prisma.wateringSchedule.update({ where: { id }, data: this.normalize(input) });
		await this.sync(schedule);
		this.dashboard.emitSchedulesChanged(deviceId);
		return this.present(schedule);
	}

	async remove(deviceId: string, id: string) {
		await this.assertSchedule(deviceId, id);
		await this.queue.removeJobScheduler(schedulerId(id));
		await this.prisma.wateringSchedule.delete({ where: { id } });
		this.dashboard.emitSchedulesChanged(deviceId);
	}

	/** Before the cube is deleted: the rows cascade, the job schedulers must go too. */
	async removeForDevice(deviceId: string) {
		const schedules = await this.prisma.wateringSchedule.findMany({ where: { deviceId }, select: { id: true } });
		for (const s of schedules) await this.queue.removeJobScheduler(schedulerId(s.id));
	}

	/**
	 * Called by the worker when a schedule fires. An order that cannot be sent is still logged, as FAILED.
	 */
	async run(scheduleId: string) {
		const schedule = await this.prisma.wateringSchedule.findUnique({ where: { id: scheduleId } });
		if (!schedule?.enabled) return;
		await this.prisma.wateringSchedule.update({ where: { id: scheduleId }, data: { lastRunAt: new Date() } });

		const { deviceId, durationMs } = schedule;
		const origin = { scheduleId };
		let failed: string | undefined;
		if (!this.devices.isOnline(deviceId)) failed = "Cube hors ligne";
		else if (await this.plant.findActiveCommand(deviceId, "WATER")) failed = "Arrosage déjà en cours";

		const command = await this.plant.createWaterCommand(deviceId, durationMs, origin, failed);
		if (!failed) this.devices.sendCommand(command);
		this.dashboard.emitCommand(command);
		this.dashboard.emitSchedulesChanged(deviceId);
		this.logger.log(`Arrosage programmé ${scheduleId} : ${failed ?? "envoyé"}`);
	}

	private normalize(input: WateringScheduleInput) {
		return {
			time: input.time,
			durationMs: input.durationMs,
			recurrence: input.recurrence,
			weekdays: input.recurrence === "WEEKLY" ? [...new Set(input.weekdays)].sort((a, b) => a - b) : [],
			dayOfMonth: input.recurrence === "MONTHLY" ? (input.dayOfMonth ?? null) : null,
			enabled: input.enabled
		};
	}

	private async sync(schedule: PrismaWateringSchedule) {
		const id = schedulerId(schedule.id);
		if (!schedule.enabled) {
			await this.queue.removeJobScheduler(id);
			return;
		}
		await this.queue.upsertJobScheduler(
			id,
			{ pattern: cronPattern(schedule), tz: this.config.get("SCHEDULER_TZ", { infer: true }) },
			{ name: "water", data: { scheduleId: schedule.id }, opts: { removeOnComplete: 100, removeOnFail: 100 } }
		);
	}

	private async present(schedule: PrismaWateringSchedule) {
		const next = schedule.enabled ? await this.queue.getJobScheduler(schedulerId(schedule.id)) : undefined;
		return toSchedule(schedule, next?.next ?? null);
	}

	private async assertSchedule(deviceId: string, id: string) {
		const schedule = await this.prisma.wateringSchedule.findFirst({ where: { id, deviceId } });
		if (!schedule) throw new NotFoundException("Programmation introuvable");
		return schedule;
	}
}
