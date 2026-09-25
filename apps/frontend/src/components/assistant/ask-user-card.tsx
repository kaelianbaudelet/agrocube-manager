import type { AskUserInput, AskUserOption, AskUserOutput } from "@repo/shared";
import type { UIMessage } from "ai";
import { type SubmitEvent, useState } from "react";
import { Button } from "react-aria-components";
import { HudButton } from "@/components/hud/hud-button";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

const optionClass =
	"flex min-w-0 cursor-pointer flex-col items-start gap-0.5 border px-3 py-2 text-left text-xs outline-none transition focus-visible:ring-1 focus-visible:ring-hud disabled:cursor-not-allowed";

function OptionButton({
	option,
	chosen,
	dimmed,
	toggle,
	onPress
}: {
	option: AskUserOption;
	chosen: boolean;
	/** Question already answered: the options not picked fade out. */
	dimmed: boolean;
	/** Multiple choice: the button toggles (aria-pressed). */
	toggle: boolean;
	onPress: () => void;
}) {
	const tone = chosen
		? "border-hud bg-hud/15 text-hud"
		: dimmed
			? "border-hud/15 text-muted-fg opacity-50"
			: "border-hud/30 text-fg hover:border-hud/70 hover:bg-hud/10";
	return (
		<Button onPress={onPress} aria-pressed={toggle ? chosen : undefined} className={`${optionClass} ${tone}`}>
			<span className="flex items-center gap-2">
				{chosen && <span aria-hidden>✓</span>}
				{option.label}
			</span>
			{option.description && <span className="text-[11px] text-muted-fg">{option.description}</span>}
		</Button>
	);
}

function FreeTextAnswer({ placeholder, onAnswer }: { placeholder: string; onAnswer: (value: string) => void }) {
	const [text, setText] = useState("");
	const submit = (e: SubmitEvent) => {
		e.preventDefault();
		if (text.trim()) onAnswer(text.trim());
	};
	return (
		<form onSubmit={submit} className="flex min-w-48 flex-1 gap-2">
			<input
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder={placeholder}
				aria-label="Réponse libre"
				className="h-8 min-w-0 flex-1 border border-hud/25 bg-bg/60 px-2 text-fg text-xs outline-none placeholder:text-muted-fg focus:border-hud"
			/>
			<HudButton type="submit" intent="ghost" className="h-8 px-3 py-0 text-[10px]" isDisabled={!text.trim()}>
				OK
			</HudButton>
		</form>
	);
}

/**
 * The assistant asks the user something and waits (askUser tool): options as buttons, plus a free
 * answer. Once answered, the card stays in the thread, frozen, with the chosen answer highlighted.
 */
export function AskUserCard({
	part,
	canAnswer,
	onAnswer
}: {
	part: ToolPart;
	/** False once the conversation moved on, or while a request is in flight. */
	canAnswer: boolean;
	onAnswer: (output: AskUserOutput) => void;
}) {
	if (part.state === "input-streaming")
		return (
			<p className="hud-pulse border-hud/40 border-l-2 pl-3 text-[10px] text-hud uppercase tracking-[0.2em]">
				Question en préparation…
			</p>
		);
	const answered =
		part.state === "output-available" ? ((part.output as AskUserOutput | undefined)?.answers ?? []) : null;
	return (
		<QuestionCard
			input={(part.input ?? {}) as Partial<AskUserInput>}
			answered={answered}
			open={answered === null && part.state === "input-available" && canAnswer}
			onAnswer={onAnswer}
		/>
	);
}

function QuestionCard({
	input,
	answered,
	open,
	onAnswer
}: {
	input: Partial<AskUserInput>;
	/** The answers given, or null while unanswered. */
	answered: string[] | null;
	open: boolean;
	onAnswer: (output: AskUserOutput) => void;
}) {
	const [picked, setPicked] = useState<string[]>([]);
	const options = input.options ?? [];
	const press = (label: string) =>
		input.multiple
			? setPicked((p) => (p.includes(label) ? p.filter((l) => l !== label) : [...p, label]))
			: onAnswer({ answers: [label] });
	const title = answered ? "Question" : open ? "L'assistant attend votre réponse" : "Question sans réponse";

	return (
		<fieldset
			className={`space-y-2.5 border border-hud/40 border-l-2 border-l-hud bg-hud/5 p-3 ${open ? "hud-glow-box" : ""}`}
			disabled={!open}
		>
			<legend className="sr-only">Question de l'assistant</legend>
			<p className="flex items-center gap-2 font-display text-[10px] text-hud uppercase tracking-[0.2em]">
				<span className={open ? "hud-pulse" : ""} aria-hidden>
					?
				</span>
				{title}
			</p>
			<p className="text-fg text-sm">{input.question}</p>

			{options.length > 0 && (
				<div className="grid gap-1.5 sm:grid-cols-2">
					{options.map((o) => (
						<OptionButton
							key={o.label}
							option={o}
							chosen={!!answered?.includes(o.label) || picked.includes(o.label)}
							dimmed={answered !== null}
							toggle={!!input.multiple}
							onPress={() => press(o.label)}
						/>
					))}
				</div>
			)}

			{answered && !options.some((o) => answered.includes(o.label)) && (
				<p className="border border-hud bg-hud/15 px-3 py-2 text-hud text-xs">✓ {answered.join(", ")}</p>
			)}

			{open && (
				<div className="flex flex-wrap items-center gap-2">
					{input.multiple && (
						<HudButton
							className="px-3 py-1.5 text-[10px]"
							isDisabled={picked.length === 0}
							onPress={() => onAnswer({ answers: picked })}
						>
							Valider ({picked.length})
						</HudButton>
					)}
					{input.allowFreeText !== false && (
						<FreeTextAnswer
							placeholder={options.length ? "Autre réponse…" : "Votre réponse…"}
							onAnswer={(value) => onAnswer({ answers: [value] })}
						/>
					)}
				</div>
			)}
		</fieldset>
	);
}
