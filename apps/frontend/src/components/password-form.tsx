import { ChangePasswordSchema } from "@repo/shared";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { HudButton } from "@/components/hud/hud-button";
import { HudPanel } from "@/components/hud/panel";
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
		<HudPanel title="Sécurité" bodyClassName="flex flex-col p-3">
			<p className="mb-3 text-muted-fg text-xs">12 caractères min., avec majuscule, minuscule, chiffre et symbole</p>
			<form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
				<div className="space-y-3">
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
				</div>
				<div className="mt-auto flex justify-end pt-4">
					<HudButton type="submit" isDisabled={mutation.isPending}>
						{mutation.isPending ? "Modification…" : "Changer le mot de passe"}
					</HudButton>
				</div>
			</form>
		</HudPanel>
	);
}
