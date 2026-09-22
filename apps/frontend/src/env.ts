import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_API_URL: z.url(),
		VITE_APP_NAME: z.string().min(1).default("Workshop EPSI")
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true
});
