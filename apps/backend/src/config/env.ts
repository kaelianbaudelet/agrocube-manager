import { z } from "zod";

export const EnvSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().int().positive().default(3001),
	DATABASE_URL: z.string().min(1),
	FRONTEND_URL: z.url().default("http://localhost:5173"),
	JWT_SECRET: z.string().min(32),
	JWT_REFRESH_SECRET: z.string().min(32),
	JWT_EXPIRES_IN: z.coerce.number().int().positive().default(900),
	JWT_REFRESH_EXPIRES_IN: z.coerce.number().int().positive().default(604800)
});

export type Env = z.infer<typeof EnvSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => EnvSchema.parse(config);
