import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthResponse, AuthTokens, RegisterDto } from "@repo/shared";
import bcrypt from "bcryptjs";
import type { User } from "../../generated/prisma/client";
import { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { toPublicUser } from "../users/user.mapper";
import { BCRYPT_ROUNDS, UsersService } from "../users/users.service";
import { hashToken } from "./token.util";
import { JwtPayload } from "./types";

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwt: JwtService,
		private readonly config: ConfigService<Env, true>,
		private readonly users: UsersService
	) {}

	async validateUser(email: string, password: string): Promise<User | null> {
		const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
		if (!user) return null;
		return (await bcrypt.compare(password, user.password)) ? user : null;
	}

	async register(dto: RegisterDto): Promise<AuthResponse> {
		await this.users.assertAvailable({ email: dto.email, username: dto.username });
		const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
		const user = await this.prisma.user.create({ data: { ...dto, password } });
		return this.createSession(user);
	}

	login(user: User): Promise<AuthResponse> {
		return this.createSession(user);
	}

	async refresh(sessionId: string, refreshToken: string): Promise<AuthTokens> {
		const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
		if (!session || session.expiresAt < new Date() || session.refreshTokenHash !== hashToken(refreshToken)) {
			throw new UnauthorizedException("Session invalide");
		}
		const tokens = await this.signTokens(session.userId, session.id);
		await this.prisma.session.update({
			where: { id: session.id },
			data: { refreshTokenHash: hashToken(tokens.refreshToken), expiresAt: this.refreshExpiry() }
		});
		return tokens;
	}

	async logout(sessionId: string): Promise<void> {
		await this.prisma.session.deleteMany({ where: { id: sessionId } });
	}

	private async createSession(user: User): Promise<AuthResponse> {
		const sessionId = randomUUID();
		const tokens = await this.signTokens(user.id, sessionId);
		await this.prisma.session.create({
			data: {
				id: sessionId,
				userId: user.id,
				refreshTokenHash: hashToken(tokens.refreshToken),
				expiresAt: this.refreshExpiry()
			}
		});
		return { user: toPublicUser(user), ...tokens };
	}

	/**
	 * `jti` makes every refresh token unique, even when two are signed within the same second.
	 */
	private async signTokens(userId: string, sessionId: string): Promise<AuthTokens> {
		const payload: JwtPayload = { sub: userId, sessionId };
		const [accessToken, refreshToken] = await Promise.all([
			this.jwt.signAsync(payload, {
				secret: this.config.get("JWT_SECRET", { infer: true }),
				expiresIn: this.config.get("JWT_EXPIRES_IN", { infer: true })
			}),
			this.jwt.signAsync(
				{ ...payload, jti: randomUUID() },
				{
					secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
					expiresIn: this.config.get("JWT_REFRESH_EXPIRES_IN", { infer: true })
				}
			)
		]);
		return { accessToken, refreshToken };
	}

	private refreshExpiry() {
		return new Date(Date.now() + this.config.get("JWT_REFRESH_EXPIRES_IN", { infer: true }) * 1000);
	}
}
