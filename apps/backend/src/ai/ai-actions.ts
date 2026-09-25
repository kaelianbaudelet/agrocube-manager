import { Injectable } from "@nestjs/common";
import {
	type AssistantActionTool,
	type Command,
	type Device,
	DeviceNameSchema,
	LAMP_COLOR_KEYS,
	LAMP_COLORS,
	type LampColor,
	type ScheduleRecurrence,
	WATER_DURATION,
	type WateringSchedule,
	WateringScheduleSchema
} from "@repo/shared";
import { type ToolApprovalStatus, tool } from "ai";
import { z } from "zod";
import { PlantService } from "../plant/plant.service";
import { PlantActionsService } from "../plant/plant-actions.service";
import { ScheduleService } from "../plant/schedule.service";
import { type CubeArg, input, type NoContext, type ToolOutput } from "./tool-helpers";

/** Finds a cube from what the model passed (id, name, or nothing when there is only one). */
export type ResolveCube = (cube?: string) => Promise<Device>;

const MAX_WATER_S = WATER_DURATION.max / 1000;
const WEEKDAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const STATUS_TEXT = { PENDING: "en attente", SENT: "en cours", DONE: "terminé", FAILED: "échec" } as const;

type ScheduleFields = {
	heure?: string;
	dureeSecondes?: number;
	recurrence?: ScheduleRecurrence;
	joursSemaine?: number[];
	jourDuMois?: number;
	active?: boolean;
};
type WaterInput = CubeArg & { dureeSecondes: number };
type LampInput = CubeArg & { allumer: boolean; couleur?: string };
type CreateScheduleInput = CubeArg &
	ScheduleFields & { heure: string; dureeSecondes: number; recurrence: ScheduleRecurrence };
type UpdateScheduleInput = CubeArg & ScheduleFields & { programmationId: string };
type DeleteScheduleInput = CubeArg & { programmationId: string };
type CreateCubeInput = { nom: string };
type RenameCubeInput = CubeArg & { nouveauNom: string };
type CreateCubeOutput = { id: string; nom: string; cle: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "BLUE", "bleu", "Bleu"… -> BLUE. Undefined: keep the current colour. */
function lampColor(value: string | undefined): LampColor | undefined {
	if (!value) return undefined;
	const wanted = value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
	const key = LAMP_COLOR_KEYS.find(
		(k) =>
			k.toLowerCase() === wanted || LAMP_COLORS[k].label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === wanted
	);
	if (!key) throw new Error(`Couleur inconnue : « ${value} ». Couleurs possibles : ${colorList()}.`);
	return key;
}
const colorList = () => LAMP_COLOR_KEYS.map((k) => LAMP_COLORS[k].label).join(", ");

function scheduleText(s: Pick<WateringSchedule, "time" | "durationMs" | "recurrence" | "weekdays" | "dayOfMonth">) {
	const when =
		s.recurrence === "WEEKLY"
			? `chaque ${s.weekdays.map((d) => WEEKDAY_NAMES[d]).join(", ")}`
			: s.recurrence === "MONTHLY"
				? `le ${s.dayOfMonth} de chaque mois`
				: "tous les jours";
	return `${s.durationMs / 1000} s à ${s.time}, ${when}`;
}

const scheduleFields = {
	heure: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
		.describe("Heure HH:MM (24 h, heure de Paris)"),
	dureeSecondes: z.number().int().min(1).max(MAX_WATER_S).describe(`Durée d'arrosage, 1 à ${MAX_WATER_S} secondes`),
	recurrence: z
		.enum(["DAILY", "WEEKLY", "MONTHLY"])
		.describe("DAILY, WEEKLY (avec joursSemaine) ou MONTHLY (avec jourDuMois)"),
	joursSemaine: z.array(z.number().int().min(0).max(6)).max(7).describe("WEEKLY : 0 = dimanche … 6 = samedi"),
	jourDuMois: z.number().int().min(1).max(28).describe("MONTHLY : jour 1 à 28"),
	active: z.boolean().describe("Programmation active (oui par défaut)")
};

/**
 * The assistant's write tools. None runs on its own: each call first shows an approval card in the chat
 * (see approvals()), and only an approved call is executed — through the same PlantActionsService /
 * ScheduleService as the HTTP API, so the same checks apply.
 */
@Injectable()
export class AiActions {
	constructor(
		private readonly plant: PlantService,
		private readonly actions: PlantActionsService,
		private readonly schedules: ScheduleService
	) {}

	tools(userId: string, resolve: ResolveCube) {
		const cube = z
			.string()
			.optional()
			.describe("Identifiant ou nom exact du cube. Obligatoire s'il existe plusieurs cubes.");

		return {
			waterNow: tool<WaterInput, ToolOutput, NoContext>({
				description: `Déclenche tout de suite un arrosage d'un cube (1 à ${MAX_WATER_S} secondes). L'utilisateur doit approuver.`,
				inputSchema: input(z.object({ cube, dureeSecondes: scheduleFields.dureeSecondes })),
				execute: async ({ cube, dureeSecondes }, { abortSignal }) => {
					const device = await resolve(cube);
					const command = await this.actions.water(device.id, dureeSecondes * 1000, userId);
					const done = await this.waitFor(command, dureeSecondes * 1000 + 12_000, abortSignal);
					return {
						cube: device.name,
						duree: `${dureeSecondes} s`,
						statut: STATUS_TEXT[done.status],
						erreur: done.error
					};
				}
			}),

			setLamp: tool<LampInput, ToolOutput, NoContext>({
				description: `Allume ou éteint la lampe LED d'un cube, et change sa couleur (${colorList()}). L'utilisateur doit approuver.`,
				inputSchema: input(
					z.object({
						cube,
						allumer: z.boolean(),
						couleur: z.string().optional().describe(`Couleur si allumée : ${colorList()}. Omise : couleur actuelle.`)
					})
				),
				execute: async ({ cube, allumer, couleur }, { abortSignal }) => {
					const device = await resolve(cube);
					const command = await this.actions.lamp(device.id, allumer, lampColor(couleur), userId);
					const done = await this.waitFor(command, 12_000, abortSignal);
					return {
						cube: device.name,
						lampe: allumer ? "allumée" : "éteinte",
						couleur: done.lampColor ? LAMP_COLORS[done.lampColor].label : null,
						statut: STATUS_TEXT[done.status],
						erreur: done.error
					};
				}
			}),

			createSchedule: tool<CreateScheduleInput, ToolOutput, NoContext>({
				description: "Crée une programmation d'arrosage automatique pour un cube. L'utilisateur doit approuver.",
				inputSchema: input(
					z.object({
						cube,
						heure: scheduleFields.heure,
						dureeSecondes: scheduleFields.dureeSecondes,
						recurrence: scheduleFields.recurrence,
						joursSemaine: scheduleFields.joursSemaine.optional(),
						jourDuMois: scheduleFields.jourDuMois.optional(),
						active: scheduleFields.active.optional()
					})
				),
				execute: async (args) => {
					const device = await resolve(args.cube);
					const schedule = await this.schedules.create(device.id, toScheduleInput(args), userId);
					return {
						cube: device.name,
						programmation: scheduleText(schedule),
						id: schedule.id,
						prochaine: schedule.nextRunAt
					};
				}
			}),

			updateSchedule: tool<UpdateScheduleInput, ToolOutput, NoContext>({
				description:
					"Modifie une programmation d'arrosage existante (id obtenu avec getWateringSchedules) : seuls les champs donnés changent. Sert aussi à activer / désactiver. L'utilisateur doit approuver.",
				inputSchema: input(
					z.object({
						cube,
						programmationId: z.string().describe("id de la programmation"),
						heure: scheduleFields.heure.optional(),
						dureeSecondes: scheduleFields.dureeSecondes.optional(),
						recurrence: scheduleFields.recurrence.optional(),
						joursSemaine: scheduleFields.joursSemaine.optional(),
						jourDuMois: scheduleFields.jourDuMois.optional(),
						active: scheduleFields.active.optional()
					})
				),
				execute: async (args) => {
					const device = await resolve(args.cube);
					const current = await this.findSchedule(device, args.programmationId);
					const schedule = await this.schedules.update(device.id, current.id, toScheduleInput(args, current));
					return {
						cube: device.name,
						avant: scheduleText(current),
						apres: scheduleText(schedule),
						active: schedule.enabled
					};
				}
			}),

			deleteSchedule: tool<DeleteScheduleInput, ToolOutput, NoContext>({
				description:
					"Supprime une programmation d'arrosage (id obtenu avec getWateringSchedules). L'utilisateur doit approuver.",
				inputSchema: input(z.object({ cube, programmationId: z.string().describe("id de la programmation") })),
				execute: async ({ cube, programmationId }) => {
					const device = await resolve(cube);
					const schedule = await this.findSchedule(device, programmationId);
					await this.schedules.remove(device.id, schedule.id);
					return { cube: device.name, supprimee: scheduleText(schedule) };
				}
			}),

			createCube: tool<CreateCubeInput, CreateCubeOutput, NoContext>({
				description:
					"Enregistre un nouveau cube. Sa clé d'accès (pour la carte Arduino) est affichée une seule fois à l'utilisateur. L'utilisateur doit approuver.",
				inputSchema: input(z.object({ nom: DeviceNameSchema.shape.name.describe("Nom du cube, 40 caractères max.") })),
				execute: async ({ nom }) => {
					const { device, key } = await this.actions.createDevice(nom);
					return { id: device.id, nom: device.name, cle: key };
				},
				// The key is for the user's eyes (the chat card shows it), never for the model.
				toModelOutput: ({ output }) => ({
					type: "json",
					value: {
						id: output.id,
						nom: output.nom,
						cle: "affichée à l'utilisateur dans le chat : ne la mentionnez pas, dites-lui de la noter"
					}
				})
			}),

			renameCube: tool<RenameCubeInput, ToolOutput, NoContext>({
				description: "Renomme un cube existant. L'utilisateur doit approuver.",
				inputSchema: input(z.object({ cube, nouveauNom: DeviceNameSchema.shape.name })),
				execute: async ({ cube, nouveauNom }) => {
					const device = await resolve(cube);
					const renamed = await this.actions.renameDevice(device.id, nouveauNom);
					return { ancienNom: device.name, nouveauNom: renamed.name };
				}
			})
		} satisfies Record<AssistantActionTool, unknown>;
	}

	/**
	 * Every action asks the user first. The reason is the sentence shown on the approval card, built here
	 * from the real data (cube names, current schedule), not from what the model claims. A call that cannot
	 * even be described (unknown cube or schedule, invalid values) is denied with the reason, so the model
	 * can correct itself: nothing ever runs without the card.
	 */
	approvals(resolve: ResolveCube) {
		const ask = async (describe: () => Promise<string>): Promise<ToolApprovalStatus> => {
			try {
				return { type: "user-approval", reason: await describe() };
			} catch (error) {
				return { type: "denied", reason: error instanceof Error ? error.message : "Action invalide" };
			}
		};
		return {
			waterNow: (i: WaterInput) =>
				ask(async () => `Arroser « ${(await resolve(i.cube)).name} » pendant ${i.dureeSecondes} s`),
			setLamp: (i: LampInput) =>
				ask(async () => {
					const name = (await resolve(i.cube)).name;
					const color = lampColor(i.couleur);
					return i.allumer
						? `Allumer la lampe de « ${name} »${color ? ` en ${LAMP_COLORS[color].label.toLowerCase()}` : ""}`
						: `Éteindre la lampe de « ${name} »`;
				}),
			createSchedule: (i: CreateScheduleInput) =>
				ask(async () => {
					const device = await resolve(i.cube);
					const s = toScheduleInput(i);
					return `Programmer sur « ${device.name} » un arrosage de ${scheduleText({ ...s, dayOfMonth: s.dayOfMonth ?? null })}`;
				}),
			updateSchedule: (i: UpdateScheduleInput) =>
				ask(async () => {
					const device = await resolve(i.cube);
					const current = await this.findSchedule(device, i.programmationId);
					const next = toScheduleInput(i, current);
					return `Modifier sur « ${device.name} » la programmation « ${scheduleText(current)} » en « ${scheduleText({ ...next, dayOfMonth: next.dayOfMonth ?? null })} »${next.enabled === current.enabled ? "" : next.enabled ? " (activée)" : " (désactivée)"}`;
				}),
			deleteSchedule: (i: DeleteScheduleInput) =>
				ask(async () => {
					const device = await resolve(i.cube);
					const current = await this.findSchedule(device, i.programmationId);
					return `Supprimer sur « ${device.name} » la programmation « ${scheduleText(current)} »`;
				}),
			createCube: (i: CreateCubeInput) => ask(async () => `Créer un nouveau cube « ${i.nom} »`),
			renameCube: (i: RenameCubeInput) =>
				ask(async () => `Renommer « ${(await resolve(i.cube)).name} » en « ${i.nouveauNom} »`)
		};
	}

	private async findSchedule(device: Device, id: string) {
		const schedule = (await this.schedules.list(device.id)).find((s) => s.id === id);
		if (!schedule)
			throw new Error(`Programmation « ${id} » introuvable sur « ${device.name} » (voir getWateringSchedules)`);
		return schedule;
	}

	/** Waits for the cube to acknowledge the order, so the model reports what really happened. */
	private async waitFor(command: Command, timeoutMs: number, signal?: AbortSignal): Promise<Command> {
		const until = Date.now() + timeoutMs;
		let latest = command;
		while (Date.now() < until && !signal?.aborted && !latest.completedAt) {
			await sleep(500);
			latest = (await this.plant.getCommand(command.id)) ?? latest;
		}
		return latest;
	}
}

/** Tool arguments (French names, seconds) -> the schedule API's input, validated by its own schema. */
function toScheduleInput(args: ScheduleFields, current?: WateringSchedule) {
	const recurrence = args.recurrence ?? current?.recurrence ?? "DAILY";
	const parsed = WateringScheduleSchema.safeParse({
		time: args.heure ?? current?.time,
		durationMs: args.dureeSecondes !== undefined ? args.dureeSecondes * 1000 : current?.durationMs,
		recurrence,
		weekdays: args.joursSemaine ?? (recurrence === current?.recurrence ? current?.weekdays : []) ?? [],
		dayOfMonth: args.jourDuMois ?? (recurrence === current?.recurrence ? current?.dayOfMonth : null) ?? null,
		enabled: args.active ?? current?.enabled ?? true
	});
	if (!parsed.success)
		throw new Error(`Programmation invalide : ${parsed.error.issues.map((i) => i.message).join(", ")}`);
	return parsed.data;
}
