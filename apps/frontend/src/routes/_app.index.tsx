import { createFileRoute } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_app/")({
	component: DashboardPage
});

function DashboardPage() {
	const user = useAuthStore((s) => s.user);
	return (
		<section className="space-y-2">
			<h1 className="font-semibold text-2xl">Bienvenue, {user?.firstName} 👋</h1>
			<p className="text-muted-fg">Ton dashboard est vide pour l'instant.</p>
		</section>
	);
}
