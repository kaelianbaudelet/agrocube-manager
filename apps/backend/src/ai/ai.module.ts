import { Module } from "@nestjs/common";
import { PlantModule } from "../plant/plant.module";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AiActions } from "./ai-actions";

@Module({
	imports: [PlantModule],
	controllers: [AiController],
	providers: [AiService, AiActions]
})
export class AiModule {}
