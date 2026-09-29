import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		// Reach the API on the same host the dashboard was opened from, so it works from other
		// devices on the network (192.168.x.x), not just localhost on the dev machine.
		VITE_API_URL: z
			.string()
			.url()
			.transform((url) => url.replace(/localhost|127\.0\.0\.1/g, window.location.hostname)),
		VITE_APP_NAME: z.string().min(1).default("Workshop EPSI")
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true
});
