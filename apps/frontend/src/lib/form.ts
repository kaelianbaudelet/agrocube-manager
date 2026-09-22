import { z } from "zod";

export type FieldErrors = Record<string, string | undefined>;

type ValidationResult<T> = { data: T; errors: null } | { data: null; errors: FieldErrors };

/**
 * Runs a shared Zod schema and returns the first error message per field.
 */
export function validate<S extends z.ZodType>(schema: S, values: unknown): ValidationResult<z.output<S>> {
	const result = schema.safeParse(values);
	if (result.success) return { data: result.data, errors: null };
	const fieldErrors = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
	return {
		data: null,
		errors: Object.fromEntries(Object.entries(fieldErrors).map(([key, messages]) => [key, messages?.[0]]))
	};
}
