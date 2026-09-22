import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Throws a 409 if another user already owns this email or username.
	 * `excludeUserId` lets a user re-submit their own current values.
	 */
	async assertAvailable(fields: { email?: string; username?: string }, excludeUserId?: string) {
		const or = [
			...(fields.email ? [{ email: fields.email }] : []),
			...(fields.username ? [{ username: fields.username }] : [])
		];
		if (or.length === 0) return;

		const existing = await this.prisma.user.findFirst({
			where: { OR: or, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) },
			select: { email: true, username: true }
		});
		if (!existing) return;

		if (fields.email && existing.email === fields.email) {
			throw new ConflictException("Cet email est déjà utilisé");
		}
		throw new ConflictException("Ce nom d'utilisateur est déjà utilisé");
	}
}
