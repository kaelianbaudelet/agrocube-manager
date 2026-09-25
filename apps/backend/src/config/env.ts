import { z } from "zod";

export const EnvSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().int().positive().default(3000),
	DATABASE_URL: z.string().min(1),
	FRONTEND_URL: z.url().default("http://localhost:5173"),
	/** BullMQ (watering schedules). */
	REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
	/** Time zone in which schedule times ("08:00") are interpreted. */
	SCHEDULER_TZ: z.string().min(1).default("Europe/Paris"),
	JWT_SECRET: z.string().min(32),
	JWT_REFRESH_SECRET: z.string().min(32),
	JWT_EXPIRES_IN: z.coerce.number().int().positive().default(900),
	JWT_REFRESH_EXPIRES_IN: z.coerce.number().int().positive().default(604800),
	/** Ollama server running the assistant's model. */
	OLLAMA_URL: z.url().default("http://127.0.0.1:11434"),
	OLLAMA_MODEL: z.string().min(1).default("qwen3:8b"),
	/** Ask the model to reason before answering (shown as "Réflexion" in the chat), if it supports it. */
	OLLAMA_THINK: z
		.enum(["true", "false"])
		.default("true")
		.transform((v) => v === "true")
});

export type Env = z.infer<typeof EnvSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => EnvSchema.parse(config);
