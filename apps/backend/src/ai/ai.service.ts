import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	type AskUserInput,
	type AskUserOutput,
	type Device,
	LAMP_COLORS,
	READING_RANGES,
	type ReadingRange,
	SENSOR_KEYS,
	SENSOR_THRESHOLDS,
	type SensorKey,
	sensorStatus,
	toLampColor
} from "@repo/shared";
import {
	convertToModelMessages,
	isStepCount,
	pipeUIMessageStreamToResponse,
	streamText,
	tool,
	toUIMessageStream,
	type UIMessage,
	validateUIMessages
} from "ai";
import { createOllama } from "ai-sdk-ollama";
import type { Response } from "express";
import { z } from "zod";
import type { Env } from "../config/env";
import { DeviceGateway } from "../plant/device.gateway";
import { PlantService } from "../plant/plant.service";
import { ScheduleService } from "../plant/schedule.service";
import { AiActions } from "./ai-actions";
import { type CubeArg, input, type NoContext, type ToolOutput } from "./tool-helpers";

export const ChatRequestSchema = z.object({
	/** The whole conversation (UI messages), validated again by the AI SDK. */
	messages: z.array(z.unknown()).min(1).max(200),
	/** Cube shown on the dashboard: what "ma plante", "ce cube" refer to. */
	deviceId: z.string().nullish()
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

const SENSOR_TEXT: Record<SensorKey, string> = {
	temperature: "température (°C)",
	soilMoisture: "humidité du sol (%)",
	light: "luminosité (%)",
	waterLevel: "niveau du réservoir (%)"
};
const STATUS_TEXT = { ok: "normal", warning: "attention", critical: "critique", unknown: "aucune donnée" } as const;

const round = (n: number) => Math.round(n * 10) / 10;

/** "Normal between 16 and 28, critical below 10 or above 35", skipping the ±1 "no limit" sentinels. */
function thresholdText(key: SensorKey) {
	const t = SENSOR_THRESHOLDS[key];
	const critical = [t.critLow >= 0 && `< ${t.critLow}`, t.critHigh <= 100 && `> ${t.critHigh}`].filter(Boolean);
	const warning = [t.warnLow > 0 && `< ${t.warnLow}`, t.warnHigh <= 100 && `> ${t.warnHigh}`].filter(Boolean);
	return `- ${SENSOR_TEXT[key]} : attention si ${warning.join(" ou ")}${critical.length ? `, critique si ${critical.join(" ou ")}` : ""}`;
}

/**
 * The cube assistant: a local Ollama model that reads live data through tools, and acts on the cubes
 * through write tools that each need the user's approval (AiActions).
 */
@Injectable()
export class AiService {
	private readonly logger = new Logger(AiService.name);
	private readonly ollamaUrl: string;
	private readonly modelName: string;
	private readonly think: boolean;
	private readonly ollama: ReturnType<typeof createOllama>;
	private readonly approvalSecret: string;

	constructor(
		config: ConfigService<Env, true>,
		private readonly plant: PlantService,
		private readonly devices: DeviceGateway,
		private readonly schedules: ScheduleService,
		private readonly actions: AiActions
	) {
		this.ollamaUrl = config.get("OLLAMA_URL", { infer: true });
		this.modelName = config.get("OLLAMA_MODEL", { infer: true });
		this.think = config.get("OLLAMA_THINK", { infer: true });
		this.ollama = createOllama({ baseURL: this.ollamaUrl });
		// Signs each approval request so the browser cannot forge an approval for an action.
		this.approvalSecret = `${config.get("JWT_SECRET", { infer: true })}:assistant-approvals`;
	}

	async streamChat(body: ChatRequest, res: Response, userId: string) {
		let messages: UIMessage[];
		try {
			messages = await validateUIMessages({ messages: body.messages });
		} catch {
			throw new BadRequestException("Conversation invalide");
		}

		const list = await this.listDevices();
		const current = list.find((d) => d.id === body.deviceId) ?? list[0] ?? null;

		// Stop generating (and free the GPU) when the user leaves or presses "stop".
		const abort = new AbortController();
		res.on("close", () => abort.abort());

		const result = streamText({
			model: this.ollama(this.modelName, { think: this.think }),
			instructions: this.instructions(current, list),
			// A question left unanswered (the user typed a new message instead) must not break the conversation.
			messages: await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true }),
			tools: { ...this.tools(current), ...this.actions.tools(userId, this.resolveCube) },
			// Nothing is changed without the user's click on the approval card.
			toolApproval: this.actions.approvals(this.resolveCube),
			experimental_toolApprovalSecret: this.approvalSecret,
			stopWhen: isStepCount(8),
			abortSignal: abort.signal
		});

		await pipeUIMessageStreamToResponse({
			response: res,
			stream: toUIMessageStream({
				stream: result.stream,
				originalMessages: messages,
				sendReasoning: true,
				onError: (error) => this.describeError(error)
			})
		});
	}

	private instructions(current: Device | null, list: Device[]) {
		const now = new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" });
		return [
			"Vous êtes l'assistant d'AGRO·CUBE, un tableau de bord qui surveille des plantes cultivées dans des cubes connectés (Arduino).",
			"Chaque cube mesure la température, l'humidité du sol, la luminosité et le niveau d'eau de son réservoir, et possède une pompe d'arrosage et une lampe LED de couleur réglable.",
			"",
			"Règles :",
			"- Répondez en français, en vouvoyant l'utilisateur, de façon claire et concise. Utilisez le Markdown (listes, gras, tableaux courts) quand cela aide.",
			"- Pour toute question sur l'état des plantes ou des cubes, appelez d'abord les outils : n'inventez jamais une mesure.",
			"- Si plusieurs cubes existent et que l'utilisateur ne précise pas lequel (« ma plante », « le cube »…), ne choisissez pas à sa place : appelez askUser avec une option par cube (son nom exact) et une option « Tous les cubes ».",
			"- Plus généralement, dès qu'un choix ou une précision de l'utilisateur est nécessaire pour bien répondre, appelez askUser avec des options courtes. Une fois la réponse reçue, poursuivez directement votre réponse sans la reposer.",
			"- Donnez des conseils concrets de jardinage adaptés aux mesures.",
			"- Vous pouvez agir : arroser (waterNow, 15 s maximum), piloter la lampe et sa couleur (setLamp), créer / modifier / supprimer des programmations d'arrosage, créer ou renommer un cube.",
			"- Chaque action affiche une carte « Approuver / Refuser » à l'utilisateur : appelez directement l'outil avec les bons paramètres, sans redemander confirmation en texte. Pour modifier ou supprimer une programmation, récupérez d'abord son id avec getWateringSchedules.",
			"- Si l'utilisateur refuse une action, ne la reproposez pas sans nouvelle demande. Après une action, dites clairement ce qui s'est passé (terminé, échec et pourquoi).",
			"- Il n'est pas possible de supprimer un cube depuis l'assistant : c'est au menu « ⋯ » de son onglet.",
			"- Un cube hors ligne n'envoie plus de mesures : ses dernières valeurs peuvent être périmées, signalez-le.",
			"- Si un cube n'a aucune mesure (mesures = null), dites qu'il n'a encore rien envoyé : ne concluez rien sur l'état de la plante.",
			"",
			"Seuils des capteurs :",
			...SENSOR_KEYS.filter((k) => k !== "light").map(thresholdText),
			"- luminosité (%) : attention si < 20",
			"",
			`Date et heure actuelles : ${now}.`,
			list.length > 0
				? `Cubes enregistrés (${list.length}) : ${list.map((d) => `« ${d.name} »`).join(", ")}.`
				: "Aucun cube n'est encore enregistré.",
			current && list.length > 1
				? `Cube sélectionné sur le tableau de bord : « ${current.name} ». Ne l'utilisez que si l'utilisateur parle du cube affiché ou sélectionné.`
				: ""
		].join("\n");
	}

	/** The model may pass a name instead of an id, or nothing at all (only when there is a single cube). */
	private readonly resolveCube = async (cube?: string) => {
		const list = await this.listDevices();
		const wanted = cube?.trim().toLowerCase();
		if (!wanted && list.length > 1)
			throw new Error(
				`Plusieurs cubes existent (${list.map((d) => d.name).join(", ")}) : précisez lequel, ou demandez à l'utilisateur avec askUser.`
			);
		const device = wanted ? list.find((d) => d.id === cube || d.name.toLowerCase() === wanted) : list[0];
		if (!device) throw new Error(cube ? `Cube « ${cube} » introuvable` : "Aucun cube enregistré");
		return device;
	};

	private async listDevices(): Promise<Device[]> {
		const devices = await this.plant.listDevices();
		return devices.map((d) => ({ ...d, online: this.devices.isOnline(d.id) }));
	}

	private tools(current: Device | null) {
		const cubeInput = z
			.string()
			.optional()
			.describe("Identifiant ou nom exact du cube. Obligatoire s'il existe plusieurs cubes.");

		return {
			// No execute: the chat shows the question, and the user's answer comes back as the tool output.
			askUser: tool<AskUserInput, AskUserOutput, NoContext>({
				description:
					"Pose une question à l'utilisateur et attend sa réponse avant de continuer (interruption temporaire). À utiliser quand la demande est ambiguë, par exemple pour choisir un cube parmi plusieurs. Proposez des options courtes et cliquables. La réponse revient sous la forme { answers: [...] }.",
				inputSchema: input(
					z.object({
						question: z.string().min(1).max(300).describe("La question, courte et claire"),
						options: z
							.array(
								z.object({
									label: z.string().min(1).max(60),
									description: z.string().max(140).optional()
								})
							)
							.max(8)
							.optional()
							.describe("Choix proposés sous forme de boutons"),
						multiple: z.boolean().optional().describe("Autoriser plusieurs choix"),
						allowFreeText: z.boolean().optional().describe("Autoriser une réponse libre (oui par défaut)")
					})
				),
				outputSchema: input(z.object({ answers: z.array(z.string().max(500)).max(8) }))
			}),

			listCubes: tool({
				description:
					"Liste tous les cubes avec leur état (en ligne, lampe) et leurs dernières mesures, chacune avec son statut (normal, attention, critique).",
				inputSchema: input(z.object({})),
				execute: async () => {
					const list = await this.listDevices();
					return list.map((d) => ({
						id: d.id,
						nom: d.name,
						afficheALecran: d.id === current?.id,
						enLigne: d.online,
						initialise: d.state === "ACTIVE",
						derniereTrame: d.lastSeenAt,
						lampe: { allumee: d.lampOn, couleur: LAMP_COLORS[toLampColor(d.lampColor)].label },
						mesures: d.latestReading
							? {
									releveLe: d.latestReading.recordedAt,
									...Object.fromEntries(
										SENSOR_KEYS.map((k) => {
											const value = d.latestReading?.[k] ?? null;
											return [
												SENSOR_TEXT[k],
												value === null ? null : { valeur: round(value), statut: STATUS_TEXT[sensorStatus(k, value)] }
											];
										})
									)
								}
							: null
					}));
				}
			}),

			getCubeHistory: tool<CubeArg & { periode?: ReadingRange }, ToolOutput, NoContext>({
				description:
					"Résume l'évolution des capteurs d'un cube sur une période (min, max, moyenne, première et dernière valeur).",
				inputSchema: input(
					z.object({
						cube: cubeInput,
						periode: z.enum(READING_RANGES).optional().describe("1h, 24h (par défaut) ou 7d (7 jours)")
					})
				),
				execute: async ({ cube, periode }) => this.history(await this.resolveCube(cube), periode ?? "24h")
			}),

			getRecentCommands: tool<CubeArg & { nombre?: number }, ToolOutput, NoContext>({
				description: "Derniers ordres envoyés à un cube (arrosages, lampe), avec leur résultat.",
				inputSchema: input(
					z.object({
						cube: cubeInput,
						nombre: z.number().int().min(1).max(20).optional().describe("10 par défaut")
					})
				),
				execute: async ({ cube, nombre }) => {
					const device = await this.resolveCube(cube);
					const commands = await this.plant.listCommands(device.id, nombre ?? 10);
					return {
						cube: device.name,
						commandes: commands.map((c) => ({
							type: c.type === "WATER" ? "arrosage" : "lampe",
							detail:
								c.type === "WATER"
									? `${(c.durationMs ?? 0) / 1000} s`
									: c.lampOn
										? `allumée (${LAMP_COLORS[toLampColor(c.lampColor)].label})`
										: "éteinte",
							programmee: c.scheduleId !== null,
							statut: { PENDING: "en attente", SENT: "en cours", DONE: "terminé", FAILED: "échec" }[c.status],
							erreur: c.error,
							le: c.createdAt
						}))
					};
				}
			}),

			getWateringSchedules: tool<CubeArg, ToolOutput, NoContext>({
				description: "Programmations d'arrosage automatique d'un cube et leur prochaine exécution.",
				inputSchema: input(z.object({ cube: cubeInput })),
				execute: async ({ cube }) => {
					const device = await this.resolveCube(cube);
					const schedules = await this.schedules.list(device.id);
					return {
						cube: device.name,
						programmations: schedules.map((s) => ({
							id: s.id,
							heure: s.time,
							duree: `${s.durationMs / 1000} s`,
							recurrence: { DAILY: "tous les jours", WEEKLY: "chaque semaine", MONTHLY: "chaque mois" }[s.recurrence],
							joursSemaine: s.weekdays,
							jourDuMois: s.dayOfMonth,
							active: s.enabled,
							prochaine: s.nextRunAt,
							derniere: s.lastRunAt
						}))
					};
				}
			})
		};
	}

	/** Per sensor: min, max, mean, first and last value over the period. */
	private async history(device: Device, periode: ReadingRange): Promise<Record<string, unknown>> {
		const readings = await this.plant.getReadings(device.id, periode);
		const capteurs = Object.fromEntries(
			SENSOR_KEYS.map((k) => {
				const values = readings.map((r) => r[k]).filter((v): v is number => v !== null);
				if (values.length === 0) return [SENSOR_TEXT[k], null];
				const last = values[values.length - 1];
				return [
					SENSOR_TEXT[k],
					{
						min: round(Math.min(...values)),
						max: round(Math.max(...values)),
						moyenne: round(values.reduce((a, b) => a + b, 0) / values.length),
						premiere: round(values[0]),
						derniere: round(last),
						statutActuel: STATUS_TEXT[sensorStatus(k, last)]
					}
				];
			})
		);
		return {
			cube: device.name,
			periode,
			points: readings.length,
			depuis: readings[0]?.recordedAt ?? null,
			jusqua: readings.at(-1)?.recordedAt ?? null,
			capteurs
		};
	}

	/** Shown in the chat: never leaks internals, but says what to do when Ollama is the problem. */
	private describeError(error: unknown) {
		const text = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : String(error);
		this.logger.error(`Erreur de l'assistant : ${text}`);
		if (/ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(text))
			return `Ollama est injoignable (${this.ollamaUrl}). Lancez l'application Ollama puis réessayez.`;
		if (/not found|pull/i.test(text) && text.includes(this.modelName.split(":")[0]))
			return `Le modèle « ${this.modelName} » n'est pas installé. Installez-le avec : ollama pull ${this.modelName}`;
		if (/approval signature/i.test(text))
			return "Cette approbation n'est pas valide. Redemandez l'action à l'assistant.";
		// Errors thrown by the tools and the plant services are written for the user ("Cube hors ligne"…).
		if (error instanceof Error && !error.name.startsWith("Prisma") && error.message.length < 300) return error.message;
		return "L'assistant a rencontré une erreur. Réessayez dans un instant.";
	}
}
