import {
	type Device,
	READING_RANGES,
	type ReadingRange,
	SENSOR_KEYS,
	type SensorKey,
	type SensorReading,
	type SensorStatus,
	sensorStatus
} from "@repo/shared";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { CommandLog, isActiveCommand, useCommandToasts } from "@/components/hud/command-log";
import { HudButton } from "@/components/hud/hud-button";
import { LampPanel } from "@/components/hud/lamp-panel";
import { MetricCard } from "@/components/hud/metric-card";
import { HudPanel } from "@/components/hud/panel";
import { PlantCube } from "@/components/hud/plant-cube";
import { SENSORS, StatusChip, worstStatus } from "@/components/hud/sensors";
import { TelemetryChart } from "@/components/hud/telemetry-chart";
import { WaterPanel } from "@/components/hud/water-panel";
import { PageLoader } from "@/components/page-loader";
import { useCommands, useLinkUp, useNow, useReadings, useSelectedDevice } from "@/hooks/use-plant";
import { useDeviceStore } from "@/stores/useDeviceStore";

export const Route = createFileRoute("/_app/")({
	component: DashboardPage
});

const RANGE_LABEL: Record<ReadingRange, string> = { "1h": "1H", "24h": "24H", "7d": "7J" };

const tabClass =
	"cursor-pointer px-1.5 py-0.5 text-[10px] text-muted-fg tracking-widest outline-none hover:text-fg focus-visible:ring-1 focus-visible:ring-hud selected:bg-hud/15 selected:text-hud";

function ago(now: number, iso: string | null | undefined) {
	if (!iso) return "jamais";
	const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
	if (s < 60) return `il y a ${s} s`;
	if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
	return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function Readout({ label, value, color }: { label: string; value: string; color?: string }) {
	return (
		<p className="flex items-center gap-1.5 whitespace-nowrap">
			<span className="text-muted-fg">{label}</span>
			<span style={{ color: color ?? "var(--fg)" }}>{value}</span>
		</p>
	);
}

function CenteredMessage({ title, children }: { title: string; children?: React.ReactNode }) {
	return (
		<div className="flex h-full items-center justify-center p-4">
			<HudPanel
				title={title}
				className="w-full max-w-md"
				bodyClassName="space-y-2 p-4 text-muted-fg text-xs leading-relaxed"
			>
				{children}
			</HudPanel>
		</div>
	);
}

/** The cube reported before but stopped streaming (a never-initialised cube is not "lost"). */
const signalLost = (device: Device) => !device.online && device.state !== "UNINITIALIZED";

function CubeStatus({
	uninitialized,
	offline,
	overall
}: {
	uninitialized: boolean;
	offline: boolean;
	overall: SensorStatus;
}) {
	if (uninitialized) return <StatusChip status="unknown" label="Non initialisé" />;
	if (offline) return <StatusChip status="critical" label="Signal perdu" />;
	return <StatusChip status={overall} />;
}

function DashboardPage() {
	const linkUp = useLinkUp();
	const now = useNow();
	const { devices, device } = useSelectedDevice();
	const openDialog = useDeviceStore((s) => s.openDialog);

	const [sensor, setSensor] = useState<SensorKey>("temperature");
	const [range, setRange] = useState<ReadingRange>("1h");
	const readings = useReadings(device?.id, range);
	const commands = useCommands(device?.id);
	const commandList = commands.data ?? [];
	useCommandToasts(commandList);

	if (devices.isPending) return <PageLoader label="CHARGEMENT DU MODULE DE CULTURE" />;
	if (devices.isError)
		return (
			<CenteredMessage title="Erreur de liaison">
				<p>Impossible de joindre l'API : {devices.error.message}</p>
			</CenteredMessage>
		);
	if (!device)
		return (
			<CenteredMessage title="Aucun cube enregistré">
				<p>Enregistre ton premier cube : une clé d'accès sera générée pour la carte.</p>
				<div className="flex justify-end pt-2">
					<HudButton onPress={() => openDialog("create")}>+ Nouveau cube</HudButton>
				</div>
			</CenteredMessage>
		);

	const uninitialized = device.state === "UNINITIALIZED";
	const offline = signalLost(device);
	// Signal lost: the last frame no longer reflects the cube, so nothing downstream shows it.
	const reading: SensorReading | null = offline ? null : device.latestReading;
	const overall = worstStatus(SENSOR_KEYS.map((k) => sensorStatus(k, reading?.[k])));
	const activeWater = commandList.find((c) => c.type === "WATER" && isActiveCommand(c));
	const activeLamp = commandList.find((c) => c.type === "LAMP" && isActiveCommand(c));
	const pumping = activeWater?.status === "SENT";

	return (
		<div className="h-full overflow-y-auto p-2 sm:overflow-hidden">
			<div className="grid grid-cols-2 gap-2 sm:h-full sm:grid-cols-[1fr_1.4fr_1fr] sm:grid-rows-[minmax(0,1.45fr)_minmax(0,1fr)]">
				<div className="flex min-h-0 flex-col gap-2 max-sm:contents">
					<MetricCard sensor="temperature" reading={reading} offline={offline} />
					<MetricCard sensor="soilMoisture" reading={reading} offline={offline} />
				</div>

				<HudPanel
					title={device.name}
					className="col-span-2 max-sm:order-first max-sm:h-[45vh] sm:col-span-1"
					actions={<CubeStatus uninitialized={uninitialized} offline={offline} overall={overall} />}
					bodyClassName="flex flex-col p-1"
				>
					<div className="min-h-0 flex-1">
						<PlantCube
							reading={reading}
							online={device.online}
							pumping={pumping}
							lampOn={device.lampOn}
							uninitialized={uninitialized}
						/>
					</div>
					<div className="flex shrink-0 flex-wrap justify-center gap-x-4 gap-y-0.5 px-1 text-[10px] uppercase tracking-wider">
						<Readout
							label="Cube"
							value={uninitialized ? "Non initialisé" : device.online ? "En ligne" : "Hors ligne"}
							color={uninitialized ? "var(--warn)" : device.online ? "var(--ok)" : "var(--crit)"}
						/>
						<Readout label="Trame" value={ago(now, device.lastSeenAt)} />
						<Readout label="Flux" value={linkUp ? "Actif" : "Coupé"} color={linkUp ? "var(--ok)" : "var(--warn)"} />
					</div>
				</HudPanel>

				<div className="flex min-h-0 flex-col gap-2 max-sm:contents">
					<MetricCard sensor="waterLevel" reading={reading} offline={offline} />
					<MetricCard sensor="light" reading={reading} offline={offline} />
				</div>

				<div className="col-span-2 grid gap-2 sm:col-span-3 sm:min-h-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.95fr)_minmax(0,1fr)]">
					<HudPanel
						title="Historique"
						titleClassName="sm:max-lg:sr-only"
						className="max-sm:h-64"
						actions={
							<>
								<ToggleButtonGroup
									aria-label="Capteur"
									selectionMode="single"
									disallowEmptySelection
									selectedKeys={[sensor]}
									onSelectionChange={(keys) => setSensor([...keys][0] as SensorKey)}
									className="flex"
								>
									{SENSOR_KEYS.map((k) => (
										<ToggleButton key={k} id={k} className={tabClass}>
											{SENSORS[k].short}
										</ToggleButton>
									))}
								</ToggleButtonGroup>
								<span className="h-3 w-px bg-hud/30" aria-hidden />
								<ToggleButtonGroup
									aria-label="Période"
									selectionMode="single"
									disallowEmptySelection
									selectedKeys={[range]}
									onSelectionChange={(keys) => setRange([...keys][0] as ReadingRange)}
									className="flex"
								>
									{READING_RANGES.map((r) => (
										<ToggleButton key={r} id={r} className={tabClass}>
											{RANGE_LABEL[r]}
										</ToggleButton>
									))}
								</ToggleButtonGroup>
							</>
						}
					>
						<TelemetryChart sensor={sensor} range={range} readings={readings.data ?? []} live={reading} now={now} />
					</HudPanel>

					<div className="flex flex-col gap-2 sm:min-h-0">
						<WaterPanel
							deviceId={device.id}
							deviceName={device.name}
							online={device.online}
							active={activeWater}
							waterLevel={reading?.waterLevel ?? null}
							className="flex-1 max-sm:h-24"
						/>
						<LampPanel
							deviceId={device.id}
							online={device.online}
							lampOn={device.lampOn}
							lampColor={device.lampColor}
							active={activeLamp}
							className="flex-1 max-sm:h-20"
						/>
					</div>

					<CommandLog commands={commandList} className="max-sm:h-64" />
				</div>
			</div>
		</div>
	);
}
