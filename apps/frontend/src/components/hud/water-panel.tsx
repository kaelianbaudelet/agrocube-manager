import { type Command, WATER_DURATION } from "@repo/shared";
import { useEffect, useState } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { commandStartedAt, useSchedules, useWater } from "@/hooks/use-plant";
import { DurationSlider } from "./duration-slider";
import { HudButton } from "./hud-button";
import { HudModal } from "./hud-modal";
import { HudPanel } from "./panel";
import { formatRunDate, nextRun } from "./schedule-format";
import { ScheduleTab } from "./schedule-tab";

interface WaterPanelProps {
	deviceId: string;
	deviceName: string;
	online: boolean;
	/** The WATER order in flight, if any. */
	active: Command | undefined;
	waterLevel: number | null;
	className?: string;
}

/** Milliseconds left on the pump run, updated every 100 ms while it runs. */
function useRemaining(active: Command | undefined) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		setNow(Date.now());
		const id = setInterval(() => setNow(Date.now()), 100);
		return () => clearInterval(id);
	}, [active]);
	if (!active) return 0;
	return Math.max(0, commandStartedAt(active) + (active.durationMs ?? 0) - now);
}

/** Why a manual run cannot be started right now; null when it can. */
function blockedReason(online: boolean, emptyTank: boolean, active: Command | undefined) {
	if (active) return "Arrosage en cours";
	if (!online) return "Cube hors ligne";
	if (emptyTank) return "Réservoir vide";
	return null;
}

export function WaterPanel({ deviceId, deviceName, online, active, waterLevel, className }: WaterPanelProps) {
	const schedules = useSchedules(deviceId);
	const [open, setOpen] = useState(false);
	const remaining = useRemaining(active);
	const progress = active?.durationMs ? 1 - remaining / active.durationMs : 0;
	const upcoming = nextRun(schedules.data ?? []);
	const blocked = blockedReason(online, waterLevel !== null && waterLevel < 5, active);

	return (
		<HudPanel
			title="Arrosage"
			className={className}
			bodyClassName="flex flex-col justify-center gap-1 px-2.5 py-1.5"
			actions={
				<HudButton className="px-2 py-0.5 text-[10px] tracking-[0.15em]" onPress={() => setOpen(true)}>
					Arroser
				</HudButton>
			}
		>
			<div className="flex items-center gap-2">
				<svg
					viewBox="0 0 16 16"
					className={`size-4 shrink-0 ${active ? "text-hud drop-shadow-[0_0_4px_var(--hud)]" : "text-muted-fg"}`}
					fill="currentColor"
					aria-hidden
				>
					<path d="M8 1.5C8 1.5 3 7.2 3 10.3a5 5 0 0010 0C13 7.2 8 1.5 8 1.5z" />
				</svg>
				{active ? (
					<>
						<span className="hud-pulse text-[11px] text-hud uppercase tracking-widest">
							{remaining > 0 ? "Pompe active" : "Confirmation…"}
						</span>
						<span className="ml-auto font-display text-hud text-lg tabular-nums leading-none hud-glow" aria-hidden>
							{(remaining / 1000).toFixed(1)}
							<span className="ml-0.5 text-[10px]">s</span>
						</span>
					</>
				) : (
					<span className="text-[11px] text-muted-fg uppercase tracking-widest">
						{online ? "Pompe à l'arrêt" : "Cube hors ligne"}
					</span>
				)}
			</div>
			<p className="truncate text-[10px] text-muted-fg">
				{upcoming?.nextRunAt ? (
					<>
						Prochain : <span className="text-fg">{formatRunDate(upcoming.nextRunAt)}</span>
					</>
				) : (
					"Aucune programmation"
				)}
			</p>
			{active && (
				<span
					className="absolute bottom-0 left-0 h-0.5 bg-hud shadow-[0_0_6px_var(--hud)] transition-[width] duration-100 ease-linear"
					style={{ width: `${progress * 100}%` }}
					aria-hidden
				/>
			)}

			<HudModal title="Arrosage" code={deviceName} isOpen={open} onOpenChange={setOpen} className="max-w-lg">
				<Tabs className="space-y-4">
					<TabList aria-label="Mode d'arrosage" className="grid grid-cols-2 border-hud/20 border-b">
						{[
							{ id: "manual", label: "Manuel" },
							{ id: "schedule", label: "Programmation" }
						].map((t) => (
							<Tab
								key={t.id}
								id={t.id}
								className="-mb-px cursor-pointer border-transparent border-b-2 py-2 text-center font-display text-[11px] text-muted-fg uppercase tracking-[0.2em] outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-hud selected:border-hud selected:text-hud"
							>
								{t.label}
							</Tab>
						))}
					</TabList>
					<TabPanel id="manual" className="outline-none">
						<ManualWatering
							deviceId={deviceId}
							blocked={blocked}
							onLaunched={() => setOpen(false)}
							onCancel={() => setOpen(false)}
						/>
					</TabPanel>
					<TabPanel id="schedule" className="outline-none">
						<ScheduleTab deviceId={deviceId} />
					</TabPanel>
				</Tabs>
			</HudModal>
		</HudPanel>
	);
}

function ManualWatering({
	deviceId,
	blocked,
	onLaunched,
	onCancel
}: {
	deviceId: string;
	blocked: string | null;
	onLaunched: () => void;
	onCancel: () => void;
}) {
	const water = useWater(deviceId);
	const [duration, setDuration] = useState<number>(WATER_DURATION.default);

	return (
		<div className="space-y-4">
			{blocked && (
				<p className="border border-warn/30 bg-warn/5 px-3 py-2 text-warn text-xs" role="status">
					⚠ {blocked} : arrosage manuel indisponible.
				</p>
			)}
			<DurationSlider value={duration} onChange={setDuration} isDisabled={water.isPending} />
			<div className="flex justify-end gap-2">
				<HudButton intent="ghost" onPress={onCancel}>
					Annuler
				</HudButton>
				<HudButton
					onPress={() => water.mutate(duration, { onSuccess: onLaunched })}
					isDisabled={!!blocked || water.isPending}
					className="whitespace-nowrap"
				>
					{water.isPending ? "Envoi…" : "Lancer l'arrosage"}
				</HudButton>
			</div>
		</div>
	);
}
