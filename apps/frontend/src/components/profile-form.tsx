import { UpdateProfileSchema, type User } from "@repo/shared";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { usersApi } from "@/lib/endpoints";
import { type FieldErrors, validate } from "@/lib/form";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/stores/useAuthStore";

export function ProfileForm({ user }: { user: User }) {
	const setUser = useAuthStore((s) => s.setUser);
	const [values, setValues] = useState({
		username: user.username,
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email
	});
	const [errors, setErrors] = useState<FieldErrors>({});

	const mutation = useMutation({
		mutationFn: usersApi.updateProfile,
		onSuccess: (updated) => {
			setUser(updated);
			queryClient.setQueryData(["me"], updated);
			setValues({
				username: updated.username,
				firstName: updated.firstName,
				lastName: updated.lastName,
				email: updated.email
			});
			toast.success("Profil mis à jour");
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
		const { data, errors } = validate(UpdateProfileSchema, values);
		setErrors(errors ?? {});
		if (data) mutation.mutate(data);
	}

	return (
		<Card>
			<CardHeader title="Informations" description="Ton nom d'utilisateur, ton nom et ton email" />
			<form onSubmit={onSubmit} noValidate>
				<CardContent className="space-y-4">
					<FormField label="Nom d'utilisateur" autoComplete="username" {...field("username")} />
					<div className="grid grid-cols-2 gap-4">
						<FormField label="Prénom" autoComplete="given-name" {...field("firstName")} />
						<FormField label="Nom" autoComplete="family-name" {...field("lastName")} />
					</div>
					<FormField label="Email" type="email" autoComplete="email" {...field("email")} />
				</CardContent>
				<CardFooter className="mt-6 flex justify-end">
					<Button type="submit" isDisabled={mutation.isPending}>
						{mutation.isPending ? "Enregistrement…" : "Enregistrer"}
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}
