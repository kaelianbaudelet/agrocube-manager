import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DashboardGateway } from "./dashboard.gateway";
import { DeviceGateway } from "./device.gateway";
import { PlantController } from "./plant.controller";
import { PlantService } from "./plant.service";
import { PlantActionsService } from "./plant-actions.service";
import { ScheduleController } from "./schedule.controller";
import { ScheduleService, WATERING_QUEUE } from "./schedule.service";
import { WateringProcessor } from "./watering.processor";

@Module({
	imports: [JwtModule.register({}), BullModule.registerQueue({ name: WATERING_QUEUE })],
	controllers: [PlantController, ScheduleController],
	providers: [PlantService, PlantActionsService, DeviceGateway, DashboardGateway, ScheduleService, WateringProcessor],
	/** Read by the assistant's tools. */
	exports: [PlantService, PlantActionsService, DeviceGateway, ScheduleService]
})
export class PlantModule {}
