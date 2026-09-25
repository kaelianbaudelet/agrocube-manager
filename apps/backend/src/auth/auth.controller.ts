import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { type LoginDto, LoginSchema, type RegisterDto, RegisterSchema } from "@repo/shared";
import type { User } from "../../generated/prisma/client";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { SessionOnly } from "./decorators/session-only.decorator";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { LocalAuthGuard } from "./guards/local-auth.guard";
import type { RefreshUser } from "./types";

@Controller("auth")
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Public()
	@Post("register")
	register(@Body({ schema: RegisterSchema }) dto: RegisterDto) {
		return this.authService.register(dto);
	}

	@Public()
	@UseGuards(LocalAuthGuard)
	@Throttle({ default: { limit: 20, ttl: 60_000 } })
	@HttpCode(HttpStatus.OK)
	@Post("login")
	login(@CurrentUser() user: User, @Body({ schema: LoginSchema }) _dto: LoginDto) {
		return this.authService.login(user);
	}

	@Public()
	@UseGuards(JwtRefreshGuard)
	@HttpCode(HttpStatus.OK)
	@Post("refresh")
	refresh(@CurrentUser() refreshUser: RefreshUser) {
		return this.authService.refresh(refreshUser.sessionId, refreshUser.refreshToken);
	}

	@SessionOnly()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post("logout")
	logout(@CurrentUser("sessionId") sessionId: string) {
		return this.authService.logout(sessionId);
	}
}
