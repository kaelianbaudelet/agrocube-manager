import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { Env } from "../config/env";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
	constructor(configService: ConfigService<Env, true>) {
		const adapter = new PrismaPg({ connectionString: configService.get("DATABASE_URL", { infer: true }) });
		super({ adapter });
	}

	async onModuleDestroy() {
		await this.$disconnect();
	}
}
