import type { Device } from "@repo/shared";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type KeyboardEvent, useEffect, useRef, type WheelEvent } from "react";
import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { SparkIcon } from "@/components/assistant/spark-icon";
import { useSelectedDevice } from "@/hooks/use-plant";
import { useDeviceStore } from "@/stores/useDeviceStore";
import { GearIcon } from "./gear-icon";

const tabClass =
	"flex h-7 min-w-0 shrink-0 items-center gap-2 border px-3 font-display text-[10px] uppercase tracking-[0.2em]";
/** The open tab hides the strip's bottom line, like a browser tab. */
const activeTabClass = "relative z-10 border-hud/30 border-t-hud border-b-transparent bg-bg text-hud";
const inactiveTabClass = "relative border-transparent text-muted-fg hover:bg-hud/5 hover:text-fg";
const itemClass =
	"flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.15em] outline-none focus:bg-hud/15 focus:text-hud";

function DeviceDot({ device }: { device: Device }) {
	const color = device.state === "UNINITIALIZED" ? "var(--warn)" : device.online ? "var(--ok)" : "var(--crit)";
	return (
		<span
			className="size-1.5 shrink-0 rotate-45"
			style={{ background: color, boxShadow: `0 0 6px ${color}` }}
			aria-hidden
		/>
	);
}

const deviceStatusLabel = (d: Device) =>
	d.state === "UNINITIALIZED" ? "non initialisé" : d.online ? "en ligne" : "hors ligne";

/**
 * Strip under the navbar: the assistant (always there), the settings while they are open, then one tab
 * per cube.
 */
export function PageTabBar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const onAssistant = pathname.startsWith("/assistant");
	const onSettings = pathname.startsWith("/profile");

	return (
		<nav aria-label="Onglets" className="relative flex h-9 shrink-0 bg-bg/40 px-3">
			<span className="absolute inset-x-0 bottom-0 h-px bg-hud/20" aria-hidden />
			<AssistantTab active={onAssistant} />
			{onSettings && <SettingsTab />}
			<span className="mx-1.5 mb-2 w-px self-end bg-hud/20 h-4" aria-hidden />
			<CubeTabs onDashboard={!onAssistant && !onSettings} />
		</nav>
	);
}

function AssistantTab({ active }: { active: boolean }) {
	return (
		<Link
			to="/assistant"
			aria-current={active ? "page" : undefined}
			className={`${tabClass} ${active ? activeTabClass : inactiveTabClass} mt-auto outline-none focus-visible:ring-1 focus-visible:ring-hud`}
		>
			<SparkIcon className="size-3" />
			<span className="max-sm:sr-only">Assistant IA</span>
		</Link>
	);
}

function SettingsTab() {
	return (
		<div aria-current="page" className={`${tabClass} ${activeTabClass} mt-auto max-w-64`}>
			<GearIcon />
			<span className="truncate">Paramètres</span>
			<Link
				to="/"
				aria-label="Fermer les paramètres"
				className="-mr-1 ml-1 flex size-4 shrink-0 items-center justify-center text-muted-fg outline-none hover:text-fg focus-visible:ring-1 focus-visible:ring-hud"
			>
				<svg viewBox="0 0 16 16" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
					<path d="M4 4l8 8M12 4l-8 8" />
				</svg>
			</Link>
		</div>
	);
}

/** `onDashboard`: a cube tab only shows as open on the dashboard; elsewhere, clicking one goes back to it. */
function CubeTabs({ onDashboard }: { onDashboard: boolean }) {
	const { devices, device } = useSelectedDevice();
	const navigate = useNavigate();
	const pick = useDeviceStore((s) => s.select);
	const select = (id: string) => {
		pick(id);
		if (!onDashboard) navigate({ to: "/" });
	};
	const onDashboardRef = useRef(onDashboard);
	onDashboardRef.current = onDashboard;
	const openDialog = useDeviceStore((s) => s.openDialog);
	const scroller = useRef<HTMLDivElement>(null);
	const list = devices.data ?? [];

	// Keep the open tab in view (new cube, or picked while scrolled away).
	useEffect(() => {
		if (!device) return;
		scroller.current
			?.querySelector(`[data-device="${device.id}"]`)
			?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
	}, [device]);

	// A mouse wheel scrolls vertically: turn it into horizontal scrolling of the tabs.
	const onWheel = (e: WheelEvent<HTMLDivElement>) => {
		if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
	};

	/** Opens the cube `delta` tabs away (wrapping around) and moves the keyboard focus onto it. */
	const step = (delta: number) => {
		if (list.length === 0) return;
		const from = Math.max(
			0,
			list.findIndex((d) => d.id === device?.id)
		);
		const next = list[(from + delta + list.length) % list.length];
		select(next.id);
		scroller.current?.querySelector<HTMLElement>(`[data-device="${next.id}"] > button`)?.focus();
	};
	const stepRef = useRef(step);
	stepRef.current = step;

	// ← / → on the tabs, or anywhere when nothing has the focus (not while typing in a field).
	useEffect(() => {
		const onKey = (e: globalThis.KeyboardEvent) => {
			if (!onDashboardRef.current || document.activeElement !== document.body || e.altKey || e.ctrlKey || e.metaKey)
				return;
			if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				e.preventDefault();
				stepRef.current(e.key === "ArrowLeft" ? -1 : 1);
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const delta = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
		// Ignore keys bubbling up (through the React tree) from the tab menus' popovers.
		if (delta === undefined || !e.currentTarget.contains(e.target as Node)) return;
		e.preventDefault();
		step(delta);
	};

	if (!devices.isSuccess) return null;

	return (
		<>
			<div
				ref={scroller}
				role="toolbar"
				aria-label="Cubes (flèches gauche / droite pour changer)"
				onWheel={onWheel}
				onKeyDown={onKeyDown}
				className="flex min-w-0 items-end gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{list.map((d) => {
					const active = onDashboard && d.id === device?.id;
					return (
						<div
							key={d.id}
							data-device={d.id}
							className={`${tabClass} ${active ? activeTabClass : inactiveTabClass} max-w-56 pr-1`}
						>
							<Button
								onPress={() => select(d.id)}
								aria-current={active ? "page" : undefined}
								aria-label={`${d.name}, ${deviceStatusLabel(d)}`}
								// The ::after overlay stretches the click target over the whole tab.
								className="flex min-w-0 cursor-pointer items-center gap-2 uppercase outline-none after:absolute after:inset-0 focus-visible:after:ring-1 focus-visible:after:ring-hud"
							>
								<DeviceDot device={d} />
								<span className="truncate">{d.name}</span>
							</Button>
							<TabMenu
								device={d}
								onAction={(dialog) => {
									select(d.id); // the dialogs act on the open cube
									openDialog(dialog);
								}}
							/>
						</div>
					);
				})}
			</div>
			<Button
				onPress={() => openDialog("create")}
				aria-label="Nouveau cube"
				className="mb-1 ml-1 flex h-6 shrink-0 cursor-pointer items-center justify-center gap-1.5 self-end border border-hud/30 px-2 text-[10px] text-hud uppercase tracking-[0.15em] outline-none hover:border-hud/60 hover:bg-hud/10 focus-visible:ring-1 focus-visible:ring-hud"
			>
				<span aria-hidden className="text-sm leading-none">
					+
				</span>
				{list.length === 0 && "Nouveau cube"}
			</Button>
		</>
	);
}

function TabMenu({ device, onAction }: { device: Device; onAction: (dialog: "info" | "rename" | "delete") => void }) {
	return (
		<MenuTrigger>
			<Button
				aria-label={`Actions sur ${device.name}`}
				className="relative z-10 flex size-5 shrink-0 cursor-pointer items-center justify-center text-muted-fg outline-none hover:text-fg focus-visible:ring-1 focus-visible:ring-hud pressed:text-hud"
			>
				<svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden>
					<circle cx="3" cy="8" r="1.4" />
					<circle cx="8" cy="8" r="1.4" />
					<circle cx="13" cy="8" r="1.4" />
				</svg>
			</Button>
			<Popover
				placement="bottom start"
				offset={6}
				className="hud-panel min-w-44 bg-bg/95 outline-none entering:fade-in entering:animate-in exiting:fade-out exiting:animate-out"
			>
				<Menu className="py-1 outline-none" aria-label={`Actions sur ${device.name}`}>
					<MenuItem onAction={() => onAction("info")} className={`${itemClass} text-fg`}>
						<svg
							viewBox="0 0 16 16"
							className="size-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={1.6}
							aria-hidden
						>
							<circle cx="8" cy="8" r="6.2" />
							<path d="M8 7.2v4M8 4.8v.01" />
						</svg>
						Infos
					</MenuItem>
					<MenuItem onAction={() => onAction("rename")} className={`${itemClass} text-fg`}>
						<svg
							viewBox="0 0 16 16"
							className="size-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={1.6}
							aria-hidden
						>
							<path d="M10.5 2.5l3 3L6 13H3v-3z" />
						</svg>
						Renommer
					</MenuItem>
					<MenuItem
						onAction={() => onAction("delete")}
						className={`${itemClass} text-crit focus:bg-crit/10 focus:text-crit`}
					>
						<svg
							viewBox="0 0 16 16"
							className="size-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={1.6}
							aria-hidden
						>
							<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
						</svg>
						Supprimer
					</MenuItem>
				</Menu>
			</Popover>
		</MenuTrigger>
	);
}
