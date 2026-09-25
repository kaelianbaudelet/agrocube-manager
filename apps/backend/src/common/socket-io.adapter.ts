import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";

/**
 * Socket.IO with the same CORS origin as the HTTP API (gateway decorators can't read ConfigService).
 */
export class SocketIoAdapter extends IoAdapter {
	constructor(
		app: INestApplicationContext,
		private readonly origin: string
	) {
		super(app);
	}

	createIOServer(port: number, options?: Partial<ServerOptions>) {
		return super.createIOServer(port, { ...options, cors: { origin: this.origin } } as ServerOptions);
	}
}
