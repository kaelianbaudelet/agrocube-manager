import { z } from "zod";

export const zEmail = () => z.string().trim().toLowerCase().pipe(z.email("Email invalide"));

export const zUsername = () =>
	z
		.string()
		.trim()
		.min(3, "3 caractères minimum")
		.max(30, "30 caractères maximum")
		.regex(/^[a-zA-Z0-9_.-]+$/, "Lettres, chiffres, _ . - uniquement");

export const zName = () => z.string().trim().min(1, "Champ requis").max(50, "50 caractères maximum");

export const zPassword = () =>
	z
		.string()
		.min(12, "Le mot de passe doit contenir au moins 12 caractères")
		.max(72, "Le mot de passe doit contenir au plus 72 caractères")
		.regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
		.regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
		.regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre")
		.regex(/[^A-Za-z0-9]/, "Le mot de passe doit contenir au moins un caractère spécial");
