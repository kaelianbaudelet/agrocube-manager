import { Injectable, NotFoundException } from "@nestjs/common";
import {
	type CommandAckInput,
	type CommandType,
	type LampColor,
	type ReadingRange,
	type SensorReading,
	type TelemetryInput,
	toLampColor
} from "@repo/shared";
import { hashToken } from "../auth/token.util";
import { PrismaService } from "../prisma/prisma.service";
import { generateDeviceKey } from "./device-key";
import { toCommand, toDevice, toReading } from "./plant.mapper";

/**
 * Charts get ~120 points whatever the range: readings are averaged per bucket.
 */
const RANGES: Record<ReadingRange, { ms: number; bucketSec: number }> = {
	"1h": { ms: 3_600_000, bucketSec: 30 },
	"24h": { ms: 86_400_000, bucketSec: 720 },
	"7d": { ms: 604_800_000, bucketSec: 5040 },
	"30d": { ms: 2_592_000_000, bucketSec: 21600 }
};

/** Readings with a recordedAt further in the past are rejected (bad RTC, replays). */
const MAX_BACKDATE_MS = 7 * 86_400_000;

@Injectable()
export class PlantService {
	constructor(private readonly prisma: PrismaService) {}

	findDeviceByKey(key: string) {
		return this.prisma.device.findUnique({ where: { apiKeyHash: hashToken(key) } });
	}

	async listDevices() {
		const devices = await this.prisma.device.findMany({
			orderBy: { createdAt: "asc" },
			include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } }
		});
		return devices.map((d) => toDevice(d, d.readings[0] ?? null));
	}

	async createDevice(name: string) {
		const { key, hash } = generateDeviceKey();
		const device = await this.prisma.device.create({ data: { name, apiKeyHash: hash } });
		return { device: toDevice(device, null), key };
	}

	async renameDevice(id: string, name: string) {
		await this.assertDevice(id);
		const device = await this.prisma.device.update({
			where: { id },
			data: { name },
			include: { readings: { orderBy: { recordedAt: "desc" }, take: 1 } }
		});
		return toDevice(device, device.readings[0] ?? null);
	}

	/** Readings and commands go with it (cascade). */
	async deleteDevice(id: string) {
		await this.assertDevice(id);
		await this.prisma.device.delete({ where: { id } });
	}

	async assertDevice(id: string) {
		const device = await this.prisma.device.findUnique({ where: { id } });
		if (!device) throw new NotFoundException("Cube introuvable");
		return device;
	}

	async getReadings(deviceId: string, range: ReadingRange): Promise<SensorReading[]> {
		await this.assertDevice(deviceId);
		const { ms, bucketSec } = RANGES[range];
		const since = new Date(Date.now() - ms);
		const rows = await this.prisma.$queryRaw<
			{
				bucket: Date;
				temperature: number | null;
				soilMoisture: number | null;
				light: number | null;
				waterLevel: number | null;
			}[]
		>`
			SELECT to_timestamp(floor(extract(epoch FROM "recordedAt") / ${bucketSec}) * ${bucketSec}) AS bucket,
				avg("temperature")::float8 AS "temperature",
				avg("soilMoisture")::float8 AS "soilMoisture",
				avg("light")::float8 AS "light",
				avg("waterLevel")::float8 AS "waterLevel"
			FROM "SensorReading"
			WHERE "deviceId" = ${deviceId} AND "recordedAt" >= ${since}
			GROUP BY 1
			ORDER BY 1`;
		return rows.map((r) => ({
			recordedAt: r.bucket.toISOString(),
			temperature: r.temperature,
			soilMoisture: r.soilMoisture,
			light: r.light,
			waterLevel: r.waterLevel
		}));
	}

	async saveTelemetry(deviceId: string, input: TelemetryInput): Promise<SensorReading> {
		const now = Date.now();
		const at = input.recordedAt ? new Date(input.recordedAt).getTime() : now;
		const recordedAt = new Date(at > now || now - at > MAX_BACKDATE_MS ? now : at);
		const [reading] = await this.prisma.$transaction([
			this.prisma.sensorReading.create({
				data: {
					deviceId,
					recordedAt,
					temperature: input.temperature ?? null,
					soilMoisture: input.soilMoisture ?? null,
					light: input.light ?? null,
					waterLevel: input.waterLevel ?? null
				}
			}),
			this.prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date(now) } }),
			// The first frame ever received initializes the cube.
			this.prisma.device.updateMany({
				where: { id: deviceId, state: "UNINITIALIZED" },
				data: { state: "ACTIVE", initializedAt: new Date(now) }
			})
		]);
		return toReading(reading);
	}

	/** Returns null when the cube no longer exists (deleted while connected). */
	async touchDevice(deviceId: string) {
		const lastSeenAt = new Date();
		const { count } = await this.prisma.device.updateMany({ where: { id: deviceId }, data: { lastSeenAt } });
		return count ? lastSeenAt.toISOString() : null;
	}

	async listCommands(deviceId: string, take = 50) {
		await this.assertDevice(deviceId);
		const commands = await this.prisma.command.findMany({
			where: { deviceId },
			orderBy: { createdAt: "desc" },
			take
		});
		return commands.map(toCommand);
	}

	async getCommand(id: string) {
		const command = await this.prisma.command.findUnique({ where: { id } });
		return command ? toCommand(command) : null;
	}

	/** An order of this type is in progress if it was sent and has not completed yet. */
	findActiveCommand(deviceId: string, type: CommandType) {
		return this.prisma.command.findFirst({ where: { deviceId, type, status: { in: ["PENDING", "SENT"] } } });
	}

	/**
	 * `failed` records an order that could not be sent (e.g. a schedule fired while the cube was offline),
	 * so it still shows up in the log.
	 */
	async createWaterCommand(
		deviceId: string,
		durationMs: number,
		origin: { userId?: string; scheduleId?: string },
		failed?: string
	) {
		const command = await this.prisma.command.create({
			data: {
				deviceId,
				type: "WATER",
				durationMs,
				requestedBy: origin.userId ?? null,
				scheduleId: origin.scheduleId ?? null,
				...(failed ? { status: "FAILED", error: failed, completedAt: new Date() } : { status: "SENT" })
			}
		});
		return toCommand(command);
	}

	/** `lampColor` omitted: the cube keeps its current colour. */
	async createLampCommand(deviceId: string, lampOn: boolean, lampColor: LampColor | undefined, userId: string) {
		const color =
			lampColor ??
			toLampColor(
				(await this.prisma.device.findUnique({ where: { id: deviceId }, select: { lampColor: true } }))?.lampColor
			);
		const command = await this.prisma.command.create({
			data: { deviceId, type: "LAMP", lampOn, lampColor: color, status: "SENT", requestedBy: userId }
		});
		return toCommand(command);
	}

	/**
	 * Returns null when the command is unknown, belongs to another device, or is already completed.
	 * A confirmed LAMP order becomes the cube's lamp state.
	 */
	async completeCommand(deviceId: string, ack: CommandAckInput) {
		const { count } = await this.prisma.command.updateMany({
			where: { id: ack.id, deviceId, status: { in: ["PENDING", "SENT"] } },
			data: { status: ack.status, error: ack.error ?? null, completedAt: new Date() }
		});
		if (count === 0) return null;
		const command = await this.prisma.command.findUniqueOrThrow({ where: { id: ack.id } });
		if (command.type === "LAMP" && command.status === "DONE" && command.lampOn !== null)
			await this.prisma.device.updateMany({
				where: { id: deviceId },
				data: { lampOn: command.lampOn, ...(command.lampColor && { lampColor: command.lampColor }) }
			});
		return toCommand(command);
	}

	/** On boot, commands left in flight by a previous process can never be acknowledged. */
	async failStaleCommands() {
		await this.prisma.command.updateMany({
			where: { status: { in: ["PENDING", "SENT"] } },
			data: { status: "FAILED", error: "Interrompue (redémarrage API)", completedAt: new Date() }
		});
	}
}
