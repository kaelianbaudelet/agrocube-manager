import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Env } from "../../config/env";
import { JwtPayload, RefreshUser } from "../types";

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, "jwt-refresh") {
	constructor(configService: ConfigService<Env, true>) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKey: configService.get("JWT_REFRESH_SECRET", { infer: true }),
			passReqToCallback: true
		});
	}

	validate(req: Request, payload: JwtPayload): RefreshUser {
		const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
		if (!refreshToken) throw new UnauthorizedException("Refresh token manquant");
		return { sessionId: payload.sessionId, userId: payload.sub, refreshToken };
	}
}
