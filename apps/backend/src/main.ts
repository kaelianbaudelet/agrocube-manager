import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { SocketIoAdapter } from "./common/socket-io.adapter";
import { Env } from "./config/env";

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule);
	const config = app.get<ConfigService<Env, true>>(ConfigService);

	app.use(
		helmet({
			contentSecurityPolicy: config.get("NODE_ENV", { infer: true }) === "production" ? undefined : false
		})
	);
	// Assistant conversations are sent whole with each message: allow more than the 100 kB default.
	// biome-ignore lint/correctness/useHookAtTopLevel: NestJS method, not a React hook
	app.useBodyParser("json", { limit: "2mb" });
	app.enableCors({ origin: config.get("FRONTEND_URL", { infer: true }) });
	// biome-ignore lint/correctness/useHookAtTopLevel: NestJS method, not a React hook
	app.useWebSocketAdapter(new SocketIoAdapter(app, config.get("FRONTEND_URL", { infer: true })));

	if (config.get("NODE_ENV", { infer: true }) === "development") {
		const options = new DocumentBuilder()
			.setTitle("Workshop EPSI API")
			.setDescription("Documentation de l'API Workshop EPSI")
			.setVersion("1.0")
			.addBearerAuth({
				type: "http",
				scheme: "bearer",
				description: "Jeton d'accès (JWT) ou clé API personnelle (agk_…)"
			})
			.build();
		const document = SwaggerModule.createDocument(app, options);

		app.use(
			"/docs",
			apiReference({
				theme: "deepSpace",
				content: document
			})
		);
	}

	const port = config.get("PORT", { infer: true });
	await app.listen(port);
	Logger.log(`API prête sur http://localhost:${port}`, "Bootstrap");
	if (config.get("NODE_ENV", { infer: true }) === "development") {
		Logger.log(`Docs OpenAPI sur http://localhost:${port}/docs`, "Bootstrap");
	}
}

bootstrap();
