import type { User } from "../../generated/prisma/client";

export interface JwtPayload {
	sub: string;
	sessionId: string;
	jti?: string;
}

/** Signed in with a JWT (sessionId) or with a personal API key (apiKeyId). */
export type AuthUser = User & { sessionId: string | null; apiKeyId: string | null };

export interface RefreshUser {
	sessionId: string;
	userId: string;
	refreshToken: string;
}
