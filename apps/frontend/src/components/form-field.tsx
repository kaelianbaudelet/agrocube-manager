import { FieldError, Input, Label, TextField } from "react-aria-components";

interface FormFieldProps {
	label: string;
	name: string;
	value: string;
	onChange: (value: string) => void;
	error?: string;
	type?: "text" | "email" | "password";
	autoComplete?: string;
}

/**
 * HUD text field: square input with corner accents that light up on focus.
 */
export function FormField({ label, error, ...props }: FormFieldProps) {
	return (
		<TextField {...props} isInvalid={!!error} className="group flex min-w-0 flex-col gap-1">
			<Label className="flex items-center gap-1.5 text-[10px] text-muted-fg uppercase tracking-[0.2em] transition-colors group-has-[input:focus]:text-hud group-invalid:text-crit group-invalid:group-has-[input:focus]:text-crit">
				<span className="size-1 rotate-45 bg-current" aria-hidden />
				{label}
			</Label>
			<div className="relative">
				<Input className="hud-input peer w-full border border-hud/25 bg-hud/5 px-3 py-2 font-data text-fg text-sm outline-none transition placeholder:text-muted-fg/50 hover:border-hud/45 focus:border-hud focus:bg-hud/10 invalid:border-crit/70 focus:invalid:border-crit" />
				<span
					className="pointer-events-none absolute top-0 left-0 size-2 border-hud/60 border-t-2 border-l-2 transition-colors peer-focus:border-hud peer-invalid:border-crit peer-invalid:peer-focus:border-crit"
					aria-hidden
				/>
				<span
					className="pointer-events-none absolute right-0 bottom-0 size-2 border-hud/60 border-r-2 border-b-2 transition-colors peer-focus:border-hud peer-invalid:border-crit peer-invalid:peer-focus:border-crit"
					aria-hidden
				/>
			</div>
			<FieldError className="flex items-center gap-1 text-[11px] text-crit leading-tight">
				<svg
					viewBox="0 0 16 16"
					className="size-3 shrink-0"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.8}
					aria-hidden
				>
					<path d="M8 2l6.5 12h-13zM8 7v3M8 12v.01" />
				</svg>
				{error}
			</FieldError>
		</TextField>
	);
}
