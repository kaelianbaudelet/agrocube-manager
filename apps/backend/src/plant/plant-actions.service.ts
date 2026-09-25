import { ConflictException, Injectable } from "@nestjs/common";
import type { CreatedDevice, Device, LampColor } from "@repo/shared";
import { DashboardGateway } from "./dashboard.gateway";
import { DeviceGateway } from "./device.gateway";
import { PlantService } from "./plant.service";
import { ScheduleService } from "./schedule.service";

/**
 * Actions on the cubes, with their checks and live notifications. Shared by the HTTP API and the
 * assistant's tools, so both follow exactly the same rules.
 */
@Injectable()
export class PlantActionsService {
	constructor(
		private readonly plant: PlantService,
		private readonly devices: DeviceGateway,
		private readonly dashboard: DashboardGateway,
		private readonly schedules: ScheduleService
	) {}

	withOnline(device: Omit<Device, "online">): Device {
		return { ...device, online: this.devices.isOnline(device.id) };
	}

	/** The key is returned here and nowhere else: it is stored hashed. */
	async createDevice(name: string): Promise<CreatedDevice> {
		const { device, key } = await this.plant.createDevice(name);
		this.dashboard.emitDevicesChanged();
		return { device: this.withOnline(device), key };
	}

	async renameDevice(id: string, name: string): Promise<Device> {
		const device = await this.plant.renameDevice(id, name);
		this.dashboard.emitDevicesChanged();
		return this.withOnline(device);
	}

	async removeDevice(id: string) {
		await this.plant.assertDevice(id);
		await this.schedules.removeForDevice(id);
		await this.plant.deleteDevice(id);
		this.devices.disconnectDevice(id);
		this.dashboard.emitDevicesChanged();
	}

	async water(id: string, durationMs: number, userId: string) {
		await this.plant.assertDevice(id);
		if (!this.devices.isOnline(id)) throw new ConflictException("Cube hors ligne");
		if (await this.plant.findActiveCommand(id, "WATER")) throw new ConflictException("Arrosage déjà en cours");
		const command = await this.plant.createWaterCommand(id, durationMs, { userId });
		this.devices.sendCommand(command);
		this.dashboard.emitCommand(command);
		return command;
	}

	async lamp(id: string, on: boolean, color: LampColor | undefined, userId: string) {
		await this.plant.assertDevice(id);
		if (!this.devices.isOnline(id)) throw new ConflictException("Cube hors ligne");
		if (await this.plant.findActiveCommand(id, "LAMP")) throw new ConflictException("Commande d'éclairage en cours");
		const command = await this.plant.createLampCommand(id, on, color, userId);
		this.devices.sendCommand(command);
		this.dashboard.emitCommand(command);
		return command;
	}
}
