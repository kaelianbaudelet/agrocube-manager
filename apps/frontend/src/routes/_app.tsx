import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator } from "react-aria-components";
import { DeviceDialogs } from "@/components/hud/device-dialogs";
import { GearIcon } from "@/components/hud/gear-icon";
import { PageTabBar } from "@/components/hud/page-tab-bar";
import { useNow, usePlantLive } from "@/hooks/use-plant";
import { authApi, usersApi } from "@/lib/endpoints";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_app")({
	beforeLoad: () => {
		if (!useAuthStore.getState().isAuthenticated) throw redirect({ to: "/signin" });
	},
	component: AppLayout
});

function Clock() {
	const now = useNow();
	return (
		<time className="hidden shrink-0 font-display text-hud text-xs tabular-nums tracking-widest sm:block">
			{new Date(now).toLocaleTimeString("fr-FR")}
		</time>
	);
}

const menuItemClass =
	"flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.2em] outline-none focus:bg-hud/15 focus:text-hud disabled:opacity-50";

interface UserMenuProps {
	username?: string;
	email?: string;
	onProfile: () => void;
	onLogout: () => void;
	isLoggingOut: boolean;
}

function UserMenu({ username, email, onProfile, onLogout, isLoggingOut }: UserMenuProps) {
	return (
		<MenuTrigger>
			<Button className="group flex h-7 min-w-0 cursor-pointer items-center gap-2 border border-hud/30 px-2 text-[11px] text-muted-fg uppercase tracking-widest outline-none hover:border-hud/60 hover:text-fg focus-visible:ring-1 focus-visible:ring-hud pressed:border-hud pressed:text-hud">
				<span className="size-1.5 shrink-0 rotate-45 bg-hud" aria-hidden />
				<span className="min-w-0 max-w-40 truncate">{username ?? "Opérateur"}</span>
				<svg
					viewBox="0 0 16 16"
					className="size-3 shrink-0 transition-transform group-aria-expanded:rotate-180"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.8}
					aria-hidden
				>
					<path d="M4 6l4 4 4-4" />
				</svg>
			</Button>
			<Popover
				placement="bottom end"
				offset={6}
				className="hud-panel min-w-56 bg-bg/95 outline-none entering:fade-in entering:animate-in exiting:fade-out exiting:animate-out"
			>
				<Menu className="py-1 outline-none" aria-label="Menu opérateur">
					<MenuSection>
						<Header className="px-3 py-2">
							<p className="font-display text-fg text-xs tracking-[0.15em]">{username}</p>
							<p className="truncate text-[10px] text-muted-fg">{email}</p>
						</Header>
					</MenuSection>
					<Separator className="my-1 border-hud/15 border-t" />
					<MenuItem onAction={onProfile} className={`${menuItemClass} text-fg`}>
						<GearIcon className="size-3.5" />
						Paramètres
					</MenuItem>
					<MenuItem
						onAction={onLogout}
						isDisabled={isLoggingOut}
						className={`${menuItemClass} text-crit focus:bg-crit/10 focus:text-crit`}
					>
						<svg
							viewBox="0 0 16 16"
							className="size-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth={1.8}
							aria-hidden
						>
							<path d="M8 1.5v6M4.5 3.8a5.5 5.5 0 107 0" />
						</svg>
						Déconnexion
					</MenuItem>
				</Menu>
			</Popover>
		</MenuTrigger>
	);
}

function AppLayout() {
	const navigate = useNavigate();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const user = useAuthStore((s) => s.user);
	const setUser = useAuthStore((s) => s.setUser);
	const logout = useAuthStore((s) => s.logout);
	// Realtime events for the whole app, not just the dashboard.
	usePlantLive();

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
			// Lazy: keeps the AI SDK out of the main bundle (nothing to reset if the assistant never loaded).
			void import("@/lib/assistant").then((m) => m.resetAssistant());
			navigate({ to: "/signin" });
		}
	});

	// A failed token refresh calls logout() from api.ts: leave the protected area.
	if (!isAuthenticated) return <Navigate to="/signin" />;

	return (
		<div className="hud flex h-dvh flex-col overflow-hidden">
			<header className="flex h-10 shrink-0 items-center gap-3 border-hud/20 border-b bg-bg/60 px-3">
				<Link
					to="/"
					aria-label="Tableau de bord"
					className="flex shrink-0 items-baseline gap-2 outline-none focus-visible:ring-1 focus-visible:ring-hud"
				>
					<span className="font-display font-black text-hud text-sm tracking-[0.25em] hud-glow">AGRO·CUBE</span>
				</Link>
				<div className="ml-auto flex min-w-0 items-center gap-3">
					<Clock />
					<UserMenu
						username={user?.username}
						email={user?.email}
						onProfile={() => navigate({ to: "/profile" })}
						onLogout={() => logoutMutation.mutate()}
						isLoggingOut={logoutMutation.isPending}
					/>
				</div>
			</header>
			<PageTabBar />
			<main className="relative min-h-0 flex-1">
				<Outlet />
			</main>
			<DeviceDialogs />
		</div>
	);
}
