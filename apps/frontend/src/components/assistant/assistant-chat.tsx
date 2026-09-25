import { useChat } from "@ai-sdk/react";
import { ASK_USER_TOOL, type AskUserOutput } from "@repo/shared";
import type { UIMessage } from "ai";
import { type KeyboardEvent, type SubmitEvent, useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { Streamdown, type StreamdownTranslations } from "streamdown";
import { HudButton } from "@/components/hud/hud-button";
import { assistantChat, resetAssistant } from "@/lib/assistant";
import { ActionCard, isActionPart } from "./action-card";
import { AskUserCard } from "./ask-user-card";
import { SparkIcon } from "./spark-icon";

const SUGGESTIONS = [
	"Comment va ma plante ?",
	"Faut-il arroser aujourd'hui ?",
	"Résumez les dernières 24 heures",
	"Quand a lieu le prochain arrosage ?"
];

/** Streamdown's buttons, menus and dialogs (copy / download / fullscreen / external link) in French. */
const MD_TRANSLATIONS: StreamdownTranslations = {
	close: "Fermer",
	copied: "Copié",
	copyCode: "Copier le code",
	copyLink: "Copier le lien",
	copyTable: "Copier le tableau",
	copyTableAsCsv: "Copier en CSV",
	copyTableAsMarkdown: "Copier en Markdown",
	copyTableAsTsv: "Copier en TSV",
	downloadDiagram: "Télécharger le diagramme",
	downloadDiagramAsMmd: "Télécharger en MMD",
	downloadDiagramAsPng: "Télécharger en PNG",
	downloadDiagramAsSvg: "Télécharger en SVG",
	downloadFile: "Télécharger le fichier",
	downloadImage: "Télécharger l'image",
	downloadTable: "Télécharger le tableau",
	downloadTableAsCsv: "Télécharger en CSV",
	downloadTableAsMarkdown: "Télécharger en Markdown",
	exitFullscreen: "Quitter le plein écran",
	externalLinkWarning: "Vous allez quitter AGRO·CUBE pour un site externe.",
	imageNotAvailable: "Image indisponible",
	mermaidFormatMmd: "MMD",
	mermaidFormatPng: "PNG",
	mermaidFormatSvg: "SVG",
	openExternalLink: "Ouvrir le lien externe ?",
	openLink: "Ouvrir le lien",
	resetView: "Réinitialiser la vue",
	tableFormatCsv: "CSV",
	tableFormatMarkdown: "Markdown",
	tableFormatTsv: "TSV",
	viewFullscreen: "Plein écran",
	zoomIn: "Zoom avant",
	zoomOut: "Zoom arrière"
};

/** What the assistant is doing while it runs a tool (see the tools of AiService on the API). */
const TOOL_LABEL: Record<string, string> = {
	listCubes: "État des cubes",
	getCubeHistory: "Historique des capteurs",
	getRecentCommands: "Derniers ordres",
	getWateringSchedules: "Programmations d'arrosage"
};

type Part = UIMessage["parts"][number];
type ToolPart = Extract<Part, { type: `tool-${string}` }>;

function ToolStep({ part }: { part: ToolPart }) {
	const name = part.type.slice("tool-".length);
	const label = TOOL_LABEL[name] ?? name;
	const done = part.state === "output-available";
	const failed = part.state === "output-error";
	return (
		<p
			className={`flex w-fit items-center gap-1.5 border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${
				failed ? "border-crit/40 text-crit" : done ? "border-hud/25 text-muted-fg" : "hud-pulse border-hud/40 text-hud"
			}`}
		>
			<span aria-hidden>{failed ? "✕" : done ? "✓" : "⟳"}</span>
			{label}
			{!done && !failed && "…"}
		</p>
	);
}

function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
	return (
		<details className="group border-hud/30 border-l-2 pl-3 text-muted-fg">
			<summary
				className={`cursor-pointer list-none text-[10px] uppercase tracking-[0.2em] outline-none hover:text-fg focus-visible:text-hud ${streaming ? "hud-pulse text-hud" : ""}`}
			>
				<span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>
					›
				</span>
				{streaming ? "Réflexion en cours…" : "Réflexion"}
			</summary>
			<p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{text}</p>
		</details>
	);
}

interface AssistantMessageProps {
	message: UIMessage;
	streaming: boolean;
	/** Questions (askUser) can only be answered on the last message, while nothing is in flight. */
	canAnswer: boolean;
	onAnswer: (toolCallId: string, output: AskUserOutput) => void;
	/** Approve / refuse an action proposed by the assistant. */
	onRespond: (approvalId: string, approved: boolean) => void;
}

function AssistantMessage({ message, streaming, canAnswer, onAnswer, onRespond }: AssistantMessageProps) {
	return (
		<div className="flex gap-3">
			<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center border border-hud/40 bg-hud/10 text-hud">
				<SparkIcon className="size-3.5" />
			</span>
			<div className="min-w-0 flex-1 space-y-2">
				{message.parts.map((part, i) => {
					const key = `${message.id}-${i}`;
					const last = streaming && i === message.parts.length - 1;
					if (part.type === "reasoning")
						return part.text.trim() ? <Reasoning key={key} text={part.text} streaming={last} /> : null;
					if (part.type === "text")
						return (
							<Streamdown
								key={key}
								className="assistant-md text-fg text-sm leading-relaxed"
								isAnimating={last}
								translations={MD_TRANSLATIONS}
							>
								{/* qwen3 sometimes leaks its reasoning tags into the answer */}
								{part.text.replace(/<\/?think>/g, "")}
							</Streamdown>
						);
					if (part.type === `tool-${ASK_USER_TOOL}`) {
						const tool = part as ToolPart;
						return (
							<AskUserCard
								key={key}
								part={tool}
								canAnswer={canAnswer}
								onAnswer={(output) => onAnswer(tool.toolCallId, output)}
							/>
						);
					}
					if (isActionPart(part))
						return <ActionCard key={key} part={part as ToolPart} canRespond={canAnswer} onRespond={onRespond} />;
					if (part.type.startsWith("tool-")) return <ToolStep key={key} part={part as ToolPart} />;
					return null;
				})}
			</div>
		</div>
	);
}

function UserMessage({ message }: { message: UIMessage }) {
	const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
	return (
		<div className="flex justify-end">
			<p className="max-w-[85%] whitespace-pre-wrap border border-hud/30 bg-hud/10 px-3 py-2 text-fg text-sm">{text}</p>
		</div>
	);
}

export function AssistantChat() {
	const { messages, sendMessage, status, stop, error, regenerate, clearError, addToolOutput, addToolApprovalResponse } =
		useChat({
			chat: assistantChat
		});
	const [input, setInput] = useState("");
	const scroller = useRef<HTMLDivElement>(null);
	const busy = status === "submitted" || status === "streaming";
	const last = messages.at(-1);

	// Follow the answer as it streams, unless the user scrolled up to read.
	useEffect(() => {
		const el = scroller.current;
		if (!el) return;
		if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
	});

	const send = (text: string) => {
		const value = text.trim();
		if (!value || busy) return;
		clearError();
		sendMessage({ text: value });
		setInput("");
	};

	const onSubmit = (e: SubmitEvent) => {
		e.preventDefault();
		send(input);
	};

	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			send(input);
		}
	};

	return (
		<div className="flex h-full flex-col">
			<header className="flex shrink-0 items-center gap-2 border-hud/15 border-b px-4 py-2">
				<SparkIcon className="size-3.5 text-hud" />
				<h1 className="font-display text-[11px] text-hud uppercase tracking-[0.25em]">Assistant IA</h1>
				{messages.length > 0 && (
					<Button
						onPress={resetAssistant}
						className="ml-auto cursor-pointer text-[10px] text-muted-fg uppercase tracking-[0.15em] outline-none hover:text-fg focus-visible:text-hud"
					>
						Nouvelle conversation
					</Button>
				)}
			</header>

			<div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5">
					{messages.length === 0 ? (
						<div className="flex flex-col items-center gap-4 pt-[10vh] text-center">
							<span className="flex size-12 items-center justify-center border border-hud/40 bg-hud/10 text-hud hud-glow-box">
								<SparkIcon className="size-5" />
							</span>
							<div className="space-y-1">
								<p className="font-display text-fg text-sm tracking-[0.2em]">COMMENT PUIS-JE VOUS AIDER ?</p>
								<p className="text-muted-fg text-xs">
									L'assistant lit les mesures, l'historique et les ordres de vos cubes pour vous répondre.
								</p>
							</div>
							<div className="flex flex-wrap justify-center gap-2">
								{SUGGESTIONS.map((s) => (
									<Button
										key={s}
										onPress={() => send(s)}
										className="cursor-pointer border border-hud/25 px-3 py-1.5 text-muted-fg text-xs outline-none hover:border-hud/60 hover:text-fg focus-visible:border-hud"
									>
										{s}
									</Button>
								))}
							</div>
						</div>
					) : (
						messages.map((m) =>
							m.role === "user" ? (
								<UserMessage key={m.id} message={m} />
							) : (
								<AssistantMessage
									key={m.id}
									message={m}
									streaming={status === "streaming" && m.id === last?.id}
									canAnswer={!busy && m.id === last?.id}
									onAnswer={(toolCallId, output) => addToolOutput({ tool: ASK_USER_TOOL, toolCallId, output })}
									onRespond={(id, approved) => addToolApprovalResponse({ id, approved })}
								/>
							)
						)
					)}

					{status === "submitted" && (
						<p className="hud-pulse pl-10 text-[10px] text-hud uppercase tracking-[0.2em]">Traitement en cours...</p>
					)}
					{error && (
						<div
							className="flex flex-wrap items-center gap-3 border border-crit/40 bg-crit/5 px-3 py-2 text-crit text-xs"
							role="alert"
						>
							<span className="min-w-0 flex-1">{error.message || "L'assistant n'a pas pu répondre."}</span>
							<HudButton intent="danger" className="px-2 py-1 text-[10px]" onPress={() => regenerate()}>
								Réessayer
							</HudButton>
						</div>
					)}
				</div>
			</div>

			<form onSubmit={onSubmit} className="shrink-0 border-hud/15 border-t px-4 py-3">
				<div className="mx-auto flex w-full max-w-3xl items-end gap-2">
					<textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={onKeyDown}
						rows={1}
						placeholder="Posez une question sur vos plantes…"
						aria-label="Message pour l'assistant"
						className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none border border-hud/25 bg-hud/5 px-3 py-2 text-fg text-sm outline-none transition placeholder:text-muted-fg hover:border-hud/45 focus:border-hud"
					/>
					{busy ? (
						<HudButton intent="ghost" onPress={() => stop()} className="h-10">
							Stop
						</HudButton>
					) : (
						<HudButton type="submit" isDisabled={!input.trim()} className="h-10">
							Envoyer
						</HudButton>
					)}
				</div>
				<p className="mx-auto mt-1.5 w-full max-w-3xl text-[10px] text-muted-fg">
					Entrée pour envoyer, Maj+Entrée pour un saut de ligne. L'IA peut se tromper : vérifiez les mesures sur le
					tableau de bord.
				</p>
			</form>
		</div>
	);
}
