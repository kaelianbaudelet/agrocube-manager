import { type Device, LAMP_COLORS, SENSOR_KEYS, sensorStatus, toLampColor } from "@repo/shared";
import { type ReactNode, useState } from "react";
import { Button } from "react-aria-components";
import { useNow } from "@/hooks/use-plant";
import { HudButton } from "./hud-button";
import { formatValue, SENSORS, STATUS_COLOR } from "./sensors";

const dateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "medium" });

function ago(now: number, iso: string) {
	const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
	if (s < 60) return `il y a ${s} s`;
	if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
	if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
	return `il y a ${Math.floor(s / 86_400)} j`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[8.5rem_1fr] items-baseline gap-3 border-hud/10 border-b py-2 last:border-b-0">
			<dt className="text-[10px] text-muted-fg uppercase tracking-[0.18em]">{label}</dt>
			<dd className="min-w-0 text-fg text-xs">{children}</dd>
		</div>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-1">
			<h3 className="flex items-center gap-2 font-display text-[10px] text-hud uppercase tracking-[0.2em]">
				<span className="size-1.5 rotate-45 bg-hud" aria-hidden />
				{title}
			</h3>
			<dl className="border border-hud/15 bg-hud/5 px-3">{children}</dl>
		</section>
	);
}

function CopyableId({ id }: { id: string }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(id);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// No clipboard outside a secure context: the id stays selectable by hand.
		}
	};
	return (
		<span className="flex min-w-0 items-center gap-2">
			<code className="min-w-0 select-all break-all font-data text-hud">{id}</code>
			<Button
				onPress={copy}
				aria-label="Copier l'identifiant"
				className="shrink-0 cursor-pointer border border-hud/25 px-1.5 py-0.5 text-[9px] text-muted-fg uppercase tracking-widest outline-none hover:border-hud/60 hover:text-hud focus-visible:ring-1 focus-visible:ring-hud"
			>
				{copied ? "Copié" : "Copier"}
			</Button>
		</span>
	);
}

/** Read-only sheet of a cube: identity, connection, last frame, lamp. Never shows its key. */
export function DeviceInfo({ device, onDone }: { device: Device; onDone: () => void }) {
	const now = useNow();
	const reading = device.latestReading;
	const initialized = device.state === "ACTIVE";
	const statusColor = !initialized ? "var(--warn)" : device.online ? "var(--ok)" : "var(--crit)";
	const lamp = LAMP_COLORS[toLampColor(device.lampColor)];

	return (
		<div className="space-y-4">
			<Section title="Identité">
				<Row label="Nom">{device.name}</Row>
				<Row label="Identifiant">
					<CopyableId id={device.id} />
				</Row>
				<Row label="Ajouté le">{dateTime(device.createdAt)}</Row>
			</Section>

			<Section title="Connexion">
				<Row label="État">
					<span className="flex items-center gap-2" style={{ color: statusColor }}>
						<span className="size-1.5 rotate-45" style={{ background: statusColor }} aria-hidden />
						{!initialized ? "Non initialisé" : device.online ? "En ligne" : "Hors ligne"}
					</span>
				</Row>
				<Row label="Initialisé le">{device.initializedAt ? dateTime(device.initializedAt) : "Jamais"}</Row>
				<Row label="Dernière activité">
					{device.lastSeenAt ? (
						<>
							{dateTime(device.lastSeenAt)}{" "}
							<span className="text-muted-fg">({device.online ? "en ce moment" : ago(now, device.lastSeenAt)})</span>
						</>
					) : (
						"Jamais connecté"
					)}
				</Row>
			</Section>

			<Section title="Dernière trame">
				{reading ? (
					<>
						<Row label="Reçue le">
							{dateTime(reading.recordedAt)} <span className="text-muted-fg">({ago(now, reading.recordedAt)})</span>
						</Row>
						{SENSOR_KEYS.map((key) => {
							const meta = SENSORS[key];
							const value = reading[key];
							return (
								<Row key={key} label={meta.label}>
									<span style={{ color: value === null ? undefined : STATUS_COLOR[sensorStatus(key, value)] }}>
										{formatValue(meta, value)}
										{value !== null && ` ${meta.unit}`}
									</span>
								</Row>
							);
						})}
					</>
				) : (
					<Row label="Reçue le">Aucune trame reçue</Row>
				)}
			</Section>

			<Section title="Éclairage">
				<Row label="Lampe">{device.lampOn ? "Allumée" : "Éteinte"}</Row>
				<Row label="Couleur">
					<span className="flex items-center gap-2">
						<span
							className="size-2.5 border border-fg/20"
							style={{ background: `#${lamp.rgb}`, boxShadow: `0 0 6px #${lamp.rgb}` }}
							aria-hidden
						/>
						{lamp.label}
					</span>
				</Row>
			</Section>

			<div className="flex justify-end">
				<HudButton intent="ghost" onPress={onDone}>
					Fermer
				</HudButton>
			</div>
		</div>
	);
}
