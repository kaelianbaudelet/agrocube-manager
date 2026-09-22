import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ChangePasswordSchema, LoginSchema, RegisterSchema, UpdateProfileSchema } from "../dist/index.js";

const valid = {
	username: "alice_01",
	email: "  Alice@Test.DEV ",
	firstName: "Alice",
	lastName: "Martin",
	password: "Password123!x"
};

const ok = RegisterSchema.safeParse(valid);
assert.ok(ok.success, "register valide");
assert.equal(ok.data.email, "alice@test.dev", "email trim + minuscules");

const invalid = (patch, label) => assert.equal(RegisterSchema.safeParse({ ...valid, ...patch }).success, false, label);
invalid({ password: "Short1!" }, "mot de passe < 12");
invalid({ password: "password123!xx" }, "mot de passe sans majuscule");
invalid({ password: "PASSWORD123!XX" }, "mot de passe sans minuscule");
invalid({ password: "Passwordabc!xx" }, "mot de passe sans chiffre");
invalid({ password: "Password123xxx" }, "mot de passe sans caractère spécial");
invalid({ password: `A1!${"a".repeat(70)}` }, "mot de passe > 72");
invalid({ username: "ab" }, "username < 3");
invalid({ username: "alice martin" }, "username avec espace");
invalid({ email: "pas-un-email" }, "email invalide");
invalid({ firstName: "   " }, "prénom vide après trim");

assert.equal(LoginSchema.safeParse({ email: "a@b.co", password: "x" }).success, true, "login sans politique de mdp");
assert.equal(LoginSchema.parse({ email: "A@B.CO", password: "x" }).email, "a@b.co", "login normalise l'email");

assert.equal(UpdateProfileSchema.safeParse({ firstName: "Bob" }).success, true, "update partiel");
assert.equal(UpdateProfileSchema.safeParse({ username: "a" }).success, false, "update username invalide");

const same = ChangePasswordSchema.safeParse({ currentPassword: "Password123!x", newPassword: "Password123!x" });
assert.equal(same.success, false, "nouveau mdp identique refusé");
assert.deepEqual(same.error.issues[0].path, ["newPassword"]);

const require = createRequire(import.meta.url);
assert.equal(typeof require("../dist/index.cjs").RegisterSchema.safeParse, "function", "build CJS utilisable");

console.log("✓ @repo/shared : tous les checks passent");
