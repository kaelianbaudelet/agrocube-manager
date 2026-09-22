import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { authApi, usersApi } from "@/lib/endpoints";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_app")({
	beforeLoad: () => {
		if (!useAuthStore.getState().isAuthenticated) throw redirect({ to: "/signin" });
	},
	component: AppLayout
});

const navLinkClass =
	"text-muted-fg text-sm hover:text-fg data-[status=active]:font-medium data-[status=active]:text-fg";

function AppLayout() {
	const navigate = useNavigate();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const user = useAuthStore((s) => s.user);
	const setUser = useAuthStore((s) => s.setUser);
	const logout = useAuthStore((s) => s.logout);

	// Resync the cached user with the API (also validates the session on load).
	const me = useQuery({ queryKey: ["me"], queryFn: usersApi.me, enabled: isAuthenticated });
	useEffect(() => {
		if (me.data) setUser(me.data);
	}, [me.data, setUser]);

	const logoutMutation = useMutation({
		mutationFn: authApi.logout,
		onSettled: () => {
			logout();
			queryClient.clear();
			navigate({ to: "/signin" });
		}
	});

	// A failed token refresh calls logout() from api.ts: leave the protected area.
	if (!isAuthenticated) return <Navigate to="/signin" />;

	return (
		<div className="min-h-dvh">
			<header className="border-b">
				<nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
					<span className="font-semibold">{env.VITE_APP_NAME}</span>
					<Link to="/" activeOptions={{ exact: true }} className={navLinkClass}>
						Dashboard
					</Link>
					<Link to="/profile" className={navLinkClass}>
						Profil
					</Link>
					<div className="ml-auto flex items-center gap-3">
						<span className="text-muted-fg text-sm">{user?.username}</span>
						<Button
							intent="outline"
							size="sm"
							onPress={() => logoutMutation.mutate()}
							isDisabled={logoutMutation.isPending}
						>
							Déconnexion
						</Button>
					</div>
				</nav>
			</header>
			<main className="mx-auto max-w-5xl px-4 py-8">
				<Outlet />
			</main>
		</div>
	);
}
