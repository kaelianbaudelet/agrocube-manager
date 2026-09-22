import type { User } from "@repo/shared";
import type { User as PrismaUser } from "../../generated/prisma/client";

export const toPublicUser = (user: PrismaUser): User => ({
	id: user.id,
	username: user.username,
	email: user.email,
	firstName: user.firstName,
	lastName: user.lastName,
	createdAt: user.createdAt.toISOString()
});
