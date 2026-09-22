import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser, JwtPayload } from "../types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
	constructor(
		configService: ConfigService<Env, true>,
		private readonly prisma: PrismaService
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.get("JWT_SECRET", { infer: true })
		});
	}

	/**
	 * The session must still exist: logout and password changes revoke access tokens immediately.
	 */
	async validate(payload: JwtPayload): Promise<AuthUser> {
		const session = await this.prisma.session.findUnique({
			where: { id: payload.sessionId },
			include: { user: true }
		});
		if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) {
			throw new UnauthorizedException("Session expirée");
		}
		return { ...session.user, sessionId: session.id };
	}
}
