import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { ScheduleService, WATERING_QUEUE, type WateringJobData } from "./schedule.service";

/** Fires the watering schedules. */
@Processor(WATERING_QUEUE)
export class WateringProcessor extends WorkerHost {
	constructor(private readonly schedules: ScheduleService) {
		super();
	}

	process(job: Job<WateringJobData>) {
		return this.schedules.run(job.data.scheduleId);
	}
}
