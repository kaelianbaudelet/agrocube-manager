import { randomBytes } from "node:crypto";
import { hashToken } from "../auth/token.util";

/** A new secret for a cube. Only its hash is stored: show the key once, then forget it. */
export function generateDeviceKey() {
	const key = `agc_${randomBytes(24).toString("base64url")}`;
	return { key, hash: hashToken(key) };
}
