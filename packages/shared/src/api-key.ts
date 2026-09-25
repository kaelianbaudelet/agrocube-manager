import { z } from "zod";

/** Personal API keys start with this prefix, so the API can tell them from JWTs. */
export const API_KEY_PREFIX = "agk_";

/** Longest validity allowed for a key. */
export const API_KEY_MAX_DAYS = 730;

export const CreateApiKeySchema = z.object({
	name: z.string().trim().min(1, "Nom requis").max(40, "40 caractères max."),
	expiresAt: z.iso
		.datetime({ message: "Date invalide" })
		.refine((iso) => new Date(iso).getTime() > Date.now(), "La date doit être dans le futur")
		.refine(
			(iso) => new Date(iso).getTime() <= Date.now() + API_KEY_MAX_DAYS * 86_400_000,
			`${API_KEY_MAX_DAYS / 365} ans maximum`
		)
});
export type CreateApiKeyDto = z.infer<typeof CreateApiKeySchema>;

export interface ApiKey {
	id: string;
	name: string;
	/** First characters of the key, e.g. "agk_Xy12Ab". */
	prefix: string;
	expiresAt: string;
	lastUsedAt: string | null;
	createdAt: string;
}

/** Returned once, at creation: the key is stored hashed and can never be read again. */
export interface CreatedApiKey {
	apiKey: ApiKey;
	key: string;
}
