import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { Env } from "./config/env";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	const config = app.get<ConfigService<Env, true>>(ConfigService);

	app.use(helmet());
	app.enableCors({ origin: config.get("FRONTEND_URL", { infer: true }) });

	const port = config.get("PORT", { infer: true });
	await app.listen(port);
	Logger.log(`API prête sur http://localhost:${port}`, "Bootstrap");
}

bootstrap();
