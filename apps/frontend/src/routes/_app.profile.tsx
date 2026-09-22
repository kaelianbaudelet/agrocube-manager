import { createFileRoute } from "@tanstack/react-router";
import { PasswordForm } from "@/components/password-form";
import { ProfileForm } from "@/components/profile-form";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_app/profile")({
	component: ProfilePage
});

function ProfilePage() {
	const user = useAuthStore((s) => s.user);
	if (!user) return null;
	return (
		<section className="mx-auto max-w-2xl space-y-6">
			<h1 className="font-semibold text-2xl">Profil</h1>
			<ProfileForm key={user.id} user={user} />
			<PasswordForm />
		</section>
	);
}
