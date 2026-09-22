import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class LocalAuthGuard extends AuthGuard("local") {
	/**
	 * Explicit no-arg constructor: without it Nest 12 tries to inject AuthModuleOptions and fails.
	 */
	constructor() {
		super();
	}
}
