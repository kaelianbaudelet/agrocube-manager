import { Button, type ButtonProps } from "react-aria-components";
import { tv, type VariantProps } from "tailwind-variants";
import { cx } from "@/lib/primitive";

export const hudButtonStyles = tv({
	base: [
		"relative inline-flex cursor-pointer items-center justify-center gap-2 border px-4 py-2 font-display text-xs uppercase tracking-[0.2em] outline-none transition",
		"focus-visible:ring-2 focus-visible:ring-hud focus-visible:ring-offset-2 focus-visible:ring-offset-bg pressed:scale-[0.98]",
		"disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
	],
	variants: {
		intent: {
			primary: "hud-glow-box border-hud bg-hud/10 text-hud hover:bg-hud/20",
			ghost: "border-hud/25 text-muted-fg hover:border-hud/60 hover:text-fg",
			danger: "border-crit/50 text-crit hover:bg-crit/10"
		}
	},
	defaultVariants: { intent: "primary" }
});

export function HudButton({ className, intent, ...props }: ButtonProps & VariantProps<typeof hudButtonStyles>) {
	return <Button {...props} className={cx(hudButtonStyles({ intent }), className)} />;
}
