import { type Device, DeviceNameSchema } from "@repo/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { useCreateDevice, useDeleteDevice, useRenameDevice, useSelectedDevice } from "@/hooks/use-plant";
import { copyText } from "@/lib/clipboard";
import { validate } from "@/lib/form";
import { useDeviceStore } from "@/stores/useDeviceStore";
import { DeviceInfo } from "./device-info";
import { HudButton } from "./hud-button";
import { HudModal } from "./hud-modal";

/**
 * The create / info / rename / delete dialogs, mounted once in the app layout and driven by useDeviceStore.
 */
export function DeviceDialogs() {
	const dialog = useDeviceStore((s) => s.dialog);
	const openDialog = useDeviceStore((s) => s.openDialog);
	const { device } = useSelectedDevice();
	const [locked, setLocked] = useState(false);
	const close = (open: boolean) => {
		if (!open) {
			openDialog(null);
			setLocked(false);
		}
	};

	return (
		<>
			<HudModal
				title="Nouveau cube"
				code="PROVISION"
				isOpen={dialog === "create"}
				onOpenChange={close}
				isLocked={locked}
				className="max-w-xl"
			>
				<CreateDevice onLock={setLocked} onDone={() => close(false)} />
			</HudModal>
			{device && (
				<>
					<HudModal title="Infos du cube" code={device.name} isOpen={dialog === "info"} onOpenChange={close}>
						<DeviceInfo device={device} onDone={() => close(false)} />
					</HudModal>
					<HudModal title="Renommer le cube" code={device.name} isOpen={dialog === "rename"} onOpenChange={close}>
						<RenameDevice device={device} onDone={() => close(false)} />
					</HudModal>
					<HudModal title="Supprimer le cube" code={device.name} isOpen={dialog === "delete"} onOpenChange={close}>
						<DeleteDevice device={device} onDone={() => close(false)} />
					</HudModal>
				</>
			)}
		</>
	);
}

// ---- create -----------------------------------------------------------------

type Line = { text: string; tone: "ok" | "crit" | "muted" | "warn" } | { key: string };

const TONE = { ok: "text-ok", crit: "text-crit", muted: "text-muted-fg", warn: "text-warn" } as const;

/** Types `text` one character at a time once `start` is true. */
function useTypewriter(text: string, start: boolean, msPerChar = 28) {
	const [count, setCount] = useState(0);
	useEffect(() => {
		if (!start) return;
		setCount(0);
		const id = setInterval(() => setCount((c) => (c >= text.length ? c : c + 1)), msPerChar);
		return () => clearInterval(id);
	}, [text, start, msPerChar]);
	return { typed: text.slice(0, count), done: start && count >= text.length };
}

function CreateDevice({ onLock, onDone }: { onLock: (locked: boolean) => void; onDone: () => void }) {
	const create = useCreateDevice();
	const [name, setName] = useState("");
	const [error, setError] = useState<string>();
	const [submitted, setSubmitted] = useState("");
	const [shown, setShown] = useState(0);
	const [copied, setCopied] = useState<string>();
	const keyRef = useRef<HTMLSpanElement>(null);

	const { typed, done: typedAll } = useTypewriter(`Initialisation du cube « ${submitted} »…`, !!submitted);

	const lines: Line[] = create.isSuccess
		? [
				{ text: "Génération d'une clé d'accès sécurisée…", tone: "muted" },
				{ text: `✓ Cube « ${create.data.device.name} » enregistré`, tone: "ok" },
				{ text: "Copiez cette clé pour la définir sur votre cube :", tone: "muted" },
				{ key: create.data.key },
				{ text: "⚠ Pour votre sécurité, elle ne sera plus affichée après fermeture.", tone: "warn" }
			]
		: create.isError
			? [{ text: `✗ Échec : ${create.error.message}`, tone: "crit" }]
			: [];

	// Reveal the output line by line, once the command is fully typed and the API has answered.
	useEffect(() => {
		if (!typedAll || shown >= lines.length) return;
		const id = setTimeout(() => setShown((n) => n + 1), 280);
		return () => clearTimeout(id);
	}, [typedAll, shown, lines.length]);

	const finished = typedAll && lines.length > 0 && shown >= lines.length;
	useEffect(() => onLock(!!submitted && !finished), [submitted, finished, onLock]);

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const { data, errors } = validate(DeviceNameSchema, { name });
		setError(errors?.name);
		if (!data) return;
		setSubmitted(data.name);
		setShown(0);
		create.mutate(data.name);
	}

	function retry() {
		create.reset();
		setSubmitted("");
		setShown(0);
	}

	if (!submitted)
		return (
			<form onSubmit={onSubmit} noValidate className="space-y-4">
				<p className="text-muted-fg text-xs">
					Donnez un nom à votre cube : une clé d'accès unique sera générée pour le connecter.
				</p>
				<FormField label="Nom du cube" name="name" value={name} onChange={setName} error={error} />
				<div className="flex justify-end">
					<HudButton type="submit">Initialiser</HudButton>
				</div>
			</form>
		);

	return (
		<div className="space-y-4">
			<div
				className="min-h-44 border border-hud/20 bg-black/40 p-3 font-data text-[12px] leading-relaxed"
				aria-live="polite"
			>
				<p className="text-fg">
					<span className="text-hud">&gt; </span>
					{typed}
					{!typedAll && <span className="hud-pulse">▌</span>}
				</p>
				{typedAll &&
					lines.slice(0, shown).map((line, i) =>
						"key" in line ? (
							<p key={i} className="my-2 flex flex-wrap items-center gap-2">
								<span
									ref={keyRef}
									className="break-all border border-hud/50 bg-hud/10 px-2 py-1 text-hud tracking-wider hud-glow select-all"
								>
									{line.key}
								</span>
							</p>
						) : (
							<p key={i} className={`break-all ${TONE[line.tone]}`}>
								{line.text}
							</p>
						)
					)}
				{typedAll && !finished && <span className="hud-pulse text-hud">▌</span>}
			</div>

			{finished && create.isSuccess && (
				<div className="flex flex-wrap items-center justify-end gap-2">
					{copied && <span className="mr-auto text-[11px] text-ok">{copied}</span>}
					<HudButton intent="ghost" onPress={async () => setCopied(await copyText(create.data.key, keyRef.current))}>
						Copier la clé
					</HudButton>
					<HudButton onPress={onDone}>J'ai noté la clé</HudButton>
				</div>
			)}
			{finished && create.isError && (
				<div className="flex justify-end">
					<HudButton intent="ghost" onPress={retry}>
						Réessayer
					</HudButton>
				</div>
			)}
		</div>
	);
}

// ---- rename -----------------------------------------------------------------

function RenameDevice({ device, onDone }: { device: Device; onDone: () => void }) {
	const rename = useRenameDevice();
	const [name, setName] = useState(device.name);
	const [error, setError] = useState<string>();

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const { data, errors } = validate(DeviceNameSchema, { name });
		setError(errors?.name);
		if (data) rename.mutate({ id: device.id, name: data.name }, { onSuccess: onDone });
	}

	return (
		<form onSubmit={onSubmit} noValidate className="space-y-4">
			<FormField label="Nom du cube" name="name" value={name} onChange={setName} error={error} />
			<div className="flex justify-end gap-2">
				<HudButton intent="ghost" onPress={onDone}>
					Annuler
				</HudButton>
				<HudButton type="submit" isDisabled={rename.isPending}>
					{rename.isPending ? "Enregistrement…" : "Enregistrer"}
				</HudButton>
			</div>
		</form>
	);
}

// ---- delete -----------------------------------------------------------------

function DeleteDevice({ device, onDone }: { device: Device; onDone: () => void }) {
	const remove = useDeleteDevice();
	return (
		<div className="space-y-4">
			<p className="text-fg text-sm">
				Supprimer <span className="text-hud">« {device.name} »</span> ?
			</p>
			<ul className="space-y-1 border border-crit/30 bg-crit/5 p-3 text-crit text-xs">
				<li>▸ Tout l'historique des capteurs et des commandes sera effacé.</li>
				<li>▸ La clé est révoquée : la carte sera déconnectée et ne pourra plus se reconnecter.</li>
				<li>▸ Action irréversible.</li>
			</ul>
			<div className="flex justify-end gap-2">
				<HudButton intent="ghost" onPress={onDone}>
					Annuler
				</HudButton>
				<HudButton
					intent="danger"
					isDisabled={remove.isPending}
					onPress={() => remove.mutate(device, { onSuccess: onDone })}
				>
					{remove.isPending ? "Suppression…" : "Supprimer"}
				</HudButton>
			</div>
		</div>
	);
}
