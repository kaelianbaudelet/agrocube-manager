import { SetMetadata } from "@nestjs/common";

export const SESSION_ONLY_KEY = "sessionOnly";

/**
 * Only a signed-in operator (JWT session) may call this route, not an API key: managing keys,
 * changing the password, logging out.
 */
export const SessionOnly = () => SetMetadata(SESSION_ONLY_KEY, true);
