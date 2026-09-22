import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ChangePasswordDto, UpdateProfileDto, User } from "@repo/shared";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { toPublicUser } from "./user.mapper";

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

	async findMe(userId: string): Promise<User> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } });
		if (!user) throw new NotFoundException("Utilisateur introuvable");
		return toPublicUser(user);
	}

	async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
		await this.assertAvailable({ email: dto.email, username: dto.username }, userId);
		const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
		return toPublicUser(user);
	}

	/**
	 * Keeps the current session alive and revokes every other one.
	 */
	async changePassword(userId: string, currentSessionId: string, dto: ChangePasswordDto): Promise<void> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } });
		if (!user || !(await bcrypt.compare(dto.currentPassword, user.password))) {
			throw new BadRequestException("Mot de passe actuel incorrect");
		}
		const password = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
		await this.prisma.$transaction([
			this.prisma.user.update({ where: { id: userId }, data: { password } }),
			this.prisma.session.deleteMany({ where: { userId, NOT: { id: currentSessionId } } })
		]);
	}
}
