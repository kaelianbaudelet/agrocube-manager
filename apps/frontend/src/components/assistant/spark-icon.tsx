/** The assistant's mark (tab, avatar). */
export function SparkIcon({ className = "size-4" }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={`shrink-0 ${className}`} fill="currentColor" aria-hidden>
			<path d="M8 0.5l1.6 4.4 4.4 1.6-4.4 1.6L8 12.5 6.4 8.1 2 6.5l4.4-1.6zM13 10.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
		</svg>
	);
}
