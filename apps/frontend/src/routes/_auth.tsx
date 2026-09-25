import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { HudRings } from "@/components/hud/hud-rings";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_auth")({
	beforeLoad: () => {
		if (useAuthStore.getState().isAuthenticated) throw redirect({ to: "/" });
	},
	component: AuthLayout
});

function AuthLayout() {
	return (
		<main className="hud relative h-dvh overflow-y-auto">
			<HudRings className="pointer-events-none fixed top-1/2 left-1/2 size-[min(120vw,120vh)] -translate-x-1/2 -translate-y-1/2 opacity-[0.07]" />
			<div className="relative flex min-h-full flex-col items-center justify-center gap-4 p-4">
				<header className="hud-boot flex flex-col items-center gap-1 text-center">
					<p className="font-black font-display text-hud text-xl tracking-[0.3em] hud-glow">AGRO·CUBE</p>
					<p className="text-[10px] text-muted-fg tracking-[0.3em]">TERMINAL D'ACCÈS</p>
				</header>
				<div className="w-full max-w-md">
					<Outlet />
				</div>
			</div>
		</main>
	);
}
