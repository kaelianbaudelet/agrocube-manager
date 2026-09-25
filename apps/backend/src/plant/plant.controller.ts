import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query
} from "@nestjs/common";
import {
	type CreatedDevice,
	type Device,
	type DeviceNameDto,
	DeviceNameSchema,
	type LampCommandDto,
	LampCommandSchema,
	type ReadingsQuery,
	ReadingsQuerySchema,
	type WaterCommandDto,
	WaterCommandSchema
} from "@repo/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PlantService } from "./plant.service";
import { PlantActionsService } from "./plant-actions.service";

@Controller("devices")
export class PlantController {
	constructor(
		private readonly plant: PlantService,
		private readonly actions: PlantActionsService
	) {}

	@Get()
	async list(): Promise<Device[]> {
		const devices = await this.plant.listDevices();
		return devices.map((d) => this.actions.withOnline(d));
	}

	/** The key is in the response and nowhere else: it is stored hashed. */
	@Post()
	create(@Body({ schema: DeviceNameSchema }) dto: DeviceNameDto): Promise<CreatedDevice> {
		return this.actions.createDevice(dto.name);
	}

	@Patch(":id")
	rename(
		@Param("id", ParseUUIDPipe) id: string,
		@Body({ schema: DeviceNameSchema }) dto: DeviceNameDto
	): Promise<Device> {
		return this.actions.renameDevice(id, dto.name);
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(":id")
	remove(@Param("id", ParseUUIDPipe) id: string) {
		return this.actions.removeDevice(id);
	}

	@Get(":id/readings")
	readings(@Param("id", ParseUUIDPipe) id: string, @Query({ schema: ReadingsQuerySchema }) query: ReadingsQuery) {
		return this.plant.getReadings(id, query.range);
	}

	@Get(":id/commands")
	commands(@Param("id", ParseUUIDPipe) id: string) {
		return this.plant.listCommands(id);
	}

	@Post(":id/water")
	water(
		@Param("id", ParseUUIDPipe) id: string,
		@Body({ schema: WaterCommandSchema }) dto: WaterCommandDto,
		@CurrentUser("id") userId: string
	) {
		return this.actions.water(id, dto.durationMs, userId);
	}

	@Post(":id/lamp")
	lamp(
		@Param("id", ParseUUIDPipe) id: string,
		@Body({ schema: LampCommandSchema }) dto: LampCommandDto,
		@CurrentUser("id") userId: string
	) {
		return this.actions.lamp(id, dto.on, dto.color, userId);
	}
}
