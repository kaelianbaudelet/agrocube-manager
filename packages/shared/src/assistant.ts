/**
 * "askUser": the assistant's client-side tool. The model calls it with a question, the chat shows it
 * with answer buttons, and the conversation resumes once the user has answered.
 */
export const ASK_USER_TOOL = "askUser";

export interface AskUserOption {
	/** Short, shown on the button and sent back as the answer. */
	label: string;
	/** Optional detail under the label. */
	description?: string;
}

export interface AskUserInput {
	question: string;
	options?: AskUserOption[];
	/** Several options can be picked. */
	multiple?: boolean;
	/** Offer a free text answer besides the options (defaults to true). */
	allowFreeText?: boolean;
}

export interface AskUserOutput {
	/** Labels of the picked options, or the free text typed by the user. */
	answers: string[];
}

/**
 * The assistant's write tools. Each call waits for the user's approval (card in the chat) before it runs.
 */
export const ASSISTANT_ACTION_TOOLS = {
	waterNow: "Arrosage",
	setLamp: "Éclairage",
	createSchedule: "Nouvelle programmation",
	updateSchedule: "Modification de programmation",
	deleteSchedule: "Suppression de programmation",
	createCube: "Nouveau cube",
	renameCube: "Renommage"
} as const;
export type AssistantActionTool = keyof typeof ASSISTANT_ACTION_TOOLS;
