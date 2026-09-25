import { createFileRoute } from "@tanstack/react-router";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const Route = createFileRoute("/_app/assistant")({
	component: AssistantChat
});
