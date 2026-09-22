import { ChangePasswordSchema } from "@repo/shared";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { usersApi } from "@/lib/endpoints";
import { type FieldErrors, validate } from "@/lib/form";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function PasswordForm() {
	const [values, setValues] = useState(EMPTY);
	const [errors, setErrors] = useState<FieldErrors>({});

	const mutation = useMutation({
		mutationFn: usersApi.changePassword,
		onSuccess: () => {
			setValues(EMPTY);
			toast.success("Mot de passe modifié. Tes autres sessions ont été déconnectées.");
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
		const { confirmPassword, ...payload } = values;
		const { data, errors } = validate(ChangePasswordSchema, payload);
		const nextErrors: FieldErrors = { ...errors };
		if (confirmPassword !== payload.newPassword) {
			nextErrors.confirmPassword = "Les mots de passe ne correspondent pas";
		}
		setErrors(nextErrors);
		if (data && !nextErrors.confirmPassword) mutation.mutate(data);
	}

	return (
		<Card>
			<CardHeader
				title="Mot de passe"
				description="12 caractères min., avec majuscule, minuscule, chiffre et symbole"
			/>
			<form onSubmit={onSubmit} noValidate>
				<CardContent className="space-y-4">
					<FormField
						label="Mot de passe actuel"
						type="password"
						autoComplete="current-password"
						{...field("currentPassword")}
					/>
					<FormField
						label="Nouveau mot de passe"
						type="password"
						autoComplete="new-password"
						{...field("newPassword")}
					/>
					<FormField
						label="Confirmer le nouveau mot de passe"
						type="password"
						autoComplete="new-password"
						{...field("confirmPassword")}
					/>
				</CardContent>
				<CardFooter className="mt-6 flex justify-end">
					<Button type="submit" isDisabled={mutation.isPending}>
						{mutation.isPending ? "Modification…" : "Changer le mot de passe"}
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}
