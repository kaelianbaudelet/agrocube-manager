import { RegisterSchema } from "@repo/shared";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { HudButton } from "@/components/hud/hud-button";
import { HudPanel } from "@/components/hud/panel";
import { authApi } from "@/lib/endpoints";
import { type FieldErrors, validate } from "@/lib/form";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_auth/signup")({
	component: SignUpPage
});

function SignUpPage() {
	const navigate = useNavigate();
	const login = useAuthStore((s) => s.login);
	const [values, setValues] = useState({ username: "", firstName: "", lastName: "", email: "", password: "" });
	const [errors, setErrors] = useState<FieldErrors>({});

	const mutation = useMutation({
		mutationFn: authApi.register,
		onSuccess: ({ user, accessToken, refreshToken }) => {
			login(user, accessToken, refreshToken);
			toast.success("Compte créé !");
			navigate({ to: "/" });
		},
		onError: (error) => toast.error(error.message)
	});

	const field = (key: keyof typeof values) => ({
		name: key,
		value: values[key],
		error: errors[key],
		onChange: (value: string) => setValues((v) => ({ ...v, [key]: value }))
	});

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const { data, errors } = validate(RegisterSchema, values);
		setErrors(errors ?? {});
		if (data) mutation.mutate(data);
	}

	return (
		<HudPanel title="Nouvel opérateur" bodyClassName="p-4">
			<p className="mb-4 text-muted-fg text-xs">Quelques infos et c'est parti</p>
			<form onSubmit={onSubmit} noValidate>
				<div className="space-y-3">
					<FormField label="Nom d'utilisateur" autoComplete="username" {...field("username")} />
					<div className="grid grid-cols-2 gap-3">
						<FormField label="Prénom" autoComplete="given-name" {...field("firstName")} />
						<FormField label="Nom" autoComplete="family-name" {...field("lastName")} />
					</div>
					<FormField label="Email" type="email" autoComplete="email" {...field("email")} />
					<FormField label="Mot de passe" type="password" autoComplete="new-password" {...field("password")} />
				</div>
				<div className="mt-5 flex flex-col items-stretch gap-3">
					<HudButton type="submit" isDisabled={mutation.isPending}>
						{mutation.isPending ? "Création…" : "Créer mon compte"}
					</HudButton>
					<p className="text-center text-muted-fg text-xs">
						Déjà inscrit ?{" "}
						<Link
							to="/signin"
							className="text-hud uppercase tracking-widest outline-none hover:hud-glow focus-visible:underline"
						>
							Se connecter
						</Link>
					</p>
				</div>
			</form>
		</HudPanel>
	);
}
