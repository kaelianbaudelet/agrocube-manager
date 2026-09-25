import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysPanel } from "@/components/api-keys-panel";
import { PasswordForm } from "@/components/password-form";
import { ProfileForm } from "@/components/profile-form";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_app/profile")({
	component: ProfilePage
});

function ProfilePage() {
	const user = useAuthStore((s) => s.user);
	if (!user) return null;
	const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

	return (
		<div className="h-full overflow-y-auto p-2">
			<div className="flex min-h-full flex-col gap-2">
				<section className="hud-panel hud-boot flex shrink-0 items-center gap-3 px-3 py-2">
					<div
						className="flex size-11 shrink-0 items-center justify-center bg-hud/15 font-display text-hud text-sm hud-glow"
						style={{ clipPath: "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)" }}
						aria-hidden
					>
						{initials}
					</div>
					<div className="min-w-0">
						<p className="truncate font-display text-fg text-sm tracking-[0.15em]">
							{user.firstName} {user.lastName}
						</p>
						<p className="truncate text-[11px] text-muted-fg tracking-wider">
							@{user.username} · {user.email}
						</p>
					</div>
					<div className="ml-auto hidden text-right text-[10px] text-muted-fg uppercase tracking-widest sm:block">
						<p>Opérateur depuis</p>
						<p className="text-hud">{new Date(user.createdAt).toLocaleDateString("fr-FR", { dateStyle: "long" })}</p>
					</div>
				</section>
				<div className="flex flex-col gap-2">
					<ProfileForm key={user.id} user={user} />
					<PasswordForm />
					<ApiKeysPanel />
				</div>
			</div>
		</div>
	);
}
