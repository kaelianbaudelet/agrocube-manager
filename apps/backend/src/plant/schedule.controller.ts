import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { type WateringScheduleInput, WateringScheduleSchema } from "@repo/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ScheduleService } from "./schedule.service";

@Controller("devices/:deviceId/schedules")
export class ScheduleController {
	constructor(private readonly schedules: ScheduleService) {}

	@Get()
	list(@Param("deviceId", ParseUUIDPipe) deviceId: string) {
		return this.schedules.list(deviceId);
	}

	@Post()
	create(
		@Param("deviceId", ParseUUIDPipe) deviceId: string,
		@Body({ schema: WateringScheduleSchema }) dto: WateringScheduleInput,
		@CurrentUser("id") userId: string
	) {
		return this.schedules.create(deviceId, dto, userId);
	}

	/** Full replacement (also used to enable / disable). */
	@Put(":id")
	update(
		@Param("deviceId", ParseUUIDPipe) deviceId: string,
		@Param("id", ParseUUIDPipe) id: string,
		@Body({ schema: WateringScheduleSchema }) dto: WateringScheduleInput
	) {
		return this.schedules.update(deviceId, id, dto);
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(":id")
	remove(@Param("deviceId", ParseUUIDPipe) deviceId: string, @Param("id", ParseUUIDPipe) id: string) {
		return this.schedules.remove(deviceId, id);
	}
}
