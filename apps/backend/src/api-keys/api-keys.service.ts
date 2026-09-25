import { randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { API_KEY_PREFIX, type ApiKey, type CreateApiKeyDto, type CreatedApiKey } from "@repo/shared";
import type { ApiKey as PrismaApiKey } from "../../generated/prisma/client";
import { hashToken } from "../auth/token.util";
import { PrismaService } from "../prisma/prisma.service";

/** Characters of the key kept in clear, to recognise it in the list. */
const PREFIX_LENGTH = API_KEY_PREFIX.length + 6;

const toApiKey = (k: PrismaApiKey): ApiKey => ({
	id: k.id,
	name: k.name,
	prefix: k.prefix,
	expiresAt: k.expiresAt.toISOString(),
	lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
	createdAt: k.createdAt.toISOString()
});

@Injectable()
export class ApiKeysService {
	constructor(private readonly prisma: PrismaService) {}

	async list(userId: string) {
		const keys = await this.prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
		return keys.map(toApiKey);
	}

	async create(userId: string, dto: CreateApiKeyDto): Promise<CreatedApiKey> {
		const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
		const apiKey = await this.prisma.apiKey.create({
			data: {
				userId,
				name: dto.name,
				keyHash: hashToken(key),
				prefix: key.slice(0, PREFIX_LENGTH),
				expiresAt: new Date(dto.expiresAt)
			}
		});
		return { apiKey: toApiKey(apiKey), key };
	}

	/** Revokes the key immediately. */
	async remove(userId: string, id: string) {
		const { count } = await this.prisma.apiKey.deleteMany({ where: { id, userId } });
		if (count === 0) throw new NotFoundException("Clé introuvable");
	}
}
