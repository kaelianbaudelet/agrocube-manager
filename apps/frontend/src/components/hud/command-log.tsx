import { type Command, LAMP_COLORS, toLampColor } from "@repo/shared";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { HudPanel } from "./panel";
import { STATUS_COLOR, StatusIcon } from "./sensors";

const COMMAND_STATUS = {
	PENDING: { label: "En attente", status: "unknown" },
	SENT: { label: "En cours", status: "warning" },
	DONE: { label: "Terminé", status: "ok" },
	FAILED: { label: "Échec", status: "critical" }
} as const;

export const isActiveCommand = (c: Command) => c.status === "PENDING" || c.status === "SENT";

function commandLabel(c: Command) {
	if (c.type === "WATER") return `Arrosage ${(c.durationMs ?? 0) / 1000} s`;
	if (!c.lampOn) return "Lumière OFF";
	// toLampColor: an order may name a colour since removed from the palette.
	return c.lampColor ? `Lumière ON · ${LAMP_COLORS[toLampColor(c.lampColor)].label}` : "Lumière ON";
}

function completionToast(c: Command) {
	if (c.type === "WATER") {
		if (c.status === "DONE") toast.success(`Arrosage terminé (${(c.durationMs ?? 0) / 1000} s)`);
		else toast.error(`Arrosage échoué : ${c.error ?? "erreur inconnue"}`);
	} else if (c.status === "DONE") toast.success(c.lampOn ? "Lumière allumée" : "Lumière éteinte");
	else toast.error(`Éclairage : ${c.error ?? "erreur inconnue"}`);
}

/** Toasts when an order seen in flight completes. */
export function useCommandToasts(commands: Command[]) {
	const watched = useRef(new Set<string>());
	useEffect(() => {
		for (const c of commands) {
			if (isActiveCommand(c)) watched.current.add(c.id);
			else if (watched.current.delete(c.id)) completionToast(c);
		}
	}, [commands]);
}

const isToday = (d: Date) => d.toDateString() === new Date().toDateString();

function formatTime(iso: string) {
	const d = new Date(iso);
	const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
	return isToday(d) ? time : `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${time}`;
}

/** Every order sent to the cube, manual or scheduled, newest first. */
export function CommandLog({ commands, className }: { commands: Command[]; className?: string }) {
	return (
		<HudPanel
			title="Journal"
			className={className}
			actions={<span className="text-[9px] text-muted-fg tabular-nums">{commands.length}</span>}
			bodyClassName="p-0"
		>
			<ol className="absolute inset-0 space-y-px overflow-y-auto p-2 text-[10px]" aria-label="Historique des ordres">
				{commands.length === 0 && <li className="text-muted-fg">Aucun ordre envoyé.</li>}
				{commands.map((c) => {
					const s = COMMAND_STATUS[c.status];
					return (
						<li key={c.id} className="flex items-center gap-1.5 py-0.5 text-muted-fg">
							<span style={{ color: STATUS_COLOR[s.status] }}>
								<StatusIcon status={s.status} />
							</span>
							<span className="shrink-0 tabular-nums">{formatTime(c.createdAt)}</span>
							<span className="shrink-0 text-fg uppercase">{commandLabel(c)}</span>
							{c.scheduleId && (
								<span
									className="shrink-0 border border-hud/40 px-1 text-[8px] text-hud tracking-widest"
									title="Arrosage programmé"
								>
									AUTO
								</span>
							)}
							<span className="ml-auto truncate pl-1 uppercase" title={c.error ?? undefined}>
								{c.error ?? s.label}
							</span>
						</li>
					);
				})}
			</ol>
		</HudPanel>
	);
}
