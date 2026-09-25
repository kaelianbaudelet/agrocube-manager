import type { ScheduleRecurrence, WateringSchedule } from "@repo/shared";

export const RECURRENCE_LABEL: Record<ScheduleRecurrence, string> = {
	DAILY: "Tous les jours",
	WEEKLY: "Certains jours de la semaine",
	MONTHLY: "Tous les mois"
};

/** Monday first, as on a French calendar. Values follow cron: 0 = Sunday. */
export const WEEKDAYS = [
	{ value: 1, short: "L", label: "Lundi", abbr: "Lun" },
	{ value: 2, short: "M", label: "Mardi", abbr: "Mar" },
	{ value: 3, short: "M", label: "Mercredi", abbr: "Mer" },
	{ value: 4, short: "J", label: "Jeudi", abbr: "Jeu" },
	{ value: 5, short: "V", label: "Vendredi", abbr: "Ven" },
	{ value: 6, short: "S", label: "Samedi", abbr: "Sam" },
	{ value: 0, short: "D", label: "Dimanche", abbr: "Dim" }
] as const;

export function recurrenceSummary(s: Pick<WateringSchedule, "recurrence" | "weekdays" | "dayOfMonth">) {
	if (s.recurrence === "DAILY") return "Tous les jours";
	if (s.recurrence === "MONTHLY") return `Le ${s.dayOfMonth} de chaque mois`;
	const days = new Set(s.weekdays);
	if (days.size === 7) return "Tous les jours";
	if (days.size === 5 && [1, 2, 3, 4, 5].every((d) => days.has(d))) return "En semaine";
	if (days.size === 2 && days.has(0) && days.has(6)) return "Le week-end";
	return WEEKDAYS.filter((d) => days.has(d.value))
		.map((d) => d.abbr)
		.join(", ");
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Aujourd'hui 08:00", "Demain 08:00", "Ven. 26/09 08:00". */
export function formatRunDate(iso: string, now = Date.now()) {
	const date = new Date(iso);
	const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
	const days = Math.round((startOfDay(date) - startOfDay(new Date(now))) / 86_400_000);
	if (days === 0) return `Aujourd'hui ${time}`;
	if (days === 1) return `Demain ${time}`;
	const day = date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
	return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${time}`;
}

/** The soonest planned run across enabled schedules. */
export function nextRun(schedules: WateringSchedule[]) {
	return schedules
		.filter((s) => s.enabled && s.nextRunAt)
		.sort((a, b) => (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""))[0];
}
