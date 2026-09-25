import { type CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import { API_KEY_MAX_DAYS, type ApiKey, CreateApiKeySchema, type CreatedApiKey } from "@repo/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import {
	Button,
	DateField,
	DateInput,
	DateSegment,
	FieldError,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
	Select,
	SelectValue
} from "react-aria-components";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { HudButton } from "@/components/hud/hud-button";
import { HudModal } from "@/components/hud/hud-modal";
import { HudPanel } from "@/components/hud/panel";
import { env } from "@/env";
import { copyText } from "@/lib/clipboard";
import { apiKeysApi } from "@/lib/endpoints";
import { type FieldErrors, validate } from "@/lib/form";
import { queryClient } from "@/lib/query-client";

const apiKeysKey = ["api-keys"] as const;
const DAY_MS = 86_400_000;

const EXPIRY_OPTIONS = [
	{ id: "7", label: "7 jours" },
	{ id: "30", label: "30 jours" },
	{ id: "90", label: "90 jours" },
	{ id: "365", label: "1 an" },
	{ id: "custom", label: "Date personnalisée" }
] as const;
type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]["id"];

const labelClass = "flex items-center gap-1.5 text-[10px] text-muted-fg uppercase tracking-[0.2em]";
const boxClass =
	"flex h-9 w-full items-center border border-hud/25 bg-hud/5 px-3 font-data text-fg text-sm outline-none transition hover:border-hud/45";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium" });

function lastUsed(iso: string | null) {
	if (!iso) return "Jamais utilisée";
	const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (min < 1) return "Utilisée à l'instant";
	if (min < 60) return `Utilisée il y a ${min} min`;
	if (min < 1440) return `Utilisée il y a ${Math.round(min / 60)} h`;
	return `Utilisée le ${formatDate(iso)}`;
}

function expiry(iso: string) {
	const days = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
	if (days <= 0) return { label: `Expirée le ${formatDate(iso)}`, tone: "text-crit", expired: true };
	if (days <= 7) return { label: `Expire dans ${days} j`, tone: "text-warn", expired: false };
	return { label: `Expire le ${formatDate(iso)}`, tone: "text-muted-fg", expired: false };
}

/**
 * Settings card: personal API keys (`Authorization: Bearer agk_…`) with an expiry date.
 */
export function ApiKeysPanel() {
	const keys = useQuery({ queryKey: apiKeysKey, queryFn: apiKeysApi.list });
	const [creating, setCreating] = useState(false);
	const [created, setCreated] = useState<CreatedApiKey | null>(null);

	const close = () => {
		setCreating(false);
		setCreated(null);
	};

	return (
		<HudPanel
			title="Clés API"
			bodyClassName="flex flex-col gap-3 p-3"
			actions={
				<HudButton className="px-2 py-0.5 text-[10px] tracking-[0.15em]" onPress={() => setCreating(true)}>
					+ Nouvelle clé
				</HudButton>
			}
		>
			<p className="text-muted-fg text-xs leading-relaxed">
				Une clé permet à un script d'utiliser l'API en votre nom :{" "}
				<code className="font-data text-[11px] text-hud">Authorization: Bearer agk_…</code>. Elle ne peut ni gérer les
				clés, ni changer le mot de passe.
			</p>

			{keys.isPending ? (
				<p className="hud-pulse text-muted-fg text-xs">Chargement…</p>
			) : !keys.data?.length ? (
				<p className="border border-hud/20 border-dashed p-4 text-center text-muted-fg text-xs">Aucune clé API.</p>
			) : (
				<ul className="space-y-1.5">
					{keys.data.map((k) => (
						<ApiKeyRow key={k.id} apiKey={k} />
					))}
				</ul>
			)}

			<HudModal
				title="Nouvelle clé API"
				isOpen={creating}
				onOpenChange={(open) => !open && close()}
				isLocked={!!created}
				className="max-w-lg"
			>
				{created ? (
					<CreatedKey created={created} onDone={close} />
				) : (
					<CreateKeyForm onCreated={setCreated} onCancel={close} />
				)}
			</HudModal>
		</HudPanel>
	);
}

function ApiKeyRow({ apiKey }: { apiKey: ApiKey }) {
	const [confirming, setConfirming] = useState(false);
	const remove = useMutation({
		mutationFn: () => apiKeysApi.remove(apiKey.id),
		onSuccess: () => {
			toast.success(`Clé « ${apiKey.name} » révoquée`);
			return queryClient.invalidateQueries({ queryKey: apiKeysKey });
		},
		onError: (error) => toast.error(error.message)
	});
	const exp = expiry(apiKey.expiresAt);

	return (
		<li
			className={`flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2 ${exp.expired ? "border-crit/25 opacity-70" : "border-hud/30 bg-hud/5"}`}
		>
			<svg
				viewBox="0 0 16 16"
				className={`size-4 shrink-0 ${exp.expired ? "text-crit" : "text-hud"}`}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				aria-hidden
			>
				<circle cx="5" cy="8" r="3" />
				<path d="M8 8h7M12.5 8v2.5M15 8v2" />
			</svg>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
				<span className="flex min-w-0 items-baseline gap-2">
					<span className="truncate text-fg text-xs uppercase tracking-wider">{apiKey.name}</span>
					<code className="shrink-0 text-[10px] text-muted-fg">{apiKey.prefix}…</code>
				</span>
				<span className="truncate text-[10px]">
					<span className={exp.tone}>{exp.label}</span>
					<span className="text-muted-fg"> · {lastUsed(apiKey.lastUsedAt)}</span>
				</span>
			</span>
			{confirming ? (
				<span className="flex shrink-0 items-center gap-1">
					<HudButton
						intent="danger"
						className="px-2 py-1 text-[10px]"
						isDisabled={remove.isPending}
						onPress={() => remove.mutate()}
					>
						Révoquer
					</HudButton>
					<HudButton intent="ghost" className="px-2 py-1 text-[10px]" onPress={() => setConfirming(false)}>
						Non
					</HudButton>
				</span>
			) : (
				<Button
					aria-label={`Révoquer la clé ${apiKey.name}`}
					onPress={() => setConfirming(true)}
					className="flex size-7 shrink-0 cursor-pointer items-center justify-center border border-transparent text-muted-fg outline-none hover:border-crit/40 hover:text-crit focus-visible:ring-1 focus-visible:ring-hud"
				>
					<svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
						<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
					</svg>
				</Button>
			)}
		</li>
	);
}

function CreateKeyForm({ onCreated, onCancel }: { onCreated: (k: CreatedApiKey) => void; onCancel: () => void }) {
	const [name, setName] = useState("");
	const [option, setOption] = useState<ExpiryOption>("30");
	const tomorrow = today(getLocalTimeZone()).add({ days: 1 });
	const maxDate = today(getLocalTimeZone()).add({ days: API_KEY_MAX_DAYS - 1 });
	const [customDate, setCustomDate] = useState<CalendarDate | null>(() => tomorrow.add({ days: 59 }));
	const [errors, setErrors] = useState<FieldErrors>({});

	const create = useMutation({
		mutationFn: apiKeysApi.create,
		onSuccess: (created) => {
			queryClient.invalidateQueries({ queryKey: apiKeysKey });
			onCreated(created);
		},
		onError: (error) => toast.error(error.message)
	});

	function expiresAt() {
		if (option !== "custom") return new Date(Date.now() + Number(option) * DAY_MS).toISOString();
		if (!customDate) return "";
		// Valid until the end of the chosen day.
		const end = customDate.toDate(getLocalTimeZone());
		end.setHours(23, 59, 59, 999);
		return end.toISOString();
	}

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const { data, errors } = validate(CreateApiKeySchema, { name, expiresAt: expiresAt() });
		setErrors(errors ?? {});
		if (data) create.mutate(data);
	}

	return (
		<form onSubmit={onSubmit} noValidate className="space-y-4">
			<FormField label="Nom de la clé" name="name" value={name} onChange={setName} error={errors.name} />

			<div className="grid gap-3 sm:grid-cols-2">
				<Select
					selectedKey={option}
					onSelectionChange={(key) => key && setOption(key as ExpiryOption)}
					className="flex min-w-0 flex-col gap-1"
				>
					<Label className={labelClass}>
						<span className="size-1 rotate-45 bg-current" aria-hidden />
						Expiration
					</Label>
					<Button className={`${boxClass} group cursor-pointer gap-2 text-left focus-visible:border-hud`}>
						<SelectValue className="min-w-0 flex-1 truncate" />
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
						className="hud-panel w-(--trigger-width) bg-bg/95 outline-none entering:fade-in entering:animate-in exiting:fade-out exiting:animate-out"
					>
						<ListBox className="py-1 outline-none">
							{EXPIRY_OPTIONS.map((o) => (
								<ListBoxItem
									key={o.id}
									id={o.id}
									className="cursor-pointer px-3 py-2 text-fg text-xs outline-none focus:bg-hud/15 focus:text-hud selected:text-hud"
								>
									{o.label}
								</ListBoxItem>
							))}
						</ListBox>
					</Popover>
				</Select>

				{option === "custom" ? (
					<DateField
						value={customDate}
						onChange={setCustomDate}
						minValue={tomorrow}
						maxValue={maxDate}
						isInvalid={!!errors.expiresAt}
						shouldForceLeadingZeros
						className="group flex min-w-0 flex-col gap-1"
					>
						<Label className={labelClass}>
							<span className="size-1 rotate-45 bg-current" aria-hidden />
							Valide jusqu'au
						</Label>
						<DateInput className={`${boxClass} focus-within:border-hud group-invalid:border-crit/70`}>
							{(segment) => (
								<DateSegment
									segment={segment}
									className="px-0.5 tabular-nums outline-none focus:bg-hud/25 focus:text-hud placeholder-shown:text-muted-fg"
								/>
							)}
						</DateInput>
						<FieldError className="text-[11px] text-crit">{errors.expiresAt}</FieldError>
					</DateField>
				) : (
					<div className="flex flex-col justify-end gap-1 pb-2 text-[11px] text-muted-fg">
						Valide jusqu'au{" "}
						<span className="text-fg">
							{new Date(Date.now() + Number(option) * DAY_MS).toLocaleDateString("fr-FR", { dateStyle: "long" })}
						</span>
					</div>
				)}
			</div>

			<div className="flex justify-end gap-2">
				<HudButton intent="ghost" onPress={onCancel}>
					Annuler
				</HudButton>
				<HudButton type="submit" isDisabled={create.isPending} className="whitespace-nowrap">
					{create.isPending ? "Génération…" : "Générer la clé"}
				</HudButton>
			</div>
		</form>
	);
}

function CreatedKey({ created, onDone }: { created: CreatedApiKey; onDone: () => void }) {
	const keyRef = useRef<HTMLSpanElement>(null);
	const [copied, setCopied] = useState<string>();

	return (
		<div className="space-y-4">
			<p className="text-ok text-xs">
				✓ Clé « {created.apiKey.name} » créée, valide jusqu'au {formatDate(created.apiKey.expiresAt)}.
			</p>
			<span
				ref={keyRef}
				className="block select-all break-all border border-hud/50 bg-hud/10 px-3 py-2 font-data text-hud text-sm tracking-wider hud-glow"
			>
				{created.key}
			</span>
			<p className="text-warn text-xs">⚠ Copiez-la maintenant : elle ne sera plus affichée après fermeture.</p>
			<div className="space-y-1">
				<p className={labelClass}>Exemple</p>
				<pre className="overflow-x-auto border border-hud/20 bg-black/40 p-2 font-data text-[11px] text-muted-fg">
					curl -H "Authorization: Bearer {created.key.slice(0, 10)}…" {env.VITE_API_URL}/devices
				</pre>
			</div>
			<div className="flex flex-wrap items-center justify-end gap-2">
				{copied && <span className="mr-auto text-[11px] text-ok">{copied}</span>}
				<HudButton intent="ghost" onPress={async () => setCopied(await copyText(created.key, keyRef.current))}>
					Copier la clé
				</HudButton>
				<HudButton onPress={onDone}>J'ai noté la clé</HudButton>
			</div>
		</div>
	);
}
