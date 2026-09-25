import { type Command, LAMP_COLOR_KEYS, LAMP_COLORS, type LampColor, toLampColor } from "@repo/shared";
import { useState } from "react";
import { Button, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, Switch } from "react-aria-components";
import { useLamp } from "@/hooks/use-plant";
import { HudButton } from "./hud-button";
import { HudModal } from "./hud-modal";
import { HudPanel } from "./panel";

interface LampPanelProps {
	deviceId: string;
	online: boolean;
	lampOn: boolean;
	lampColor: LampColor;
	/** The LAMP order in flight, if any. */
	active: Command | undefined;
	className?: string;
}

function lampStatus(online: boolean, lampOn: boolean, active: Command | undefined) {
	if (active) return active.lampOn ? "Allumage…" : "Extinction…";
	if (!online) return "Cube hors ligne";
	return lampOn ? "Lampe allumée" : "Lampe éteinte";
}

function ColorSwatch({ color, className = "size-3" }: { color: LampColor; className?: string }) {
	const hex = `#${LAMP_COLORS[color].rgb}`;
	return (
		<span
			className={`inline-block shrink-0 border border-fg/20 ${className}`}
			style={{ background: hex, boxShadow: `0 0 6px ${hex}` }}
			aria-hidden
		/>
	);
}

/** Grow lamp switch: shows the state confirmed by the cube, pulses while an order is in flight. */
export function LampPanel({ deviceId, online, lampOn, lampColor, active, className }: LampPanelProps) {
	const lamp = useLamp(deviceId);
	const [open, setOpen] = useState(false);
	const busy = !!active || lamp.isPending;
	const selected = active ? !!active.lampOn : lamp.isPending ? !!lamp.variables?.on : lampOn;

	return (
		<HudPanel
			title="Éclairage"
			className={className}
			bodyClassName="flex items-center px-2.5 py-1.5"
			actions={
				<HudButton className="px-2 py-0.5 text-[10px] tracking-[0.15em]" onPress={() => setOpen(true)}>
					Personnaliser
				</HudButton>
			}
		>
			<Switch
				isSelected={selected}
				isDisabled={!online || busy}
				onChange={(on) => lamp.mutate({ on })}
				className="group flex w-full cursor-pointer items-center gap-2 outline-none disabled:cursor-not-allowed"
			>
				<svg
					viewBox="0 0 16 16"
					className="size-4 shrink-0 text-muted-fg transition-colors group-selected:text-hud group-selected:drop-shadow-[0_0_4px_var(--hud)]"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.4}
					aria-hidden
				>
					<circle cx="8" cy="8" r="3" fill="currentColor" />
					<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" />
				</svg>
				<span
					className={`min-w-0 flex-1 truncate text-[11px] text-muted-fg uppercase tracking-widest group-selected:text-hud ${busy ? "hud-pulse" : ""}`}
				>
					{lampStatus(online, lampOn, active)}
				</span>
				<span
					className={`relative h-5 w-10 shrink-0 border border-hud/40 bg-bg transition-colors group-focus-visible:ring-2 group-focus-visible:ring-hud group-selected:border-hud group-selected:bg-hud/20 group-disabled:opacity-40 ${busy ? "hud-pulse" : ""}`}
					aria-hidden
				>
					<span className="absolute top-0.5 left-0.5 size-3.5 bg-muted-fg transition-transform duration-200 group-selected:translate-x-5 group-selected:bg-hud group-selected:shadow-[0_0_8px_var(--hud)]" />
				</span>
			</Switch>

			<HudModal title="Éclairage" code="LMP-01" isOpen={open} onOpenChange={setOpen} className="max-w-sm">
				{/* Remounted on every opening: starts from the colour the cube currently shows. */}
				{open && (
					<ColorForm
						initial={toLampColor(lampColor)}
						blocked={!online ? "Cube hors ligne" : active ? "Commande d'éclairage en cours" : null}
						isPending={lamp.isPending}
						onApply={(color) => lamp.mutate({ on: true, color }, { onSuccess: () => setOpen(false) })}
						onCancel={() => setOpen(false)}
					/>
				)}
			</HudModal>
		</HudPanel>
	);
}

function ColorForm({
	initial,
	blocked,
	isPending,
	onApply,
	onCancel
}: {
	initial: LampColor;
	blocked: string | null;
	isPending: boolean;
	onApply: (color: LampColor) => void;
	onCancel: () => void;
}) {
	const [color, setColor] = useState<LampColor>(initial);

	return (
		<div className="space-y-4">
			{blocked && (
				<p className="border border-warn/30 bg-warn/5 px-3 py-2 text-warn text-xs" role="status">
					⚠ {blocked} : changement de couleur indisponible.
				</p>
			)}
			<Select
				selectedKey={color}
				onSelectionChange={(key) => key && setColor(key as LampColor)}
				isDisabled={isPending}
				className="flex flex-col gap-1"
			>
				<Label className="text-[10px] text-muted-fg uppercase tracking-[0.2em]">Couleur du ruban</Label>
				<Button className="group flex h-9 cursor-pointer items-center gap-2 border border-hud/25 bg-hud/5 px-3 text-left font-data text-fg text-sm outline-none transition hover:border-hud/45 focus-visible:border-hud disabled:opacity-50">
					<SelectValue className="flex min-w-0 flex-1 items-center gap-2 truncate" />
					<svg
						viewBox="0 0 16 16"
						className="size-3 shrink-0 text-muted-fg transition-transform group-aria-expanded:rotate-180"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.8}
						aria-hidden
					>
						<path d="M4 6l4 4 4-4" />
					</svg>
				</Button>
				<Popover
					offset={4}
					className="hud-panel max-h-72 w-(--trigger-width) overflow-y-auto bg-bg/95 outline-none entering:fade-in entering:animate-in exiting:fade-out exiting:animate-out"
				>
					<ListBox className="py-1 outline-none">
						{LAMP_COLOR_KEYS.map((key) => (
							<ListBoxItem
								key={key}
								id={key}
								textValue={LAMP_COLORS[key].label}
								className="flex cursor-pointer items-center gap-2 px-3 py-2 text-fg text-xs outline-none focus:bg-hud/15 focus:text-hud selected:text-hud"
							>
								<ColorSwatch color={key} />
								{LAMP_COLORS[key].label}
							</ListBoxItem>
						))}
					</ListBox>
				</Popover>
			</Select>
			<p className="text-[11px] text-muted-fg">Appliquer allume la lampe dans cette couleur.</p>
			<div className="flex justify-end gap-2">
				<HudButton intent="ghost" onPress={onCancel}>
					Annuler
				</HudButton>
				<HudButton onPress={() => onApply(color)} isDisabled={!!blocked || isPending}>
					{isPending ? "Envoi…" : "Appliquer"}
				</HudButton>
			</div>
		</div>
	);
}
