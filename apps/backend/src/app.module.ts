import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_PIPE } from "@nestjs/core";
import { AppController } from "./app.controller";
import { validateEnv } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
	imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule],
	controllers: [AppController],
	providers: [
		/**
		 * Validates every @Body({ schema }) / @Query({ schema }) against its Zod (Standard Schema) schema.
		 */
		{ provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() }
	]
})
export class AppModule {}
