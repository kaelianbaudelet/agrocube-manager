import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { API_KEY_PREFIX } from "@repo/shared";
import { Strategy } from "passport-http-bearer";
import { PrismaService } from "../../prisma/prisma.service";
import { hashToken } from "../token.util";
import type { AuthUser } from "../types";

/** lastUsedAt is refreshed at most this often, not on every request. */
const TOUCH_EVERY_MS = 60_000;

/**
 * `Authorization: Bearer agk_…`: a personal API key, tried after the JWT strategy.
 */
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, "api-key") {
	constructor(private readonly prisma: PrismaService) {
		super();
	}

	/** Returning false (not throwing) lets the guard answer a plain 401. */
	async validate(token: string): Promise<AuthUser | false> {
		if (!token.startsWith(API_KEY_PREFIX)) return false;
		const apiKey = await this.prisma.apiKey.findUnique({
			where: { keyHash: hashToken(token) },
			include: { user: true }
		});
		const now = new Date();
		if (!apiKey || apiKey.expiresAt <= now) return false;
		await this.prisma.apiKey.updateMany({
			where: {
				id: apiKey.id,
				OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - TOUCH_EVERY_MS) } }]
			},
			data: { lastUsedAt: now }
		});
		return { ...apiKey.user, sessionId: null, apiKeyId: apiKey.id };
	}
}
