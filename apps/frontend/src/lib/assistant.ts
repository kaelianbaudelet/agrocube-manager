import { Chat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithApprovalResponses,
	lastAssistantMessageIsCompleteWithToolCalls
} from "ai";
import { env } from "@/env";
import { useDeviceStore } from "@/stores/useDeviceStore";
import { authFetch } from "./api";

/**
 * One conversation for the whole session: it survives switching tabs, and is reset on logout.
 */
export const assistantChat = new Chat({
	transport: new DefaultChatTransport({
		api: `${env.VITE_API_URL}/ai/chat`,
		fetch: (input, init) => authFetch(input, init),
		// The cube on screen is what "ma plante" / "ce cube" refer to.
		body: () => ({ deviceId: useDeviceStore.getState().selectedId })
	}),
	// The assistant paused on a question (askUser) or an action to approve: resume as soon as the user
	// has answered / approved / refused.
	sendAutomaticallyWhen: (options) =>
		lastAssistantMessageIsCompleteWithToolCalls(options) || lastAssistantMessageIsCompleteWithApprovalResponses(options)
});

export function resetAssistant() {
	assistantChat.stop();
	assistantChat.messages = [];
}
