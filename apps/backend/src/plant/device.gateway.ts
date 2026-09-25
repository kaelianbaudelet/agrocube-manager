import { Logger, type OnModuleDestroy } from "@nestjs/common";
import {
	type OnGatewayConnection,
	type OnGatewayDisconnect,
	type OnGatewayInit,
	WebSocketGateway,
	WebSocketServer
} from "@nestjs/websockets";
import {
	type Command,
	CommandAckSchema,
	DEFAULT_LAMP_COLOR,
	type DeviceCommandMessage,
	type DeviceStateMessage,
	LAMP_COLORS,
	type LampColor,
	SOCKET_NAMESPACES,
	TelemetrySchema,
	toLampColor
} from "@repo/shared";
import type { Namespace, Socket } from "socket.io";
import { DashboardGateway } from "./dashboard.gateway";
import { PlantService } from "./plant.service";

/** Time given to the cube, on top of the pump duration, to acknowledge a command. */
const ACK_GRACE_MS = 10_000;

type Ack = (response: { ok: boolean; error?: string }) => void;

interface DeviceSocketData {
	deviceId: string;
	deviceName: string;
	lampOn: boolean;
	lampColor: LampColor;
}

const room = (deviceId: string) => `device:${deviceId}`;

const lampMessage = (id: string, on: boolean, color: LampColor): DeviceCommandMessage => ({
	id,
	type: "LAMP",
	on,
	color,
	rgb: LAMP_COLORS[color].rgb
});

/**
 * Socket endpoint for the cubes. Events are bound by hand (not @SubscribeMessage) so the global
 * HTTP guards (JWT, throttler) don't run on them: the handshake middleware is the authentication.
 */
@WebSocketGateway({ namespace: SOCKET_NAMESPACES.device })
export class DeviceGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
	private readonly logger = new Logger(DeviceGateway.name);
	private readonly ackTimeouts = new Map<string, NodeJS.Timeout>();

	@WebSocketServer() private readonly server!: Namespace;

	constructor(
		private readonly plant: PlantService,
		private readonly dashboard: DashboardGateway
	) {}

	afterInit(server: Namespace) {
		server.use(async (socket, next) => {
			const header = socket.handshake.headers.authorization;
			const key = socket.handshake.auth?.token ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
			const device = typeof key === "string" && key ? await this.plant.findDeviceByKey(key) : null;
			if (!device) return next(new Error("unauthorized"));
			socket.data = {
				deviceId: device.id,
				deviceName: device.name,
				lampOn: device.lampOn,
				lampColor: toLampColor(device.lampColor)
			} satisfies DeviceSocketData;
			next();
		});
		void this.plant.failStaleCommands();
		this.logger.log(`Namespace ${SOCKET_NAMESPACES.device} prêt`);
	}

	async handleConnection(socket: Socket) {
		const { deviceId, deviceName, lampOn, lampColor } = socket.data as DeviceSocketData;

		// Listeners first: the cube may emit right after connecting, before the awaits below resolve.
		socket.on(
			"telemetry",
			this.guard("telemetry", async (payload: unknown, ack?: Ack) => {
				const parsed = TelemetrySchema.safeParse(payload);
				if (!parsed.success) return ack?.({ ok: false, error: parsed.error.issues[0]?.message });
				const reading = await this.plant.saveTelemetry(deviceId, parsed.data);
				this.dashboard.emitTelemetry({ deviceId, reading });
				ack?.({ ok: true });
			})
		);

		socket.on(
			"command:ack",
			this.guard("command:ack", async (payload: unknown, ack?: Ack) => {
				const parsed = CommandAckSchema.safeParse(payload);
				if (!parsed.success) return ack?.({ ok: false, error: parsed.error.issues[0]?.message });
				const command = await this.plant.completeCommand(deviceId, parsed.data);
				if (!command) return ack?.({ ok: false, error: "Commande inconnue ou déjà terminée" });
				this.clearAckTimeout(command.id);
				this.dashboard.emitCommand(command);
				ack?.({ ok: true });
			})
		);

		socket.join(room(deviceId));
		// A rebooted cube starts with everything off: give it back the last confirmed state.
		socket.emit("state", { lampOn, lampColor, rgb: LAMP_COLORS[lampColor].rgb } satisfies DeviceStateMessage);
		this.logger.log(`Cube connecté : ${deviceName} (${socket.id})`);
		const lastSeenAt = await this.plant.touchDevice(deviceId);
		if (lastSeenAt) this.dashboard.emitStatus({ deviceId, online: true, lastSeenAt });
	}

	async handleDisconnect(socket: Socket) {
		const { deviceId, deviceName } = (socket.data ?? {}) as Partial<DeviceSocketData>;
		if (!deviceId) return;
		this.logger.log(`Cube déconnecté : ${deviceName} (${socket.id})`);
		if (this.isOnline(deviceId)) return;
		const lastSeenAt = await this.plant.touchDevice(deviceId);
		if (lastSeenAt) this.dashboard.emitStatus({ deviceId, online: false, lastSeenAt });
	}

	/**
	 * Socket listeners run outside Nest's exception handling: an uncaught rejection would crash the process.
	 */
	private guard(event: string, handler: (payload: unknown, ack?: Ack) => Promise<void>) {
		return async (payload: unknown, ack?: Ack) => {
			try {
				await handler(payload, ack);
			} catch (error) {
				this.logger.error(`Erreur sur "${event}"`, error instanceof Error ? error.stack : error);
				ack?.({ ok: false, error: "Erreur serveur" });
			}
		};
	}

	/** Kicks the cube off (e.g. deleted): its key no longer exists, so it cannot reconnect. */
	disconnectDevice(deviceId: string) {
		this.server.in(room(deviceId)).disconnectSockets();
	}

	isOnline(deviceId: string) {
		return (this.server.adapter.rooms.get(room(deviceId))?.size ?? 0) > 0;
	}

	/**
	 * Pushes the order to the cube; it is marked FAILED if no "command:ack" arrives in time.
	 */
	sendCommand(command: Command) {
		const message: DeviceCommandMessage =
			command.type === "WATER"
				? { id: command.id, type: "WATER", durationMs: command.durationMs ?? 0 }
				: lampMessage(command.id, command.lampOn ?? false, command.lampColor ?? DEFAULT_LAMP_COLOR);
		this.server.to(room(command.deviceId)).emit("command", message);
		const timeout = setTimeout(
			async () => {
				this.ackTimeouts.delete(command.id);
				try {
					const failed = await this.plant.completeCommand(command.deviceId, {
						id: command.id,
						status: "FAILED",
						error: "Pas de réponse du cube"
					});
					if (failed) this.dashboard.emitCommand(failed);
				} catch (error) {
					this.logger.error("Échec du timeout de commande", error instanceof Error ? error.stack : error);
				}
			},
			(command.durationMs ?? 0) + ACK_GRACE_MS
		);
		this.ackTimeouts.set(command.id, timeout);
	}

	private clearAckTimeout(commandId: string) {
		clearTimeout(this.ackTimeouts.get(commandId));
		this.ackTimeouts.delete(commandId);
	}

	onModuleDestroy() {
		for (const timeout of this.ackTimeouts.values()) clearTimeout(timeout);
	}
}
