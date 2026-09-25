/**
 * Simulates a plant cube on the /device socket: streams sensor data in real time and obeys pump / lamp orders.
 *
 *   pnpm mock                      (from the repo root — same as `pnpm device:mock` here)
 *   pnpm mock --backfill=24h       also push 24h of history first
 *
 *   --interval  ms between two telemetry frames (default 2000)
 *   --backfill  first push history for 1h | 24h | 7d (one point every 5 min), then go live
 *   --day       length of a simulated day/night cycle, in minutes (default 20)
 *
 * Device key: DEVICE_KEY env var or --key=… if given. Otherwise the key saved in .mock-device.json
 * (git-ignored) is reused, and a "Cube Mock" device is registered on first run.
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import {
	type CommandAckInput,
	type DeviceCommandMessage,
	type DeviceStateMessage,
	SOCKET_NAMESPACES,
	type TelemetryInput
} from "@repo/shared";
import { io } from "socket.io-client";
import { PrismaClient } from "../generated/prisma/client";
import { hashToken } from "../src/auth/token.util";
import { generateDeviceKey } from "../src/plant/device-key";

const args = Object.fromEntries(
	process.argv.slice(2).map((a) => {
		const [k, v] = a.replace(/^--/, "").split("=");
		return [k, v ?? "true"];
	})
);

const API_URL = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const INTERVAL = Number(args.interval ?? 2000);
const DAY_MS = Number(args.day ?? 20) * 60_000;
const BACKFILL_MS = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000 }[args.backfill as string];
const KEY_FILE = join(__dirname, "..", ".mock-device.json");

// ---- device key ----

/** Reuses the saved mock device if it still exists in the database, otherwise registers a new one. */
async function resolveKey(): Promise<string> {
	const explicit = process.env.DEVICE_KEY ?? args.key;
	if (explicit) return explicit;

	const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
	try {
		if (existsSync(KEY_FILE)) {
			const saved = JSON.parse(readFileSync(KEY_FILE, "utf8")) as { key: string };
			const device = await prisma.device.findUnique({ where: { apiKeyHash: hashToken(saved.key) } });
			if (device) {
				console.log(`✓ Cube simulé : « ${device.name} » (${KEY_FILE})`);
				return saved.key;
			}
			console.warn("… Le cube enregistré dans .mock-device.json n'existe plus en base, création d'un nouveau");
		}
		const { key, hash } = generateDeviceKey();
		const device = await prisma.device.create({ data: { name: "Cube Mock", apiKeyHash: hash } });
		writeFileSync(KEY_FILE, `${JSON.stringify({ id: device.id, name: device.name, key }, null, "\t")}\n`);
		console.log(`✓ Cube « ${device.name} » créé, clé enregistrée dans ${KEY_FILE}`);
		return key;
	} finally {
		await prisma.$disconnect();
	}
}

// ---- plant model ----

const state = { soilMoisture: 65, waterLevel: 85, lampOn: false };
const round = (n: number) => Math.round(n * 10) / 10;
const noise = (amp: number) => (Math.random() - 0.5) * 2 * amp;
const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));

/** 0 at midnight, 1 at noon. */
const daylight = (t: number) => (1 - Math.cos(((t % DAY_MS) / DAY_MS) * 2 * Math.PI)) / 2;

function sample(t: number, elapsedMs: number): TelemetryInput {
	const sun = daylight(t);
	// Soil dries faster under the lamp; ~1 %/min on average.
	state.soilMoisture = clamp(state.soilMoisture - (elapsedMs / 60_000) * (0.5 + sun));
	state.waterLevel = clamp(state.waterLevel - (elapsedMs / 3_600_000) * 0.5);
	return {
		temperature: round(19 + sun * 7 + noise(0.3)),
		soilMoisture: round(clamp(state.soilMoisture + noise(0.4))),
		// The grow lamp tops the sensor up at night.
		light: round(clamp(Math.max(sun * 92, state.lampOn ? 80 : 0) + noise(1.5))),
		waterLevel: round(clamp(state.waterLevel + noise(0.3)))
	};
}

function water(durationMs: number) {
	const seconds = durationMs / 1000;
	state.soilMoisture = clamp(state.soilMoisture + seconds * 6, 0, 92);
	state.waterLevel = clamp(state.waterLevel - seconds * 1.5);
}

// ---- socket ----

function start(key: string) {
	const socket = io(`${API_URL}${SOCKET_NAMESPACES.device}`, { auth: { token: key } });
	let busy = false;
	let backfilling = false;
	let backfilled = false;

	socket.on("connect", async () => {
		console.log(
			`✓ Connecté à ${API_URL}${SOCKET_NAMESPACES.device} — envoi toutes les ${INTERVAL} ms (Ctrl+C pour arrêter)`
		);
		if (BACKFILL_MS && !backfilled) await backfill(BACKFILL_MS);
	});

	socket.on("connect_error", (err) => {
		console.error(`✗ Connexion refusée : ${err.message}`);
		if (err.message !== "unauthorized") console.error(`  L'API tourne-t-elle sur ${API_URL} ?`);
	});
	socket.on("disconnect", (reason) => console.warn(`… Déconnecté (${reason}), reconnexion auto`));

	socket.on("state", ({ lampOn, lampColor }: DeviceStateMessage) => {
		state.lampOn = lampOn;
		console.log(`→ État restauré : lampe ${lampOn ? "ON" : "OFF"} (${lampColor})`);
	});

	socket.on("command", async (cmd: DeviceCommandMessage) => {
		let ack: CommandAckInput;
		if (cmd.type === "LAMP") {
			console.log(`→ Ordre reçu : LAMPE ${cmd.on ? "ON" : "OFF"} (${cmd.color} #${cmd.rgb})`);
			await new Promise((r) => setTimeout(r, 300));
			state.lampOn = cmd.on;
			ack = { id: cmd.id, status: "DONE" };
		} else if (busy) ack = { id: cmd.id, status: "FAILED", error: "Pompe déjà en marche" };
		else if (state.waterLevel < 5) ack = { id: cmd.id, status: "FAILED", error: "Réservoir vide" };
		else {
			console.log(`→ Ordre reçu : ARROSAGE ${cmd.durationMs} ms`);
			busy = true;
			await new Promise((r) => setTimeout(r, cmd.durationMs));
			water(cmd.durationMs);
			busy = false;
			ack = { id: cmd.id, status: "DONE" };
		}
		const res = await socket.emitWithAck("command:ack", ack);
		console.log(`← Ack ${ack.status}${ack.error ? ` (${ack.error})` : ""}`, res.ok ? "" : res.error);
	});

	async function backfill(rangeMs: number) {
		backfilling = true;
		const step = 5 * 60_000;
		const from = Date.now() - rangeMs;
		console.log(`… Historique : ${Math.round(rangeMs / step)} points`);
		for (let t = from; t < Date.now() - step; t += step) {
			const frame = sample(t, step);
			// Keep the history lively: a gardener waters whenever the soil gets dry.
			if (state.soilMoisture < 28) water(5000);
			if (state.waterLevel < 20) state.waterLevel = 95;
			await socket.emitWithAck("telemetry", { ...frame, recordedAt: new Date(t).toISOString() });
		}
		backfilling = false;
		backfilled = true;
		console.log("✓ Historique envoyé, passage en direct");
	}

	let last = Date.now();
	setInterval(async () => {
		if (!socket.connected || backfilling) return;
		const now = Date.now();
		const frame = sample(now, now - last);
		last = now;
		const res = await socket.emitWithAck("telemetry", frame);
		if (!res.ok) console.error("✗ Télémétrie refusée :", res.error);
		else
			console.log(
				`· ${frame.temperature}°C  sol ${frame.soilMoisture}%  lum ${frame.light}%  réservoir ${frame.waterLevel}%`
			);
	}, INTERVAL);
}

resolveKey()
	.then(start)
	.catch((error) => {
		console.error("✗ Impossible de préparer le cube simulé :", error.message);
		process.exit(1);
	});
