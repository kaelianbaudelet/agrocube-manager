import { FieldError, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TextField } from "@/components/ui/text-field";

interface FormFieldProps {
	label: string;
	name: string;
	value: string;
	onChange: (value: string) => void;
	error?: string;
	type?: "text" | "email" | "password";
	autoComplete?: string;
}

export function FormField({ label, error, ...props }: FormFieldProps) {
	return (
		<TextField {...props} isInvalid={!!error}>
			<Label>{label}</Label>
			<Input />
			<FieldError>{error}</FieldError>
		</TextField>
	);
}
