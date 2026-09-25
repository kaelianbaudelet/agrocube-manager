/**
 * Registers a plant cube and prints its secret key (stored hashed, shown only once).
 *   pnpm device:create "Cube Alpha"
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { generateDeviceKey } from "../src/plant/device-key";

const name = process.argv[2]?.trim() || "Cube";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
	const { key, hash } = generateDeviceKey();
	const device = await prisma.device.create({ data: { name, apiKeyHash: hash } });

	console.log(`\n✓ Cube « ${device.name} » créé (${device.id})\n`);
	console.log(`  Clé à copier dans le code de l'Arduino (ne sera plus affichée) :\n\n  ${key}\n`);
	console.log(`  Simulation : DEVICE_KEY=${key} pnpm device:mock\n`);
}

main().finally(() => prisma.$disconnect());
