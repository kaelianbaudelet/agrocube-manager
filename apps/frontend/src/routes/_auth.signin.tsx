import { LoginSchema } from "@repo/shared";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
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
		<Card>
			<CardHeader title="Connexion" description="Connecte-toi à ton compte" />
			<form onSubmit={onSubmit} noValidate>
				<CardContent className="space-y-4">
					<FormField label="Email" type="email" autoComplete="email" {...field("email")} />
					<FormField label="Mot de passe" type="password" autoComplete="current-password" {...field("password")} />
				</CardContent>
				<CardFooter className="mt-6 flex flex-col items-stretch gap-3">
					<Button type="submit" isDisabled={mutation.isPending}>
						{mutation.isPending ? "Connexion…" : "Se connecter"}
					</Button>
					<p className="text-center text-muted-fg text-sm">
						Pas de compte ?{" "}
						<Link to="/signup" className="font-medium text-primary hover:underline">
							Créer un compte
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}
