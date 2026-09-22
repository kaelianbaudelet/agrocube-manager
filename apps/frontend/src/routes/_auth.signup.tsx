import { RegisterSchema } from "@repo/shared";
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
		<Card>
			<CardHeader title="Créer un compte" description="Quelques infos et c'est parti" />
			<form onSubmit={onSubmit} noValidate>
				<CardContent className="space-y-4">
					<FormField label="Nom d'utilisateur" autoComplete="username" {...field("username")} />
					<div className="grid grid-cols-2 gap-4">
						<FormField label="Prénom" autoComplete="given-name" {...field("firstName")} />
						<FormField label="Nom" autoComplete="family-name" {...field("lastName")} />
					</div>
					<FormField label="Email" type="email" autoComplete="email" {...field("email")} />
					<FormField label="Mot de passe" type="password" autoComplete="new-password" {...field("password")} />
				</CardContent>
				<CardFooter className="mt-6 flex flex-col items-stretch gap-3">
					<Button type="submit" isDisabled={mutation.isPending}>
						{mutation.isPending ? "Création…" : "Créer mon compte"}
					</Button>
					<p className="text-center text-muted-fg text-sm">
						Déjà inscrit ?{" "}
						<Link to="/signin" className="font-medium text-primary hover:underline">
							Se connecter
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}
