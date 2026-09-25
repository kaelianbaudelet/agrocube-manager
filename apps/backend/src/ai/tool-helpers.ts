import { type JSONSchema7, jsonSchema } from "ai";
import { z } from "zod";

/**
 * Explicit tool() generics: inference of the input type from the schema is unreliable in this CommonJS app.
 */
export type CubeArg = { cube?: string };
export type ToolOutput = Record<string, unknown>;
export type NoContext = Record<string, never>;

/**
 * Zod schema -> AI SDK tool input schema. Passing Zod directly does not type-check here: this CommonJS
 * app and the ESM-only AI SDK see two copies of Zod's type declarations.
 */
export function input<T>(schema: z.ZodType<T>) {
	return jsonSchema<T>(z.toJSONSchema(schema) as JSONSchema7, {
		validate: (value) => {
			const parsed = schema.safeParse(value);
			return parsed.success ? { success: true, value: parsed.data } : { success: false, error: parsed.error };
		}
	});
}
