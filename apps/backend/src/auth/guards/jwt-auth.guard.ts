import { type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SESSION_ONLY_KEY } from "../decorators/session-only.decorator";
import type { AuthUser } from "../types";

/**
 * Global guard: every route requires a valid access token (JWT) or personal API key unless marked @Public().
 * Routes marked @SessionOnly() refuse API keys.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(["jwt", "api-key"]) {
	constructor(private readonly reflector: Reflector) {
		super();
	}

	async canActivate(context: ExecutionContext) {
		const targets = [context.getHandler(), context.getClass()];
		if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
		await super.canActivate(context);
		const user: AuthUser = context.switchToHttp().getRequest().user;
		if (user.apiKeyId && this.reflector.getAllAndOverride<boolean>(SESSION_ONLY_KEY, targets)) {
			throw new ForbiddenException("Action réservée à une session utilisateur (pas de clé API)");
		}
		return true;
	}
}
