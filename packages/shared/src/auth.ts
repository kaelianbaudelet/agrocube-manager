import { z } from "zod";
import { zEmail, zName, zPassword, zUsername } from "./fields.js";
import type { User } from "./user.js";

export const RegisterSchema = z.object({
	username: zUsername(),
	email: zEmail(),
	firstName: zName(),
	lastName: zName(),
	password: zPassword()
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
	email: zEmail(),
	password: z.string().min(1, "Mot de passe requis")
});
export type LoginDto = z.infer<typeof LoginSchema>;

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
	user: User;
}
