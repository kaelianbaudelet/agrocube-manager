import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_auth")({
	beforeLoad: () => {
		if (useAuthStore.getState().isAuthenticated) throw redirect({ to: "/" });
	},
	component: AuthLayout
});

function AuthLayout() {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
			<div className="w-full max-w-md">
				<Outlet />
			</div>
		</main>
	);
}
