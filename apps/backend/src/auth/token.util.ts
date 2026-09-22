import { createHash } from "node:crypto";

/**
 * SHA-256 (not bcrypt): bcrypt truncates input at 72 bytes, and JWTs are longer.
 */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
