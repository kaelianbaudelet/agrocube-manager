import { WATER_DURATION } from "@repo/shared";
import { Label, Slider, SliderOutput, SliderThumb, SliderTrack } from "react-aria-components";

interface DurationSliderProps {
	value: number;
	onChange: (value: number) => void;
	isDisabled?: boolean;
}

/** Pump run time, WATER_DURATION.min…max in 0.5 s steps. */
export function DurationSlider({ value, onChange, isDisabled }: DurationSliderProps) {
	return (
		<Slider
			value={value}
			onChange={onChange}
			minValue={WATER_DURATION.min}
			maxValue={WATER_DURATION.max}
			step={500}
			isDisabled={isDisabled}
			className="space-y-2 disabled:opacity-50"
		>
			<div className="flex items-end justify-between">
				<Label className="text-[10px] text-muted-fg uppercase tracking-[0.2em]">Durée de la pompe</Label>
				<SliderOutput className="font-display text-hud text-xl tabular-nums hud-glow">
					{({ state }) => `${(state.getThumbValue(0) / 1000).toFixed(1)} s`}
				</SliderOutput>
			</div>
			<SliderTrack className="relative h-6 w-full">
				{({ state }) => (
					<>
						<span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 border border-hud/30 bg-bg" />
						<span
							className="absolute top-1/2 left-0 h-1 -translate-y-1/2 bg-hud shadow-[0_0_6px_var(--hud)]"
							style={{ width: `${state.getThumbPercent(0) * 100}%` }}
						/>
						<SliderThumb className="top-1/2 size-4 rotate-45 cursor-grab border border-hud bg-bg shadow-[0_0_8px_var(--hud)] outline-none dragging:cursor-grabbing dragging:bg-hud focus-visible:ring-2 focus-visible:ring-hud focus-visible:ring-offset-2 focus-visible:ring-offset-bg" />
					</>
				)}
			</SliderTrack>
			<div className="flex justify-between text-[9px] text-muted-fg tabular-nums">
				<span>{WATER_DURATION.min / 1000} s</span>
				<span>{WATER_DURATION.max / 1000} s</span>
			</div>
		</Slider>
	);
}
