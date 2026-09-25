import { Body, Controller, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AiService, type ChatRequest, ChatRequestSchema } from "./ai.service";

@Controller("ai")
export class AiController {
	constructor(private readonly ai: AiService) {}

	/** Streams the assistant's answer as an AI SDK UI message stream (consumed by useChat). */
	@Post("chat")
	async chat(
		@Body({ schema: ChatRequestSchema }) body: ChatRequest,
		@CurrentUser("id") userId: string,
		@Res() res: Response
	) {
		await this.ai.streamChat(body, res, userId);
	}
}
