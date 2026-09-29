import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
	const device = await prisma.device.findFirst({
		where: { name: "AGROCUBE" }
	});

	if (!device) {
		console.error("Device AGROCUBE non trouvé !");
		process.exit(1);
	}

	console.log(`Génération de l'historique pour ${device.name}...`);

	// Suppression des anciennes données pour ne pas fausser l'historique si on le relance
	await prisma.sensorReading.deleteMany({
		where: { deviceId: device.id }
	});

	const readings = [];
	const now = new Date();
	const daysToGenerate = 30;
	const intervalMinutes = 5;
	const totalReadings = (daysToGenerate * 24 * 60) / intervalMinutes;
	
	let currentMoisture = 60.0;
	let currentWaterLevel = 100.0;
	
	for (let i = totalReadings; i >= 0; i--) {
		const recordedAt = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
		const hour = recordedAt.getHours();

		// Température: baisse un peu la nuit
		const baseTemp = 22;
		const tempVariation = Math.sin((hour / 24) * Math.PI * 2) * 2; // entre -2 et +2
		const temperature = parseFloat((baseTemp + tempVariation + (Math.random() - 0.5)).toFixed(1));

		// Lumière: 0 la nuit, haute le jour
		let light = 0;
		if (hour > 7 && hour < 20) {
			light = parseFloat((70 + Math.random() * 20).toFixed(1));
		}

		// Humidité du sol: baisse doucement, remonte soudainement (arrosage) tous les 3-4 jours
		currentMoisture -= 0.02 + (Math.random() * 0.01);
		if (currentMoisture < 30) {
			currentMoisture = 85.0; // arrosage !
			currentWaterLevel -= 5.0; // consomme de l'eau du réservoir
		}

		// Réservoir d'eau: baisse doucement
		if (currentWaterLevel < 10) {
			currentWaterLevel = 100.0; // remplissage manuel simulé
		}

		readings.push({
			deviceId: device.id,
			recordedAt,
			temperature,
			light,
			soilMoisture: parseFloat(currentMoisture.toFixed(1)),
			waterLevel: parseFloat(currentWaterLevel.toFixed(1)),
		});
	}

	// Batch insert
	console.log(`Insertion de ${readings.length} enregistrements...`);
	// Par paquets de 500 pour éviter les limites de taille
	for (let i = 0; i < readings.length; i += 500) {
		const chunk = readings.slice(i, i + 500);
		await prisma.sensorReading.createMany({
			data: chunk
		});
	}

	console.log("Terminé !");
}

main()
	.catch(e => console.error(e))
	.finally(() => prisma.$disconnect());
