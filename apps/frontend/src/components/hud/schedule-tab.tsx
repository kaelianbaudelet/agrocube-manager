import { Time } from "@internationalized/date";
import {
	MAX_DAY_OF_MONTH,
	SCHEDULE_RECURRENCES,
	type ScheduleRecurrence,
	WATER_DURATION,
	type WateringSchedule,
	type WateringScheduleDto,
	WateringScheduleSchema
} from "@repo/shared";
import { type FormEvent, useState } from "react";
import {
	Button,
	DateInput,
	DateSegment,
	Group,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	NumberField,
	Popover,
	Select,
	SelectValue,
	Switch,
	TimeField,
	ToggleButton,
	ToggleButtonGroup
} from "react-aria-components";
import { useDeleteSchedule, useSaveSchedule, useSchedules } from "@/hooks/use-plant";
import { type FieldErrors, validate } from "@/lib/form";
import { DurationSlider } from "./duration-slider";
import { HudButton } from "./hud-button";
import { formatRunDate, RECURRENCE_LABEL, recurrenceSummary, WEEKDAYS } from "./schedule-format";

const labelClass = "flex items-center gap-1.5 text-[10px] text-muted-fg uppercase tracking-[0.2em]";
const boxClass =
	"flex h-9 items-center border border-hud/25 bg-hud/5 px-3 font-data text-fg text-sm outline-none transition hover:border-hud/45";
const iconButtonClass =
	"flex size-7 shrink-0 cursor-pointer items-center justify-center border border-transparent text-muted-fg outline-none hover:border-hud/40 hover:text-fg focus-visible:ring-1 focus-visible:ring-hud";

const toDto = (s: WateringSchedule): WateringScheduleDto => ({
	time: s.time,
	durationMs: s.durationMs,
	recurrence: s.recurrence,
	weekdays: s.weekdays,
	dayOfMonth: s.dayOfMonth,
	enabled: s.enabled
});

/**
 * "Programmation" tab of the watering dialog: the cube's recurring waterings, and the form to add / edit one.
 */
export function ScheduleTab({ deviceId }: { deviceId: string }) {
	const schedules = useSchedules(deviceId);
	// null: list view; "new" or a schedule: form view.
	const [editing, setEditing] = useState<WateringSchedule | "new" | null>(null);

	if (editing)
		return (
			<ScheduleForm
				deviceId={deviceId}
				schedule={editing === "new" ? undefined : editing}
				onDone={() => setEditing(null)}
			/>
		);

	const list = schedules.data ?? [];
	return (
		<div className="space-y-3">
			{schedules.isPending ? (
				<p className="hud-pulse text-muted-fg text-xs">Chargement…</p>
			) : list.length === 0 ? (
				<p className="border border-hud/20 border-dashed p-4 text-center text-muted-fg text-xs">
					Aucune programmation. Ajoutez-en une pour arroser automatiquement.
				</p>
			) : (
				<ul className="space-y-1.5">
					{list.map((s) => (
						<ScheduleRow key={s.id} deviceId={deviceId} schedule={s} onEdit={() => setEditing(s)} />
					))}
				</ul>
			)}
			<div className="flex justify-end">
				<HudButton onPress={() => setEditing("new")}>+ Ajouter</HudButton>
			</div>
		</div>
	);
}

function ScheduleRow({
	deviceId,
	schedule,
	onEdit
}: {
	deviceId: string;
	schedule: WateringSchedule;
	onEdit: () => void;
}) {
	const save = useSaveSchedule(deviceId);
	const remove = useDeleteSchedule(deviceId);
	const [confirming, setConfirming] = useState(false);
	const enabled = save.isPending ? !!save.variables?.dto.enabled : schedule.enabled;

	return (
		<li
			className={`flex items-center gap-3 border px-3 py-2 transition-colors ${enabled ? "border-hud/40 bg-hud/5" : "border-hud/15"}`}
		>
			<span
				className={`w-16 shrink-0 font-display text-lg tabular-nums leading-none ${enabled ? "text-hud hud-glow" : "text-muted-fg"}`}
			>
				{schedule.time}
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
				<span className="truncate text-[11px] text-fg uppercase tracking-wider">
					{recurrenceSummary(schedule)} · {schedule.durationMs / 1000} s
				</span>
				<span className="truncate text-[10px] text-muted-fg">
					{enabled && schedule.nextRunAt ? `Prochain : ${formatRunDate(schedule.nextRunAt)}` : "Désactivée"}
				</span>
			</span>
			{confirming ? (
				<span className="flex shrink-0 items-center gap-1">
					<HudButton
						intent="danger"
						className="px-2 py-1 text-[10px]"
						isDisabled={remove.isPending}
						onPress={() => remove.mutate(schedule)}
					>
						Supprimer
					</HudButton>
					<HudButton intent="ghost" className="px-2 py-1 text-[10px]" onPress={() => setConfirming(false)}>
						Non
					</HudButton>
				</span>
			) : (
				<span className="flex shrink-0 items-center gap-0.5">
					<Switch
						aria-label={`Activer la programmation de ${schedule.time}`}
						isSelected={enabled}
						isDisabled={save.isPending}
						onChange={(on) => save.mutate({ id: schedule.id, dto: { ...toDto(schedule), enabled: on } })}
						className="group mr-1 cursor-pointer outline-none"
					>
						<span className="relative block h-4 w-8 border border-hud/40 bg-bg transition-colors group-focus-visible:ring-2 group-focus-visible:ring-hud group-selected:border-hud group-selected:bg-hud/20">
							<span className="absolute top-0.5 left-0.5 size-2.5 bg-muted-fg transition-transform duration-200 group-selected:translate-x-4 group-selected:bg-hud group-selected:shadow-[0_0_8px_var(--hud)]" />
						</span>
					</Switch>
					<Button
						aria-label={`Modifier la programmation de ${schedule.time}`}
						onPress={onEdit}
						className={iconButtonClass}
					>
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
					</Button>
					<Button
						aria-label={`Supprimer la programmation de ${schedule.time}`}
						onPress={() => setConfirming(true)}
						className={`${iconButtonClass} hover:border-crit/40 hover:text-crit`}
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
					</Button>
				</span>
			)}
		</li>
	);
}

function ScheduleForm({
	deviceId,
	schedule,
	onDone
}: {
	deviceId: string;
	schedule?: WateringSchedule;
	onDone: () => void;
}) {
	const save = useSaveSchedule(deviceId);
	const [time, setTime] = useState(() => {
		const [h, m] = (schedule?.time ?? "08:00").split(":").map(Number);
		return new Time(h, m);
	});
	const [durationMs, setDurationMs] = useState<number>(schedule?.durationMs ?? WATER_DURATION.default);
	const [recurrence, setRecurrence] = useState<ScheduleRecurrence>(schedule?.recurrence ?? "DAILY");
	const [weekdays, setWeekdays] = useState(() => new Set(schedule?.weekdays ?? [1, 3, 5]));
	const [dayOfMonth, setDayOfMonth] = useState(schedule?.dayOfMonth ?? 1);
	const [errors, setErrors] = useState<FieldErrors>({});

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const dto: WateringScheduleDto = {
			time: `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`,
			durationMs,
			recurrence,
			weekdays: [...weekdays],
			dayOfMonth: recurrence === "MONTHLY" ? dayOfMonth : null,
			enabled: schedule?.enabled ?? true
		};
		const { data, errors } = validate(WateringScheduleSchema, dto);
		setErrors(errors ?? {});
		if (data) save.mutate({ id: schedule?.id, dto }, { onSuccess: onDone });
	}

	return (
		<form onSubmit={onSubmit} noValidate className="space-y-4">
			<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
				<TimeField
					value={time}
					onChange={(t) => t && setTime(t)}
					hourCycle={24}
					shouldForceLeadingZeros
					className="flex flex-col gap-1"
				>
					<Label className={labelClass}>Heure</Label>
					<DateInput className={`${boxClass} focus-within:border-hud`}>
						{(segment) => (
							<DateSegment
								segment={segment}
								className="px-0.5 tabular-nums outline-none focus:bg-hud/25 focus:text-hud placeholder-shown:text-muted-fg"
							/>
						)}
					</DateInput>
				</TimeField>

				<Select
					selectedKey={recurrence}
					onSelectionChange={(key) => key && setRecurrence(key as ScheduleRecurrence)}
					className="flex min-w-0 flex-col gap-1"
				>
					<Label className={labelClass}>Récurrence</Label>
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
							{SCHEDULE_RECURRENCES.map((r) => (
								<ListBoxItem
									key={r}
									id={r}
									className="cursor-pointer px-3 py-2 text-fg text-xs outline-none focus:bg-hud/15 focus:text-hud selected:text-hud"
								>
									{RECURRENCE_LABEL[r]}
								</ListBoxItem>
							))}
						</ListBox>
					</Popover>
				</Select>
			</div>

			{recurrence === "WEEKLY" && (
				<div className="flex flex-col gap-1">
					<span className={labelClass} id="weekdays-label">
						Jours
					</span>
					<ToggleButtonGroup
						aria-labelledby="weekdays-label"
						selectionMode="multiple"
						selectedKeys={new Set([...weekdays].map(String))}
						onSelectionChange={(keys) => setWeekdays(new Set([...keys].map(Number)))}
						className="grid grid-cols-7 gap-1"
					>
						{WEEKDAYS.map((d) => (
							<ToggleButton
								key={d.value}
								id={String(d.value)}
								aria-label={d.label}
								className="cursor-pointer border border-hud/25 py-1.5 text-muted-fg text-xs outline-none transition-colors hover:border-hud/60 hover:text-fg focus-visible:ring-2 focus-visible:ring-hud selected:border-hud selected:bg-hud/15 selected:text-hud"
							>
								{d.short}
							</ToggleButton>
						))}
					</ToggleButtonGroup>
					{errors.weekdays && <p className="text-[11px] text-crit">{errors.weekdays}</p>}
				</div>
			)}

			{recurrence === "MONTHLY" && (
				<NumberField
					value={dayOfMonth}
					onChange={(n) => Number.isFinite(n) && setDayOfMonth(n)}
					minValue={1}
					maxValue={MAX_DAY_OF_MONTH}
					className="flex flex-col gap-1"
				>
					<Label className={labelClass}>Jour du mois (1-{MAX_DAY_OF_MONTH})</Label>
					<Group className={`${boxClass} w-36 justify-between px-0 focus-within:border-hud`}>
						<Button slot="decrement" className="h-full w-9 cursor-pointer text-muted-fg outline-none hover:text-hud">
							−
						</Button>
						<Input className="w-10 bg-transparent text-center tabular-nums outline-none" />
						<Button slot="increment" className="h-full w-9 cursor-pointer text-muted-fg outline-none hover:text-hud">
							+
						</Button>
					</Group>
					{errors.dayOfMonth && <p className="text-[11px] text-crit">{errors.dayOfMonth}</p>}
				</NumberField>
			)}

			<DurationSlider value={durationMs} onChange={setDurationMs} />

			<div className="flex justify-end gap-2">
				<HudButton intent="ghost" onPress={onDone}>
					Annuler
				</HudButton>
				<HudButton type="submit" isDisabled={save.isPending} className="whitespace-nowrap">
					{save.isPending ? "Enregistrement…" : "Enregistrer"}
				</HudButton>
			</div>
		</form>
	);
}
