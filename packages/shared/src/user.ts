import { z } from "zod";
import { zEmail, zName, zPassword, zUsername } from "./fields.js";

export interface User {
	id: string;
	username: string;
	email: string;
	firstName: string;
	lastName: string;
	createdAt: string;
}

export const UpdateProfileSchema = z
	.object({
		username: zUsername(),
		email: zEmail(),
		firstName: zName(),
		lastName: zName()
	})
	.partial();
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "Mot de passe actuel requis"),
		newPassword: zPassword()
	})
	.refine((data) => data.currentPassword !== data.newPassword, {
		message: "Le nouveau mot de passe doit être différent de l'actuel",
		path: ["newPassword"]
	});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
