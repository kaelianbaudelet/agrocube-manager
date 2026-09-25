import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { type CreateApiKeyDto, CreateApiKeySchema } from "@repo/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionOnly } from "../auth/decorators/session-only.decorator";
import { ApiKeysService } from "./api-keys.service";

/** An API key cannot mint or revoke keys: only the signed-in operator can. */
@SessionOnly()
@Controller("api-keys")
export class ApiKeysController {
	constructor(private readonly apiKeys: ApiKeysService) {}

	@Get()
	list(@CurrentUser("id") userId: string) {
		return this.apiKeys.list(userId);
	}

	/** The key is in the response and nowhere else: it is stored hashed. */
	@Post()
	create(@CurrentUser("id") userId: string, @Body({ schema: CreateApiKeySchema }) dto: CreateApiKeyDto) {
		return this.apiKeys.create(userId, dto);
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(":id")
	remove(@CurrentUser("id") userId: string, @Param("id", ParseUUIDPipe) id: string) {
		return this.apiKeys.remove(userId, id);
	}
}
