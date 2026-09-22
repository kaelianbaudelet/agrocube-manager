import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { PrismaExceptionFilter } from "./common/prisma-exception.filter";
import { validateEnv } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
		ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
		PrismaModule,
		AuthModule,
		UsersModule
	],
	controllers: [AppController],
	providers: [
		/**
		 * Validates every @Body({ schema }) / @Query({ schema }) against its Zod (Standard Schema) schema.
		 */
		{ provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
		/**
		 * Maps Prisma unique-constraint errors (P2002) to 409.
		 */
		{ provide: APP_FILTER, useClass: PrismaExceptionFilter },
		/**
		 * Secure by default: every route needs an access token unless marked @Public().
		 */
		{ provide: APP_GUARD, useClass: JwtAuthGuard },
		{ provide: APP_GUARD, useClass: ThrottlerGuard }
	]
})
export class AppModule {}
