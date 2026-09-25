import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { type OnGatewayInit, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import {
	type Command,
	type DeviceStatusEvent,
	type SchedulesChangedEvent,
	SOCKET_NAMESPACES,
	type TelemetryEvent
} from "@repo/shared";
import type { Namespace } from "socket.io";
import type { JwtPayload } from "../auth/types";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Read-only realtime feed for the web dashboard. Orders go through the REST API (JWT guard, validation).
 */
@WebSocketGateway({ namespace: SOCKET_NAMESPACES.dashboard })
export class DashboardGateway implements OnGatewayInit {
	private readonly logger = new Logger(DashboardGateway.name);

	@WebSocketServer() private readonly server!: Namespace;

	constructor(
		private readonly jwt: JwtService,
		private readonly config: ConfigService<Env, true>,
		private readonly prisma: PrismaService
	) {}

	/**
	 * Same rules as JwtStrategy: valid access token AND a live session.
	 */
	afterInit(server: Namespace) {
		server.use(async (socket, next) => {
			try {
				const token = socket.handshake.auth?.token;
				if (typeof token !== "string") throw new Error("missing token");
				const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
					secret: this.config.get("JWT_SECRET", { infer: true })
				});
				const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId } });
				if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) {
					throw new Error("session expired");
				}
				next();
			} catch {
				next(new Error("unauthorized"));
			}
		});
		this.logger.log(`Namespace ${SOCKET_NAMESPACES.dashboard} prêt`);
	}

	emitTelemetry(event: TelemetryEvent) {
		this.server.emit("telemetry", event);
	}

	emitStatus(event: DeviceStatusEvent) {
		this.server.emit("device:status", event);
	}

	emitCommand(command: Command) {
		this.server.emit("command:update", command);
	}

	/** A cube was created, renamed or deleted: dashboards refetch the list. */
	emitDevicesChanged() {
		this.server.emit("devices:changed");
	}

	/** A cube's watering schedules were edited or one of them ran (next / last run moved). */
	emitSchedulesChanged(deviceId: string) {
		this.server.emit("schedules:changed", { deviceId } satisfies SchedulesChangedEvent);
	}
}
