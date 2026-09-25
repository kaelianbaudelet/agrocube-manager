import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from "@nestjs/common";
import { type ChangePasswordDto, ChangePasswordSchema, type UpdateProfileDto, UpdateProfileSchema } from "@repo/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionOnly } from "../auth/decorators/session-only.decorator";
import type { AuthUser } from "../auth/types";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get("me")
	me(@CurrentUser("id") userId: string) {
		return this.usersService.findMe(userId);
	}

	@Patch("me")
	updateMe(@CurrentUser("id") userId: string, @Body({ schema: UpdateProfileSchema }) dto: UpdateProfileDto) {
		return this.usersService.updateProfile(userId, dto);
	}

	/** Session only: the operator must be signed in to change the password (it revokes the other sessions). */
	@SessionOnly()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Patch("me/password")
	changePassword(@CurrentUser() user: AuthUser, @Body({ schema: ChangePasswordSchema }) dto: ChangePasswordDto) {
		return this.usersService.changePassword(user.id, user.sessionId!, dto);
	}
}
