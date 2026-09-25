import { LoginSchema } from "@repo/shared";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { HudButton } from "@/components/hud/hud-button";
import { HudPanel } from "@/components/hud/panel";
import { authApi } from "@/lib/endpoints";
import { type FieldErrors, validate } from "@/lib/form";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_auth/signin")({
	component: SignInPage
});

function SignInPage() {
	const navigate = useNavigate();
	const login = useAuthStore((s) => s.login);
	const [values, setValues] = useState({ email: "", password: "" });
	const [errors, setErrors] = useState<FieldErrors>({});

	const mutation = useMutation({
		mutationFn: authApi.login,
		onSuccess: ({ user, accessToken, refreshToken }) => {
			login(user, accessToken, refreshToken);
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
		const { data, errors } = validate(LoginSchema, values);
		setErrors(errors ?? {});
		if (data) mutation.mutate(data);
	}

	return (
		<HudPanel title="Connexion" bodyClassName="p-4">
			<p className="mb-4 text-muted-fg text-xs">Connecte-toi à ton compte</p>
			<form onSubmit={onSubmit} noValidate>
				<div className="space-y-3">
					<FormField label="Email" type="email" autoComplete="email" {...field("email")} />
					<FormField label="Mot de passe" type="password" autoComplete="current-password" {...field("password")} />
				</div>
				<div className="mt-5 flex flex-col items-stretch gap-3">
					<HudButton type="submit" isDisabled={mutation.isPending}>
						{mutation.isPending ? "Connexion…" : "Se connecter"}
					</HudButton>
				</div>
			</form>
		</HudPanel>
	);
}
