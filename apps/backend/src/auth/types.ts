import type { User } from "../../generated/prisma/client";

export interface JwtPayload {
	sub: string;
	sessionId: string;
	jti?: string;
}

export type AuthUser = User & { sessionId: string };

export interface RefreshUser {
	sessionId: string;
	userId: string;
	refreshToken: string;
}
