import { ASSISTANT_ACTION_TOOLS, type AssistantActionTool } from "@repo/shared";
import type { UIMessage } from "ai";
import { useState } from "react";
import { Button } from "react-aria-components";
import { HudButton } from "@/components/hud/hud-button";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export const isActionPart = (part: UIMessage["parts"][number]) =>
	part.type.startsWith("tool-") && part.type.slice("tool-".length) in ASSISTANT_ACTION_TOOLS;

type Tone = "hud" | "ok" | "crit" | "muted";
const TONE: Record<Tone, string> = {
	hud: "border-hud/50 border-l-hud",
	ok: "border-ok/40 border-l-ok",
	crit: "border-crit/40 border-l-crit",
	muted: "border-hud/15 border-l-muted-fg"
};
const TEXT: Record<Tone, string> = { hud: "text-hud", ok: "text-ok", crit: "text-crit", muted: "text-muted-fg" };

function Frame({ tone, badge, children }: { tone: Tone; badge: string; children: React.ReactNode }) {
	return (
		<div className={`space-y-2 border border-l-2 bg-hud/5 p-3 ${TONE[tone]} ${tone === "hud" ? "hud-glow-box" : ""}`}>
			<p className={`font-display text-[10px] uppercase tracking-[0.2em] ${TEXT[tone]}`}>{badge}</p>
			{children}
		</div>
	);
}

/** The new cube's key: shown once, here only (the model never sees it). */
function CubeKey({ keyValue }: { keyValue: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="space-y-1.5 border border-warn/40 bg-warn/5 p-2.5">
			<p className="text-[11px] text-warn">Clé d'accès du cube : notez-la, elle ne sera plus jamais affichée.</p>
			<div className="flex items-center gap-2">
				<code className="min-w-0 flex-1 select-all break-all font-data text-fg text-xs">{keyValue}</code>
				<Button
					onPress={async () => {
						try {
							await navigator.clipboard.writeText(keyValue);
							setCopied(true);
						} catch {
							// No clipboard outside a secure context: the key stays selectable.
						}
					}}
					className="shrink-0 cursor-pointer border border-hud/30 px-2 py-1 text-[10px] text-muted-fg uppercase tracking-widest outline-none hover:border-hud/60 hover:text-hud focus-visible:ring-1 focus-visible:ring-hud"
				>
					{copied ? "Copiée" : "Copier"}
				</Button>
			</div>
		</div>
	);
}

function ApprovalButtons({ canRespond, onRespond }: { canRespond: boolean; onRespond: (approved: boolean) => void }) {
	if (!canRespond) return <p className="text-[11px] text-muted-fg">Sans réponse : action non exécutée.</p>;
	return (
		<div className="flex gap-2">
			<HudButton className="px-3 py-1.5 text-[10px]" onPress={() => onRespond(true)}>
				Approuver
			</HudButton>
			<HudButton intent="ghost" className="px-3 py-1.5 text-[10px]" onPress={() => onRespond(false)}>
				Refuser
			</HudButton>
		</div>
	);
}

/** Outcome of an executed action; orders to the cube report whether it acknowledged them. */
function ActionResult({ title, summary, output }: { title: string; summary: React.ReactNode; output: unknown }) {
	const result = (output ?? {}) as { statut?: string; erreur?: string | null; cle?: string };
	const failed = result.statut === "échec";
	const pending = result.statut === "en cours" || result.statut === "en attente";
	const tone: Tone = failed ? "crit" : pending ? "hud" : "ok";
	const outcome = failed ? "échec" : pending ? "sans confirmation du cube" : "effectué";
	return (
		<Frame tone={tone} badge={`${title} · ${outcome}`}>
			{summary}
			{failed && result.erreur && <p className="text-crit text-xs">{result.erreur}</p>}
			{result.cle && <CubeKey keyValue={result.cle} />}
		</Frame>
	);
}

/**
 * An action proposed by the assistant (waterNow, setLamp, createSchedule…). Nothing runs before the
 * user approves it here; the card then follows the execution and shows its real outcome.
 */
export function ActionCard({
	part,
	canRespond,
	onRespond
}: {
	part: ToolPart;
	/** False once the conversation moved on, or while a request is in flight. */
	canRespond: boolean;
	onRespond: (approvalId: string, approved: boolean) => void;
}) {
	const title = ASSISTANT_ACTION_TOOLS[part.type.slice("tool-".length) as AssistantActionTool];
	const reason = part.approval?.requestReason;
	const summary = <p className="text-fg text-sm">{reason ?? title}</p>;

	switch (part.state) {
		case "input-streaming":
		case "input-available":
			return (
				<p className="hud-pulse border-hud/40 border-l-2 pl-3 text-[10px] text-hud uppercase tracking-[0.2em]">
					{title} : préparation…
				</p>
			);
		case "approval-requested":
			return (
				<Frame tone="hud" badge={`Action proposée · ${title}`}>
					{summary}
					<ApprovalButtons canRespond={canRespond} onRespond={(approved) => onRespond(part.approval.id, approved)} />
				</Frame>
			);
		case "approval-responded":
			return part.approval.approved ? (
				<Frame tone="hud" badge={`${title} · approuvé`}>
					{summary}
					<p className="hud-pulse text-[10px] text-hud uppercase tracking-[0.2em]">Exécution…</p>
				</Frame>
			) : (
				<Frame tone="muted" badge={`${title} · refusé`}>
					{summary}
				</Frame>
			);
		case "output-denied":
			return (
				<Frame tone="muted" badge={`${title} · non exécuté`}>
					{summary}
					{part.approval.reason && <p className="text-[11px] text-muted-fg">{part.approval.reason}</p>}
				</Frame>
			);
		case "output-error":
			return (
				<Frame tone="crit" badge={`${title} · échec`}>
					{summary}
					<p className="text-crit text-xs">{part.errorText}</p>
				</Frame>
			);
		case "output-available":
			return <ActionResult title={title} summary={summary} output={part.output} />;
	}
}
