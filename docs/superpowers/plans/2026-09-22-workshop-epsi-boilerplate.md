# Workshop EPSI Boilerplate — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer `workshop-epsi/`, un monorepo minimal dérivé de StudentSphere avec auth JWT (access + refresh), un dashboard vide et une page profil (username, prénom, nom, email, mot de passe).

**Architecture:** Monorepo Turborepo + pnpm. `packages/shared` expose les schémas Zod (build tsup ESM+CJS) consommés par `apps/backend` (NestJS 12 + Prisma 7/Postgres, validation via le `StandardSchemaValidationPipe` natif de Nest 12) et `apps/frontend` (Vite + React 19 + TanStack Router/Query + Zustand + Tailwind 4 + composants React Aria portés de StudentSphere). Les refresh tokens sont stockés hashés (SHA-256) dans une table `Session`, avec rotation à chaque refresh.

**Tech Stack:** Node ≥ 22, pnpm 9, Turborepo 2, NestJS 12, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL 17 (Docker), Passport (local / jwt / jwt-refresh), bcryptjs, Zod 4, tsup, Vite 8, React 19, TanStack Router + Query, Zustand 5, Tailwind 4, react-aria-components, sonner, Biome 2.

**Spec:** `docs/superpowers/specs/2026-09-22-workshop-epsi-boilerplate-design.md`

**Projet de référence (source des fichiers portés) :** `/Users/kaelian/Desktop/projet-worshop-epsi/studentsphere` — noté `$SS` ci-dessous.

```bash
export SS=/Users/kaelian/Desktop/projet-worshop-epsi/studentsphere
export WS=/Users/kaelian/Desktop/projet-worshop-epsi/workshop-epsi
```

## Global Constraints

- Racine du projet : `/Users/kaelian/Desktop/projet-worshop-epsi/workshop-epsi/` (repo git déjà initialisé, branche `main`).
- Noms des packages : `@workshop/backend`, `@workshop/frontend`, `@repo/shared`, `@repo/typescript-config`.
- Ports : backend `3001` (HTTP, pas de SSL), frontend `5173`, Postgres exposé sur l'hôte en `5433` (pour ne pas entrer en conflit avec celui de StudentSphere).
- Outillage : **Biome uniquement** (config unique à la racine). Pas de lefthook, commitlint, Swagger, Jest, Sentry, PostHog, CSP guard, mkcert ou MDX.
- Auth : JWT access (15 min = `900` s) + refresh (7 jours = `604800` s), tokens dans `localStorage` côté front sous les clés `workshop.auth.*`.
- Mot de passe : 12 caractères minimum, 72 au maximum (limite de bcrypt), au moins une majuscule, une minuscule, un chiffre et un caractère spécial.
- Username : 3 à 30 caractères, `^[a-zA-Z0-9_.-]+$`.
- Emails : `trim` + minuscules partout (inscription, connexion, profil).
- Messages visibles par l'utilisateur en **français**.
- Commits conventionnels (`feat:`, `chore:`…), terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Hors périmètre : vérification d'email, mot de passe oublié, MFA, OAuth, avatar, rôles, i18n, Swagger, Docker de prod, CI.

**Écarts assumés par rapport à la spec (précisions d'implémentation) :**
- Les durées JWT sont en **secondes numériques** (`JWT_EXPIRES_IN=900`) au lieu de `15m`. C'est plus simple à typer et le calcul de `expiresAt` en devient trivial.
- Les refresh tokens sont hashés en **SHA-256**, pas avec bcrypt. bcrypt tronque à 72 octets, or un JWT est plus long : deux tokens avec le même début seraient acceptés comme identiques.
- `.env.example` est placé **dans chaque app** (`apps/backend`, `apps/frontend`), car c'est là que Nest, Prisma et Vite lisent leur `.env`.
- `UserSchema` devient une **interface TypeScript** `User` : elle sert uniquement de type de réponse.
- Le fichier `nestjs.d.ts` de StudentSphere n'est pas repris : Nest 12 type déjà `schema` nativement. En revanche, on **enregistre** `StandardSchemaValidationPipe` (StudentSphere ne le fait pas, donc sa validation `@Body({ schema })` n'est jamais exécutée).
- Le client Prisma est généré dans `apps/backend/generated/prisma` (hors de `src`), pour que le même chemin relatif fonctionne depuis `src/` et depuis `dist/` sans copie d'assets.
- Tests : pas de Jest (exclu par la spec). Le backend est vérifié par un script de smoke test `apps/backend/scripts/smoke.ts` (fetch + `node:assert`) exécuté contre l'API qui tourne ; `packages/shared` par `scripts/check.mjs`.

## Review Focus

Les cinq situations que la spec implique mais qu'aucun test « chemin nominal » ne couvre, par ordre de probabilité :

1. **Réutilisation d'un refresh token déjà utilisé.** Y compris quand deux refresh ont lieu dans la même seconde (même `iat`/`exp`) : le serveur doit répondre 401. On ajoute donc un `jti` aléatoire et on hashe en SHA-256. Test en Task 4 : « refresh : l'ancien refresh token est refusé après rotation ».
2. **Casse de l'email.** `Alice@Test.DEV` à l'inscription, `ALICE@test.dev` à la connexion ou au profil : on stocke en minuscules, la connexion fonctionne et l'unicité reste respectée. Tests en Task 2 (normalisation), Task 4 (login en majuscules) et Task 5 (PATCH email en majuscules).
3. **Profil : prendre l'email ou le username d'un autre utilisateur, ou renvoyer ses propres valeurs.** Le premier cas doit donner un 409 avec un message clair (pas un 500). Renvoyer ses propres valeurs inchangées doit donner un 200, pas un 409. Tests en Task 5.
4. **Changement de mot de passe avec plusieurs sessions ouvertes.** Les autres sessions sont révoquées : refresh **et** access token donnent 401, car la stratégie JWT vérifie la session. La session courante reste valide. Test en Task 5.
5. **Access token expiré ou invalide dans le navigateur.** Le refresh doit être silencieux. Si le refresh échoue : logout et redirection vers `/signin`, sans boucle. Et une erreur 400 renvoyée par Nest sous forme de tableau de messages doit s'afficher lisiblement dans le toast. Vérification manuelle en Task 6, étape « Vérifier le refresh et l'expiration ».

---

## Structure des fichiers

```
workshop-epsi/
├─ package.json / pnpm-workspace.yaml / turbo.json / biome.json / .npmrc / .gitignore
├─ docker-compose.dev.yml
├─ README.md
├─ packages/
│  ├─ typescript-config/         base.json, nestjs.json, vite.json, react-library.json (copiés)
│  └─ shared/
│     ├─ package.json, tsconfig.json, tsup.config.ts
│     ├─ scripts/check.mjs       tests des schémas
│     └─ src/ fields.ts (primitives Zod), auth.ts, user.ts, index.ts
└─ apps/
   ├─ backend/
   │  ├─ package.json, tsconfig.json, tsconfig.build.json, nest-cli.json, .swcrc, .env.example, prisma.config.ts
   │  ├─ prisma/schema/schema.prisma
   │  ├─ scripts/smoke.ts        smoke tests HTTP
   │  └─ src/
   │     ├─ main.ts, app.module.ts, app.controller.ts
   │     ├─ config/env.ts                    schéma Zod des variables d'env
   │     ├─ prisma/prisma.service.ts, prisma.module.ts
   │     ├─ common/prisma-exception.filter.ts
   │     ├─ auth/ auth.module.ts, auth.controller.ts, auth.service.ts, token.util.ts, types.ts
   │     │        decorators/{public,current-user}.decorator.ts
   │     │        guards/{jwt-auth,jwt-refresh,local-auth}.guard.ts
   │     │        strategies/{local,jwt,jwt-refresh}.strategy.ts
   │     └─ users/ users.module.ts, users.controller.ts, users.service.ts, user.mapper.ts
   └─ frontend/
      ├─ package.json, index.html, vite.config.ts, tsconfig{,.app,.node}.json, .env.example
      └─ src/
         ├─ main.tsx, index.css, env.ts, routeTree.gen.ts (généré, commité)
         ├─ lib/ api.ts, endpoints.ts, form.ts, primitive.ts, query-client.ts
         ├─ stores/useAuthStore.ts
         ├─ components/ form-field.tsx, profile-form.tsx, password-form.tsx
         │  └─ ui/ button.tsx, card.tsx, field.tsx, input.tsx, text-field.tsx (copiés)
         └─ routes/ __root.tsx, _auth.tsx, _auth.signin.tsx, _auth.signup.tsx,
                    _app.tsx, _app.index.tsx, _app.profile.tsx
```

---

### Task 1: Monorepo, outillage et Postgres

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `biome.json`, `.npmrc`, `.gitignore`, `docker-compose.dev.yml`, `README.md`
- Create (copie) : `packages/typescript-config/*`

**Interfaces:**
- Produces : scripts racine `pnpm dev|build|lint|lint:fix|format|typecheck`. Postgres joignable avec `postgresql://workshop:workshop@localhost:5433/workshop`. Config TS `@repo/typescript-config/base.json`.

- [ ] **Step 1 : Fichiers racine**

`package.json` :
```json
{
	"name": "workshop-epsi",
	"private": true,
	"scripts": {
		"build": "turbo run build",
		"dev": "turbo run dev",
		"lint": "turbo run lint",
		"lint:fix": "turbo run lint:fix",
		"format": "turbo run format",
		"typecheck": "turbo run typecheck",
		"db:migrate": "pnpm --filter @workshop/backend db:migrate:dev",
		"db:studio": "pnpm --filter @workshop/backend db:studio",
		"smoke": "pnpm --filter @workshop/backend smoke"
	},
	"devDependencies": {
		"@biomejs/biome": "2.5.11",
		"turbo": "^2.10.0"
	},
	"packageManager": "pnpm@9.0.0",
	"engines": {
		"node": ">=22.0.0",
		"pnpm": ">=9.0.0"
	}
}
```

`pnpm-workspace.yaml` :
```yaml
packages:
  - "apps/*"
  - "packages/*"

onlyBuiltDependencies:
  - "@prisma/engines"
  - "prisma"
  - "esbuild"
  - "@swc/core"
```

`turbo.json` :
```json
{
	"$schema": "https://turborepo.dev/schema.json",
	"ui": "tui",
	"globalPassThroughEnv": ["DATABASE_URL", "NODE_ENV"],
	"tasks": {
		"build": {
			"dependsOn": ["^build", "db:generate"],
			"inputs": ["$TURBO_DEFAULT$", ".env*"],
			"outputs": ["dist/**"]
		},
		"dev": {
			"dependsOn": ["^build", "db:generate"],
			"cache": false,
			"persistent": true
		},
		"typecheck": {
			"dependsOn": ["^build", "db:generate"]
		},
		"lint": {},
		"lint:fix": { "cache": false },
		"format": { "cache": false },
		"db:generate": {
			"inputs": ["prisma/schema/**"],
			"outputs": ["generated/prisma/**"]
		},
		"db:migrate:dev": { "cache": false, "interactive": true },
		"db:studio": { "cache": false, "persistent": true }
	}
}
```

`.npmrc` :
```
engine-strict=false
loglevel=warn
```

`.gitignore` :
```
node_modules
dist
.turbo
*.tsbuildinfo
coverage
.env
.env.local
apps/backend/generated
.DS_Store
```

- [ ] **Step 2 : Biome (config unique, adaptée de `$SS/apps/backend/biome.json`)**

`biome.json` :
```json
{
	"$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
	"vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
	"assist": { "enabled": true, "actions": { "source": { "organizeImports": "on" } } },
	"files": {
		"includes": ["**", "!**/generated", "!**/routeTree.gen.ts", "!**/dist", "!**/*.css"],
		"ignoreUnknown": true
	},
	"formatter": { "enabled": true, "indentStyle": "tab", "indentWidth": 2, "lineEnding": "lf", "lineWidth": 120 },
	"javascript": {
		"formatter": {
			"semicolons": "always",
			"quoteStyle": "double",
			"jsxQuoteStyle": "double",
			"quoteProperties": "asNeeded",
			"trailingCommas": "none",
			"arrowParentheses": "always",
			"bracketSameLine": false,
			"bracketSpacing": true
		},
		"parser": { "unsafeParameterDecoratorsEnabled": true }
	},
	"json": { "formatter": { "trailingCommas": "none" } },
	"linter": {
		"enabled": true,
		"rules": {
			"recommended": true,
			"complexity": {
				"noExcessiveCognitiveComplexity": "warn",
				"noForEach": "error",
				"noUselessConstructor": "off",
				"useArrowFunction": "error",
				"useLiteralKeys": "off"
			},
			"correctness": {
				"noUnusedImports": { "level": "error", "fix": "safe" },
				"useExhaustiveDependencies": "off",
				"useHookAtTopLevel": "error"
			},
			"style": {
				"noNonNullAssertion": "off",
				"useImportType": "off",
				"useNodejsImportProtocol": "error",
				"useConst": "error"
			},
			"suspicious": { "noExplicitAny": "off", "noArrayIndexKey": "off" }
		}
	}
}
```

- [ ] **Step 3 : typescript-config (copie)**

```bash
mkdir -p $WS/packages && cp -R $SS/packages/typescript-config $WS/packages/typescript-config
rm -rf $WS/packages/typescript-config/node_modules
ls $WS/packages/typescript-config
```
Attendu : `base.json  nestjs.json  package.json  react-library.json  vite.json`

- [ ] **Step 4 : Postgres**

`docker-compose.dev.yml` :
```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: workshop-epsi-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: workshop
      POSTGRES_PASSWORD: workshop
      POSTGRES_DB: workshop
    ports:
      - "5433:5432"
    volumes:
      - workshop-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U workshop -d workshop"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  workshop-pgdata:
```

- [ ] **Step 5 : README minimal (complété en Task 7)**

`README.md` :
```markdown
# Workshop EPSI

Boilerplate minimal dérivé de StudentSphere : NestJS + Prisma + Zod côté API, React + TanStack côté front.
Voir `docs/superpowers/specs/` pour la spec.
```

- [ ] **Step 6 : Vérifier**

```bash
cd $WS && pnpm install
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml exec postgres pg_isready -U workshop -d workshop
```
Attendu : l'install se termine sans erreur, puis `/var/run/postgresql:5432 - accepting connections`.

- [ ] **Step 7 : Commit**

```bash
cd $WS && git add -A && git commit -m "chore: scaffold turborepo monorepo with biome and postgres

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `packages/shared` — schémas Zod partagés

**Files:**
- Create: `packages/shared/package.json`, `tsconfig.json`, `tsup.config.ts`, `scripts/check.mjs`, `src/fields.ts`, `src/auth.ts`, `src/user.ts`, `src/index.ts`

**Interfaces:**
- Produces (depuis `@repo/shared`) :
  - `zEmail()`, `zUsername()`, `zName()`, `zPassword()` : fabriques Zod.
  - `RegisterSchema` et `RegisterDto = { username; email; firstName; lastName; password }`.
  - `LoginSchema` et `LoginDto = { email; password }`.
  - `UpdateProfileSchema` et `UpdateProfileDto = Partial<{ username; email; firstName; lastName }>`.
  - `ChangePasswordSchema` et `ChangePasswordDto = { currentPassword; newPassword }`.
  - `interface User { id: string; username: string; email: string; firstName: string; lastName: string; createdAt: string }`.
  - `interface AuthTokens { accessToken: string; refreshToken: string }`.
  - `interface AuthResponse extends AuthTokens { user: User }`.

- [ ] **Step 1 : package.json, tsconfig, tsup**

`packages/shared/package.json` :
```json
{
	"name": "@repo/shared",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"main": "./dist/index.cjs",
	"module": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
			"require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
		}
	},
	"scripts": {
		"build": "tsup",
		"dev": "tsup --watch",
		"test": "node scripts/check.mjs",
		"typecheck": "tsc --noEmit",
		"lint": "biome check .",
		"lint:fix": "biome check --write .",
		"format": "biome format --write ."
	},
	"dependencies": {
		"zod": "^4.5.2"
	},
	"devDependencies": {
		"@biomejs/biome": "2.5.11",
		"@repo/typescript-config": "workspace:*",
		"tsup": "^8.5.0",
		"typescript": "^6.0.3"
	}
}
```

`packages/shared/tsconfig.json` :
```json
{
	"extends": "@repo/typescript-config/base.json",
	"compilerOptions": { "rootDir": "src", "outDir": "dist", "noEmit": true },
	"include": ["src"]
}
```

`packages/shared/tsup.config.ts` :
```ts
import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	sourcemap: true
});
```

- [ ] **Step 2 : Écrire le test (qui doit échouer)**

`packages/shared/scripts/check.mjs` :
```js
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
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il échoue**

Run: `cd $WS && pnpm install && pnpm --filter @repo/shared test`
Expected: FAIL avec `Cannot find module '.../dist/index.js'`

- [ ] **Step 4 : Implémentation**

`packages/shared/src/fields.ts` :
```ts
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
```

`packages/shared/src/auth.ts` :
```ts
import { z } from "zod";
import { zEmail, zName, zPassword, zUsername } from "./fields.js";
import type { User } from "./user.js";

export const RegisterSchema = z.object({
	username: zUsername(),
	email: zEmail(),
	firstName: zName(),
	lastName: zName(),
	password: zPassword()
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
	email: zEmail(),
	password: z.string().min(1, "Mot de passe requis")
});
export type LoginDto = z.infer<typeof LoginSchema>;

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
	user: User;
}
```

`packages/shared/src/user.ts` :
```ts
import { z } from "zod";
import { zEmail, zName, zPassword, zUsername } from "./fields.js";

export interface User {
	id: string;
	username: string;
	email: string;
	firstName: string;
	lastName: string;
	createdAt: string;
}

export const UpdateProfileSchema = z
	.object({
		username: zUsername(),
		email: zEmail(),
		firstName: zName(),
		lastName: zName()
	})
	.partial();
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "Mot de passe actuel requis"),
		newPassword: zPassword()
	})
	.refine((data) => data.currentPassword !== data.newPassword, {
		message: "Le nouveau mot de passe doit être différent de l'actuel",
		path: ["newPassword"]
	});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
```

`packages/shared/src/index.ts` :
```ts
export * from "./auth.js";
export * from "./fields.js";
export * from "./user.js";
```

- [ ] **Step 5 : Build et test**

Run: `cd $WS && pnpm --filter @repo/shared build && pnpm --filter @repo/shared test && pnpm --filter @repo/shared typecheck`
Expected: `✓ @repo/shared : tous les checks passent`, et aucune erreur tsc.
Si la génération des `.d.ts` par tsup échoue avec TypeScript 6, pinner `"typescript": "~5.9.3"` dans ce package uniquement, puis relancer.

- [ ] **Step 6 : Lint et commit**

```bash
cd $WS && pnpm --filter @repo/shared lint:fix && pnpm --filter @repo/shared lint
git add -A && git commit -m "feat(shared): add shared zod schemas for auth and profile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Backend — squelette NestJS, config, Prisma, health

**Files:**
- Create: `apps/backend/package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `.swcrc`, `.env.example`, `prisma.config.ts`, `prisma/schema/schema.prisma`
- Create: `apps/backend/src/main.ts`, `src/app.module.ts`, `src/app.controller.ts`, `src/config/env.ts`, `src/prisma/prisma.service.ts`, `src/prisma/prisma.module.ts`
- Test: `apps/backend/scripts/smoke.ts`

**Interfaces:**
- Consumes : rien de `@repo/shared` pour l'instant (la dépendance est quand même déclarée).
- Produces :
  - `Env` (type), `validateEnv(config)`.
  - `PrismaService` : étend `PrismaClient` (import `../../generated/prisma/client`), fourni par le module global `PrismaModule`.
  - Types Prisma `User` et `Session` depuis `../../generated/prisma/client` (le chemin relatif dépend de la profondeur du fichier appelant).
  - `GET /health` → `{ "status": "ok" }`.
  - Script `pnpm --filter @workshop/backend smoke`, avec les helpers `call`, `test` et le marqueur `// ---- runner ----`.

- [ ] **Step 1 : Configuration du package**

`apps/backend/package.json` :
```json
{
	"name": "@workshop/backend",
	"version": "1.0.0",
	"private": true,
	"scripts": {
		"build": "nest build",
		"dev": "nest start --watch",
		"start": "nest start",
		"start:prod": "node dist/main",
		"smoke": "tsx scripts/smoke.ts",
		"db:generate": "prisma generate",
		"db:migrate:dev": "prisma migrate dev",
		"db:migrate:prod": "prisma migrate deploy",
		"db:push": "prisma db push",
		"db:reset": "prisma migrate reset",
		"db:studio": "prisma studio --browser none",
		"typecheck": "tsc --noEmit",
		"lint": "biome check .",
		"lint:fix": "biome check --write .",
		"format": "biome format --write ."
	},
	"dependencies": {
		"@nestjs/common": "^12.0.1",
		"@nestjs/config": "^12.0.0",
		"@nestjs/core": "^12.0.1",
		"@nestjs/jwt": "^12.0.1",
		"@nestjs/passport": "^12.0.0",
		"@nestjs/platform-express": "^12.0.1",
		"@nestjs/throttler": "^6.5.0",
		"@prisma/adapter-pg": "^7.10.0",
		"@prisma/client": "^7.10.0",
		"@prisma/client-runtime-utils": "^7.10.0",
		"@repo/shared": "workspace:*",
		"@standard-schema/spec": "^1.1.0",
		"bcryptjs": "^3.0.3",
		"dotenv": "^17.4.2",
		"express": "^5.2.1",
		"helmet": "^8.3.0",
		"passport": "^0.7.0",
		"passport-jwt": "^4.0.1",
		"passport-local": "^1.0.0",
		"pg": "^8.23.0",
		"prisma": "7.10.0",
		"reflect-metadata": "^0.2.2",
		"rxjs": "^7.8.2",
		"zod": "^4.5.2"
	},
	"devDependencies": {
		"@biomejs/biome": "2.5.11",
		"@nestjs/cli": "^12.0.0",
		"@nestjs/schematics": "^12.0.0",
		"@repo/typescript-config": "workspace:*",
		"@swc/cli": "^0.8.1",
		"@swc/core": "^1.16.1",
		"@types/express": "^5.0.6",
		"@types/node": "^26.4.0",
		"@types/passport-jwt": "^4.0.1",
		"@types/passport-local": "^1.0.38",
		"@types/pg": "^8.23.1",
		"tsx": "^4.23.12",
		"typescript": "^6.0.3"
	}
}
```

`apps/backend/tsconfig.json` (adapté de `$SS/apps/backend/tsconfig.json`) :
```json
{
	"compilerOptions": {
		"module": "nodenext",
		"moduleResolution": "nodenext",
		"resolvePackageJsonExports": true,
		"esModuleInterop": true,
		"isolatedModules": true,
		"declaration": true,
		"removeComments": true,
		"emitDecoratorMetadata": true,
		"experimentalDecorators": true,
		"allowSyntheticDefaultImports": true,
		"target": "ES2023",
		"sourceMap": true,
		"outDir": "./dist",
		"rootDir": "./src",
		"incremental": true,
		"strict": true,
		"skipLibCheck": true,
		"strictNullChecks": true,
		"forceConsistentCasingInFileNames": true,
		"noImplicitAny": false,
		"strictBindCallApply": false,
		"types": ["node"]
	},
	"include": ["src/**/*"],
	"exclude": ["node_modules", "dist", "scripts", "prisma.config.ts"]
}
```

`apps/backend/tsconfig.build.json` :
```json
{
	"extends": "./tsconfig.json",
	"exclude": ["node_modules", "dist", "scripts", "**/*spec.ts"]
}
```

`apps/backend/nest-cli.json` :
```json
{
	"$schema": "https://json.schemastore.org/nest-cli",
	"collection": "@nestjs/schematics",
	"sourceRoot": "src",
	"compilerOptions": {
		"builder": { "type": "swc", "options": { "swcrcPath": ".swcrc" } },
		"typeCheck": true,
		"deleteOutDir": true
	}
}
```

`apps/backend/.swcrc` (copie de `$SS/apps/backend/.swcrc` sans le support React) :
```json
{
	"jsc": {
		"parser": { "syntax": "typescript", "decorators": true, "dynamicImport": true },
		"transform": { "legacyDecorator": true, "decoratorMetadata": true },
		"target": "es2022",
		"keepClassNames": true,
		"baseUrl": "./"
	},
	"module": { "type": "commonjs" }
}
```

`apps/backend/.env.example` :
```
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://workshop:workshop@localhost:5433/workshop
FRONTEND_URL=http://localhost:5173
# Générer avec : openssl rand -hex 32
JWT_SECRET=change-me-change-me-change-me-change-me-00
JWT_REFRESH_SECRET=change-me-too-change-me-too-change-me-too-00
JWT_EXPIRES_IN=900
JWT_REFRESH_EXPIRES_IN=604800
```

Puis : `cp apps/backend/.env.example apps/backend/.env` et `pnpm install`.

- [ ] **Step 2 : Prisma**

`apps/backend/prisma.config.ts` (copie de `$SS/apps/backend/prisma.config.ts`, sans le seed) :
```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
	schema: "prisma/schema",
	migrations: {
		path: "prisma/migrations"
	},
	datasource: {
		url: env("DATABASE_URL")
	}
});
```

`apps/backend/prisma/schema/schema.prisma` :
```prisma
generator client {
  provider     = "prisma-client-js"
  output       = "../../generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

model User {
  id        String    @id @default(uuid())
  username  String    @unique
  email     String    @unique
  firstName String
  lastName  String
  password  String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  sessions  Session[]
}

model Session {
  id               String   @id @default(uuid())
  userId           String
  refreshTokenHash String
  expiresAt        DateTime
  createdAt        DateTime @default(now())
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Run: `cd $WS/apps/backend && pnpm db:migrate:dev --name init`
Expected: `Your database is now in sync with your schema.`, puis la création de `prisma/migrations/<timestamp>_init/migration.sql` et `generated/prisma/client.js`. Si Prisma refuse `moduleFormat` avec `prisma-client-js`, retirer cette ligne (le générateur `prisma-client-js` produit déjà du CJS).

- [ ] **Step 3 : Écrire le smoke test (qui doit échouer)**

`apps/backend/scripts/smoke.ts` :
```ts
import assert from "node:assert/strict";

const API = process.env.API_URL ?? "http://localhost:3001";

type Json = Record<string, any>;

async function call(method: string, path: string, opts: { body?: unknown; token?: string } = {}) {
	const res = await fetch(`${API}${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {})
		},
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
	});
	const text = await res.text();
	return { status: res.status, body: (text ? JSON.parse(text) : null) as Json };
}

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => {
	tests.push([name, fn]);
};

// ---- tests ----

test("GET /health répond ok", async () => {
	const r = await call("GET", "/health");
	assert.equal(r.status, 200);
	assert.deepEqual(r.body, { status: "ok" });
});

// ---- runner ----

async function main() {
	let failed = 0;
	for (const [name, fn] of tests) {
		try {
			await fn();
			console.log(`✓ ${name}`);
		} catch (error) {
			failed++;
			console.error(`✗ ${name}\n  ${(error as Error).message}`);
		}
	}
	console.log(`\n${tests.length - failed}/${tests.length} OK`);
	process.exit(failed ? 1 : 0);
}

main();
```

Run: `cd $WS && pnpm smoke`
Expected: FAIL avec `✗ GET /health répond ok` et `fetch failed`, car le serveur n'existe pas encore.

(L'option `token` de `call` ne sert qu'à partir de la Task 4.)

- [ ] **Step 4 : Config, Prisma, App**

`apps/backend/src/config/env.ts` :
```ts
import { z } from "zod";

export const EnvSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().int().positive().default(3001),
	DATABASE_URL: z.string().min(1),
	FRONTEND_URL: z.url().default("http://localhost:5173"),
	JWT_SECRET: z.string().min(32),
	JWT_REFRESH_SECRET: z.string().min(32),
	JWT_EXPIRES_IN: z.coerce.number().int().positive().default(900),
	JWT_REFRESH_EXPIRES_IN: z.coerce.number().int().positive().default(604800)
});

export type Env = z.infer<typeof EnvSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => EnvSchema.parse(config);
```

`apps/backend/src/prisma/prisma.service.ts` (porté de `$SS/apps/backend/src/prisma/prisma.service.ts`) :
```ts
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { Env } from "../config/env";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
	constructor(configService: ConfigService<Env, true>) {
		const adapter = new PrismaPg({ connectionString: configService.get("DATABASE_URL", { infer: true }) });
		super({ adapter });
	}

	async onModuleDestroy() {
		await this.$disconnect();
	}
}
```

`apps/backend/src/prisma/prisma.module.ts` :
```ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
	providers: [PrismaService],
	exports: [PrismaService]
})
export class PrismaModule {}
```

`apps/backend/src/app.controller.ts` (le décorateur `@Public()` sera ajouté en Task 4, quand le guard global existera) :
```ts
import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
	@Get("health")
	health() {
		return { status: "ok" };
	}
}
```

`apps/backend/src/app.module.ts` :
```ts
import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_PIPE } from "@nestjs/core";
import { AppController } from "./app.controller";
import { validateEnv } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
	imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule],
	controllers: [AppController],
	providers: [
		/**
		 * Validates every @Body({ schema }) / @Query({ schema }) against its Zod (Standard Schema) schema.
		 */
		{ provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() }
	]
})
export class AppModule {}
```

`apps/backend/src/main.ts` :
```ts
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { Env } from "./config/env";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	const config = app.get<ConfigService<Env, true>>(ConfigService);

	app.use(helmet());
	app.enableCors({ origin: config.get("FRONTEND_URL", { infer: true }) });

	const port = config.get("PORT", { infer: true });
	await app.listen(port);
	Logger.log(`API prête sur http://localhost:${port}`, "Bootstrap");
}

bootstrap();
```

- [ ] **Step 5 : Lancer le smoke test pour vérifier qu'il passe**

Terminal 1 : `cd $WS && pnpm --filter @workshop/backend dev`. Attendre la ligne `API prête sur http://localhost:3001`.
Terminal 2 : `cd $WS && pnpm smoke`
Expected: `✓ GET /health répond ok` et `1/1 OK`

Vérifier aussi que la validation d'env bloque bien : lancer `JWT_SECRET=court pnpm --filter @workshop/backend start` doit échouer avec une erreur Zod sur `JWT_SECRET`.

- [ ] **Step 6 : Typecheck, lint, commit**

```bash
cd $WS && pnpm --filter @workshop/backend typecheck && pnpm --filter @workshop/backend lint:fix && pnpm --filter @workshop/backend lint
git add -A && git commit -m "feat(backend): scaffold nestjs api with config, prisma and health check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Backend — auth (register, login, refresh, logout)

**Files:**
- Create: `apps/backend/src/auth/{auth.module,auth.controller,auth.service,token.util,types}.ts`
- Create: `apps/backend/src/auth/decorators/{public,current-user}.decorator.ts`
- Create: `apps/backend/src/auth/guards/{jwt-auth,jwt-refresh,local-auth}.guard.ts`
- Create: `apps/backend/src/auth/strategies/{local,jwt,jwt-refresh}.strategy.ts`
- Create: `apps/backend/src/users/{users.module,users.service,user.mapper}.ts` (le service est réduit à `assertAvailable` ; la Task 5 le complète)
- Create: `apps/backend/src/common/prisma-exception.filter.ts`
- Modify: `apps/backend/src/app.module.ts`, `apps/backend/src/app.controller.ts`
- Test: `apps/backend/scripts/smoke.ts`

**Interfaces:**
- Consumes : `RegisterSchema`, `RegisterDto`, `LoginSchema`, `AuthResponse`, `AuthTokens`, `User` depuis `@repo/shared` ; `PrismaService` ; `Env`.
- Produces :
  - `POST /auth/register` : 201 `AuthResponse`, 409 si doublon, 400 si invalide.
  - `POST /auth/login` : 200 `AuthResponse`, 401 si identifiants invalides.
  - `POST /auth/refresh` : 200 `AuthTokens`, avec le refresh token en `Authorization: Bearer <refresh>` ; 401 si le token est réutilisé ou invalide.
  - `POST /auth/logout` : 204, access token requis.
  - `@Public()` et `@CurrentUser(key?)`.
  - `type AuthUser = User(Prisma) & { sessionId: string }` : c'est ce que contient `req.user` sur les routes protégées.
  - `toPublicUser(user: PrismaUser): User` dans `users/user.mapper.ts`.
  - `UsersService.assertAvailable({ email?, username? }, excludeUserId?)` : lève `ConflictException`.
  - `BCRYPT_ROUNDS = 12`, exporté depuis `users/users.service.ts`.

- [ ] **Step 1 : Écrire les tests auth (qui doivent échouer)**

Dans `apps/backend/scripts/smoke.ts`, ajouter en haut `import { randomUUID } from "node:crypto";` (sous l'import de `node:assert/strict`), puis insérer **juste avant** la ligne `// ---- runner ----` :
```ts
const suffix = randomUUID().slice(0, 8);
const PASSWORD = "Password123!x";
const makeUser = (name: string) => ({
	username: `${name}_${suffix}`,
	email: `${name}_${suffix}@test.dev`,
	firstName: name,
	lastName: "Test",
	password: PASSWORD
});

const alice = makeUser("alice");
const bob = makeUser("bob");
const auth: { access?: string; refresh?: string } = {};

test("register : crée l'utilisateur et renvoie les tokens", async () => {
	const r = await call("POST", "/auth/register", { body: { ...alice, email: alice.email.toUpperCase() } });
	assert.equal(r.status, 201, JSON.stringify(r.body));
	assert.equal(r.body.user.email, alice.email, "email stocké en minuscules");
	assert.equal(r.body.user.username, alice.username);
	assert.equal(r.body.user.password, undefined, "pas de mot de passe dans la réponse");
	assert.ok(r.body.accessToken && r.body.refreshToken);
	const r2 = await call("POST", "/auth/register", { body: bob });
	assert.equal(r2.status, 201);
});

test("register : email déjà utilisé → 409", async () => {
	const r = await call("POST", "/auth/register", { body: { ...alice, username: `other_${suffix}` } });
	assert.equal(r.status, 409);
	assert.match(String(r.body.message), /email/i);
});

test("register : username déjà utilisé → 409", async () => {
	const r = await call("POST", "/auth/register", { body: { ...alice, email: `other_${suffix}@test.dev` } });
	assert.equal(r.status, 409);
	assert.match(String(r.body.message), /utilisateur/i);
});

test("register : données invalides → 400", async () => {
	const r = await call("POST", "/auth/register", { body: { ...makeUser("carol"), password: "court" } });
	assert.equal(r.status, 400);
});

test("login : email en majuscules accepté", async () => {
	const r = await call("POST", "/auth/login", { body: { email: alice.email.toUpperCase(), password: PASSWORD } });
	assert.equal(r.status, 200, JSON.stringify(r.body));
	assert.equal(r.body.user.email, alice.email);
	auth.access = r.body.accessToken;
	auth.refresh = r.body.refreshToken;
});

test("login : mauvais mot de passe → 401", async () => {
	const r = await call("POST", "/auth/login", { body: { email: alice.email, password: "Wrong123!pass" } });
	assert.equal(r.status, 401);
});

test("refresh : renvoie de nouveaux tokens, l'ancien refresh token est refusé après rotation", async () => {
	const old = auth.refresh;
	const r = await call("POST", "/auth/refresh", { token: old });
	assert.equal(r.status, 200, JSON.stringify(r.body));
	assert.ok(r.body.accessToken && r.body.refreshToken);
	assert.notEqual(r.body.refreshToken, old);
	auth.access = r.body.accessToken;
	auth.refresh = r.body.refreshToken;
	const reuse = await call("POST", "/auth/refresh", { token: old });
	assert.equal(reuse.status, 401, "réutilisation refusée");
});

test("refresh : un access token n'est pas accepté comme refresh token", async () => {
	const r = await call("POST", "/auth/refresh", { token: auth.access });
	assert.equal(r.status, 401);
});

test("logout : supprime la session (refresh et access invalidés)", async () => {
	const r = await call("POST", "/auth/logout", { token: auth.access });
	assert.equal(r.status, 204);
	assert.equal((await call("POST", "/auth/refresh", { token: auth.refresh })).status, 401);
	assert.equal((await call("POST", "/auth/logout", { token: auth.access })).status, 401);
});
```

Run (le serveur de la Task 3 tourne toujours) : `cd $WS && pnpm smoke`
Expected: FAIL, avec des 404 sur `/auth/*`.

- [ ] **Step 2 : Utilitaires, types, mapper, filtre Prisma**

`apps/backend/src/auth/types.ts` :
```ts
import type { User } from "../../generated/prisma/client";

export interface JwtPayload {
	sub: string;
	sessionId: string;
	jti?: string;
}

export type AuthUser = User & { sessionId: string };

export interface RefreshUser {
	sessionId: string;
	userId: string;
	refreshToken: string;
}
```

`apps/backend/src/auth/token.util.ts` :
```ts
import { createHash } from "node:crypto";

/**
 * SHA-256 (not bcrypt): bcrypt truncates input at 72 bytes, and JWTs are longer.
 */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
```

`apps/backend/src/users/user.mapper.ts` :
```ts
import type { User } from "@repo/shared";
import type { User as PrismaUser } from "../../generated/prisma/client";

export const toPublicUser = (user: PrismaUser): User => ({
	id: user.id,
	username: user.username,
	email: user.email,
	firstName: user.firstName,
	lastName: user.lastName,
	createdAt: user.createdAt.toISOString()
});
```

`apps/backend/src/common/prisma-exception.filter.ts` (filet de sécurité si une race condition passe malgré `assertAvailable`) :
```ts
import { ArgumentsHost, Catch, ConflictException, HttpException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { Prisma } from "../../generated/prisma/client";

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
	catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
		const mapped: HttpException | null =
			exception.code === "P2002" ? new ConflictException("Cette valeur est déjà utilisée") : null;
		super.catch(mapped ?? exception, host);
	}
}
```

- [ ] **Step 3 : UsersService (partie disponibilité) et UsersModule**

`apps/backend/src/users/users.service.ts` :
```ts
import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Throws a 409 if another user already owns this email or username.
	 * `excludeUserId` lets a user re-submit their own current values.
	 */
	async assertAvailable(fields: { email?: string; username?: string }, excludeUserId?: string) {
		const or = [
			...(fields.email ? [{ email: fields.email }] : []),
			...(fields.username ? [{ username: fields.username }] : [])
		];
		if (or.length === 0) return;

		const existing = await this.prisma.user.findFirst({
			where: { OR: or, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) },
			select: { email: true, username: true }
		});
		if (!existing) return;

		if (fields.email && existing.email === fields.email) {
			throw new ConflictException("Cet email est déjà utilisé");
		}
		throw new ConflictException("Ce nom d'utilisateur est déjà utilisé");
	}
}
```

`apps/backend/src/users/users.module.ts` :
```ts
import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";

@Module({
	providers: [UsersService],
	exports: [UsersService]
})
export class UsersModule {}
```

- [ ] **Step 4 : Décorateurs et guards (portés de `$SS/apps/backend/src/auth/`, sans MFA/PAT)**

`apps/backend/src/auth/decorators/public.decorator.ts` :
```ts
import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`apps/backend/src/auth/decorators/current-user.decorator.ts` :
```ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentUser = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
	const request = ctx.switchToHttp().getRequest();
	if (!data) return request.user;
	return request.user?.[data];
});
```

`apps/backend/src/auth/guards/jwt-auth.guard.ts` :
```ts
import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * Global guard: every route requires a valid access token unless marked @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
	constructor(private readonly reflector: Reflector) {
		super();
	}

	canActivate(context: ExecutionContext) {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass()
		]);
		if (isPublic) return true;
		return super.canActivate(context);
	}
}
```

`apps/backend/src/auth/guards/jwt-refresh.guard.ts` :
```ts
import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtRefreshGuard extends AuthGuard("jwt-refresh") {}
```

`apps/backend/src/auth/guards/local-auth.guard.ts` :
```ts
import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class LocalAuthGuard extends AuthGuard("local") {}
```

- [ ] **Step 5 : Stratégies**

`apps/backend/src/auth/strategies/local.strategy.ts` :
```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { AuthService } from "../auth.service";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
	constructor(private readonly authService: AuthService) {
		super({ usernameField: "email" });
	}

	async validate(email: string, password: string) {
		const user = await this.authService.validateUser(email, password);
		if (!user) {
			throw new UnauthorizedException("Email ou mot de passe incorrect");
		}
		return user;
	}
}
```

`apps/backend/src/auth/strategies/jwt.strategy.ts` :
```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser, JwtPayload } from "../types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
	constructor(
		configService: ConfigService<Env, true>,
		private readonly prisma: PrismaService
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: configService.get("JWT_SECRET", { infer: true })
		});
	}

	/**
	 * The session must still exist: logout and password changes revoke access tokens immediately.
	 */
	async validate(payload: JwtPayload): Promise<AuthUser> {
		const session = await this.prisma.session.findUnique({
			where: { id: payload.sessionId },
			include: { user: true }
		});
		if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) {
			throw new UnauthorizedException("Session expirée");
		}
		return { ...session.user, sessionId: session.id };
	}
}
```

`apps/backend/src/auth/strategies/jwt-refresh.strategy.ts` :
```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Env } from "../../config/env";
import { JwtPayload, RefreshUser } from "../types";

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, "jwt-refresh") {
	constructor(configService: ConfigService<Env, true>) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKey: configService.get("JWT_REFRESH_SECRET", { infer: true }),
			passReqToCallback: true
		});
	}

	validate(req: Request, payload: JwtPayload): RefreshUser {
		const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
		if (!refreshToken) throw new UnauthorizedException("Refresh token manquant");
		return { sessionId: payload.sessionId, userId: payload.sub, refreshToken };
	}
}
```

- [ ] **Step 6 : AuthService**

`apps/backend/src/auth/auth.service.ts` :
```ts
import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthResponse, AuthTokens, RegisterDto } from "@repo/shared";
import bcrypt from "bcryptjs";
import type { User } from "../../generated/prisma/client";
import { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { toPublicUser } from "../users/user.mapper";
import { BCRYPT_ROUNDS, UsersService } from "../users/users.service";
import { hashToken } from "./token.util";
import { JwtPayload } from "./types";

@Injectable()
export class AuthService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly jwt: JwtService,
		private readonly config: ConfigService<Env, true>,
		private readonly users: UsersService
	) {}

	async validateUser(email: string, password: string): Promise<User | null> {
		const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
		if (!user) return null;
		return (await bcrypt.compare(password, user.password)) ? user : null;
	}

	async register(dto: RegisterDto): Promise<AuthResponse> {
		await this.users.assertAvailable({ email: dto.email, username: dto.username });
		const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
		const user = await this.prisma.user.create({ data: { ...dto, password } });
		return this.createSession(user);
	}

	login(user: User): Promise<AuthResponse> {
		return this.createSession(user);
	}

	async refresh(sessionId: string, refreshToken: string): Promise<AuthTokens> {
		const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
		if (!session || session.expiresAt < new Date() || session.refreshTokenHash !== hashToken(refreshToken)) {
			throw new UnauthorizedException("Session invalide");
		}
		const tokens = await this.signTokens(session.userId, session.id);
		await this.prisma.session.update({
			where: { id: session.id },
			data: { refreshTokenHash: hashToken(tokens.refreshToken), expiresAt: this.refreshExpiry() }
		});
		return tokens;
	}

	async logout(sessionId: string): Promise<void> {
		await this.prisma.session.deleteMany({ where: { id: sessionId } });
	}

	private async createSession(user: User): Promise<AuthResponse> {
		const sessionId = randomUUID();
		const tokens = await this.signTokens(user.id, sessionId);
		await this.prisma.session.create({
			data: {
				id: sessionId,
				userId: user.id,
				refreshTokenHash: hashToken(tokens.refreshToken),
				expiresAt: this.refreshExpiry()
			}
		});
		return { user: toPublicUser(user), ...tokens };
	}

	/**
	 * `jti` makes every refresh token unique, even when two are signed within the same second.
	 */
	private async signTokens(userId: string, sessionId: string): Promise<AuthTokens> {
		const payload: JwtPayload = { sub: userId, sessionId };
		const [accessToken, refreshToken] = await Promise.all([
			this.jwt.signAsync(payload, {
				secret: this.config.get("JWT_SECRET", { infer: true }),
				expiresIn: this.config.get("JWT_EXPIRES_IN", { infer: true })
			}),
			this.jwt.signAsync(
				{ ...payload, jti: randomUUID() },
				{
					secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
					expiresIn: this.config.get("JWT_REFRESH_EXPIRES_IN", { infer: true })
				}
			)
		]);
		return { accessToken, refreshToken };
	}

	private refreshExpiry() {
		return new Date(Date.now() + this.config.get("JWT_REFRESH_EXPIRES_IN", { infer: true }) * 1000);
	}
}
```

- [ ] **Step 7 : Controller et module**

`apps/backend/src/auth/auth.controller.ts` :
```ts
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { type LoginDto, LoginSchema, type RegisterDto, RegisterSchema } from "@repo/shared";
import type { User } from "../../generated/prisma/client";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { LocalAuthGuard } from "./guards/local-auth.guard";
import type { RefreshUser } from "./types";

@Controller("auth")
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Public()
	@Post("register")
	register(@Body({ schema: RegisterSchema }) dto: RegisterDto) {
		return this.authService.register(dto);
	}

	@Public()
	@UseGuards(LocalAuthGuard)
	@Throttle({ default: { limit: 20, ttl: 60_000 } })
	@HttpCode(HttpStatus.OK)
	@Post("login")
	login(@CurrentUser() user: User, @Body({ schema: LoginSchema }) _dto: LoginDto) {
		return this.authService.login(user);
	}

	@Public()
	@UseGuards(JwtRefreshGuard)
	@HttpCode(HttpStatus.OK)
	@Post("refresh")
	refresh(@CurrentUser() refreshUser: RefreshUser) {
		return this.authService.refresh(refreshUser.sessionId, refreshUser.refreshToken);
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Post("logout")
	logout(@CurrentUser("sessionId") sessionId: string) {
		return this.authService.logout(sessionId);
	}
}
```

`apps/backend/src/auth/auth.module.ts` :
```ts
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtRefreshStrategy } from "./strategies/jwt-refresh.strategy";
import { LocalStrategy } from "./strategies/local.strategy";

@Module({
	imports: [PassportModule, JwtModule.register({}), UsersModule],
	controllers: [AuthController],
	providers: [AuthService, LocalStrategy, JwtStrategy, JwtRefreshStrategy]
})
export class AuthModule {}
```

- [ ] **Step 8 : Brancher dans AppModule, rendre /health public**

`apps/backend/src/app.module.ts` (remplacer tout le fichier) :
```ts
import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { PrismaExceptionFilter } from "./common/prisma-exception.filter";
import { validateEnv } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
		ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
		PrismaModule,
		AuthModule,
		UsersModule
	],
	controllers: [AppController],
	providers: [
		/**
		 * Validates every @Body({ schema }) / @Query({ schema }) against its Zod (Standard Schema) schema.
		 */
		{ provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
		/**
		 * Maps Prisma unique-constraint errors (P2002) to 409.
		 */
		{ provide: APP_FILTER, useClass: PrismaExceptionFilter },
		/**
		 * Secure by default: every route needs an access token unless marked @Public().
		 */
		{ provide: APP_GUARD, useClass: JwtAuthGuard },
		{ provide: APP_GUARD, useClass: ThrottlerGuard }
	]
})
export class AppModule {}
```

`apps/backend/src/app.controller.ts` : ajouter `import { Public } from "./auth/decorators/public.decorator";` et le décorateur `@Public()` au-dessus de `@Get("health")`.

- [ ] **Step 9 : Lancer les tests pour vérifier qu'ils passent**

Le serveur en `--watch` recharge automatiquement. Puis : `cd $WS && pnpm smoke`
Expected: les 10 tests sont `✓`, avec `10/10 OK`.

- [ ] **Step 10 : Typecheck, lint, commit**

```bash
cd $WS && pnpm --filter @workshop/backend typecheck && pnpm --filter @workshop/backend lint:fix && pnpm --filter @workshop/backend lint
git add -A && git commit -m "feat(backend): add jwt auth with register, login, refresh rotation and logout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Backend — profil (`/users/me`)

**Files:**
- Create: `apps/backend/src/users/users.controller.ts`
- Modify: `apps/backend/src/users/users.service.ts` (ajout de `findMe`, `updateProfile`, `changePassword`), `apps/backend/src/users/users.module.ts` (déclaration du controller)
- Test: `apps/backend/scripts/smoke.ts`

**Interfaces:**
- Consumes : `UpdateProfileSchema`, `UpdateProfileDto`, `ChangePasswordSchema`, `ChangePasswordDto`, `User` depuis `@repo/shared` ; `toPublicUser` ; `CurrentUser` ; `AuthUser` ; `BCRYPT_ROUNDS` (déjà défini dans `users.service.ts` depuis la Task 4).
- Produces :
  - `GET /users/me` : 200 `User`.
  - `PATCH /users/me` : 200 `User` ; 409 si doublon ; 400 si invalide.
  - `PATCH /users/me/password` : 204 ; 400 si le mot de passe actuel est incorrect ; révoque les autres sessions.

- [ ] **Step 1 : Écrire les tests profil (qui doivent échouer)**

Dans `apps/backend/scripts/smoke.ts`, insérer **juste avant** `// ---- runner ----` :
```ts
const login = async (email: string, password: string) => {
	const r = await call("POST", "/auth/login", { body: { email, password } });
	assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.body)}`);
	return { access: r.body.accessToken as string, refresh: r.body.refreshToken as string };
};

test("GET /users/me sans token → 401", async () => {
	assert.equal((await call("GET", "/users/me")).status, 401);
});

test("GET /users/me renvoie l'utilisateur sans mot de passe", async () => {
	const s = await login(alice.email, PASSWORD);
	const r = await call("GET", "/users/me", { token: s.access });
	assert.equal(r.status, 200);
	assert.equal(r.body.username, alice.username);
	assert.equal(r.body.password, undefined);
});

test("PATCH /users/me met à jour le profil (email normalisé)", async () => {
	const s = await login(alice.email, PASSWORD);
	const newUsername = `alicia_${suffix}`;
	const newEmail = `alicia_${suffix}@test.dev`;
	const r = await call("PATCH", "/users/me", {
		token: s.access,
		body: { firstName: "Alicia", username: newUsername, email: newEmail.toUpperCase() }
	});
	assert.equal(r.status, 200, JSON.stringify(r.body));
	assert.equal(r.body.firstName, "Alicia");
	assert.equal(r.body.username, newUsername);
	assert.equal(r.body.email, newEmail);
	alice.username = newUsername;
	alice.email = newEmail;
});

test("PATCH /users/me avec ses propres valeurs → 200 (pas 409)", async () => {
	const s = await login(alice.email, PASSWORD);
	const r = await call("PATCH", "/users/me", {
		token: s.access,
		body: { username: alice.username, email: alice.email, firstName: "Alicia", lastName: "Test" }
	});
	assert.equal(r.status, 200, JSON.stringify(r.body));
});

test("PATCH /users/me avec l'email ou le username d'un autre → 409", async () => {
	const s = await login(alice.email, PASSWORD);
	const byEmail = await call("PATCH", "/users/me", { token: s.access, body: { email: bob.email } });
	assert.equal(byEmail.status, 409);
	assert.match(String(byEmail.body.message), /email/i);
	const byUsername = await call("PATCH", "/users/me", { token: s.access, body: { username: bob.username } });
	assert.equal(byUsername.status, 409);
});

test("PATCH /users/me avec un username invalide → 400", async () => {
	const s = await login(alice.email, PASSWORD);
	assert.equal((await call("PATCH", "/users/me", { token: s.access, body: { username: "a" } })).status, 400);
});

test("PATCH /users/me/password : mot de passe actuel faux → 400", async () => {
	const s = await login(bob.email, PASSWORD);
	const r = await call("PATCH", "/users/me/password", {
		token: s.access,
		body: { currentPassword: "Wrong123!pass", newPassword: "NewPassword123!" }
	});
	assert.equal(r.status, 400);
});

test("PATCH /users/me/password : change le mdp et révoque les autres sessions", async () => {
	const current = await login(bob.email, PASSWORD);
	const other = await login(bob.email, PASSWORD);
	const NEW = "NewPassword123!";
	const r = await call("PATCH", "/users/me/password", {
		token: current.access,
		body: { currentPassword: PASSWORD, newPassword: NEW }
	});
	assert.equal(r.status, 204, JSON.stringify(r.body));
	assert.equal((await call("GET", "/users/me", { token: current.access })).status, 200, "session courante conservée");
	assert.equal((await call("GET", "/users/me", { token: other.access })).status, 401, "autre access révoqué");
	assert.equal((await call("POST", "/auth/refresh", { token: other.refresh })).status, 401, "autre refresh révoqué");
	assert.equal(
		(await call("POST", "/auth/login", { body: { email: bob.email, password: PASSWORD } })).status,
		401,
		"ancien mdp refusé"
	);
	await login(bob.email, NEW);
});
```

Run: `cd $WS && pnpm smoke`
Expected: FAIL. Les tests `/users/*` échouent (404), les 10 tests auth restent `✓`.

- [ ] **Step 2 : Compléter UsersService**

`apps/backend/src/users/users.service.ts` (remplacer tout le fichier) :
```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ChangePasswordDto, UpdateProfileDto, User } from "@repo/shared";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { toPublicUser } from "./user.mapper";

export const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Throws a 409 if another user already owns this email or username.
	 * `excludeUserId` lets a user re-submit their own current values.
	 */
	async assertAvailable(fields: { email?: string; username?: string }, excludeUserId?: string) {
		const or = [
			...(fields.email ? [{ email: fields.email }] : []),
			...(fields.username ? [{ username: fields.username }] : [])
		];
		if (or.length === 0) return;

		const existing = await this.prisma.user.findFirst({
			where: { OR: or, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) },
			select: { email: true, username: true }
		});
		if (!existing) return;

		if (fields.email && existing.email === fields.email) {
			throw new ConflictException("Cet email est déjà utilisé");
		}
		throw new ConflictException("Ce nom d'utilisateur est déjà utilisé");
	}

	async findMe(userId: string): Promise<User> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } });
		if (!user) throw new NotFoundException("Utilisateur introuvable");
		return toPublicUser(user);
	}

	async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
		await this.assertAvailable({ email: dto.email, username: dto.username }, userId);
		const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
		return toPublicUser(user);
	}

	/**
	 * Keeps the current session alive and revokes every other one.
	 */
	async changePassword(userId: string, currentSessionId: string, dto: ChangePasswordDto): Promise<void> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } });
		if (!user || !(await bcrypt.compare(dto.currentPassword, user.password))) {
			throw new BadRequestException("Mot de passe actuel incorrect");
		}
		const password = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
		await this.prisma.$transaction([
			this.prisma.user.update({ where: { id: userId }, data: { password } }),
			this.prisma.session.deleteMany({ where: { userId, NOT: { id: currentSessionId } } })
		]);
	}
}
```

- [ ] **Step 3 : Controller et module**

`apps/backend/src/users/users.controller.ts` :
```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from "@nestjs/common";
import {
	type ChangePasswordDto,
	ChangePasswordSchema,
	type UpdateProfileDto,
	UpdateProfileSchema
} from "@repo/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get("me")
	me(@CurrentUser("id") userId: string) {
		return this.usersService.findMe(userId);
	}

	@Patch("me")
	updateMe(@CurrentUser("id") userId: string, @Body({ schema: UpdateProfileSchema }) dto: UpdateProfileDto) {
		return this.usersService.updateProfile(userId, dto);
	}

	@HttpCode(HttpStatus.NO_CONTENT)
	@Patch("me/password")
	changePassword(@CurrentUser() user: AuthUser, @Body({ schema: ChangePasswordSchema }) dto: ChangePasswordDto) {
		return this.usersService.changePassword(user.id, user.sessionId, dto);
	}
}
```

`apps/backend/src/users/users.module.ts` :
```ts
import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService]
})
export class UsersModule {}
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `cd $WS && pnpm smoke`
Expected: `19/19 OK`. Relancer une deuxième fois pour vérifier que les données sont isolées (suffixe aléatoire) et que le throttle du login n'est pas atteint : `19/19 OK`.

- [ ] **Step 5 : Typecheck, build, lint, commit**

```bash
cd $WS && pnpm --filter @workshop/backend typecheck && pnpm --filter @workshop/backend build && pnpm --filter @workshop/backend lint:fix && pnpm --filter @workshop/backend lint
git add -A && git commit -m "feat(backend): add profile endpoints (me, update, change password)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — scaffold, auth (signin / signup) et dashboard protégé

**Files:**
- Create: `apps/frontend/package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.env.example`
- Create: `apps/frontend/src/main.tsx`, `src/index.css`, `src/env.ts`, `src/routeTree.gen.ts` (généré)
- Create: `apps/frontend/src/lib/{api,endpoints,form,primitive,query-client}.ts`, `src/stores/useAuthStore.ts`
- Create (copie) : `apps/frontend/src/components/ui/{button,card,field,input,text-field}.tsx`
- Create: `apps/frontend/src/components/form-field.tsx`
- Create: `apps/frontend/src/routes/{__root,_auth,_auth.signin,_auth.signup,_app,_app.index}.tsx`

**Interfaces:**
- Consumes : `LoginSchema`, `RegisterSchema`, `LoginDto`, `RegisterDto`, `AuthResponse`, `AuthTokens`, `User`, `UpdateProfileDto`, `ChangePasswordDto` depuis `@repo/shared` ; les endpoints des Tasks 4 et 5.
- Produces (pour la Task 7) :
  - `api<T>(endpoint, init?)` et `ApiError { status }`.
  - `authApi.{login, register, logout}`, `usersApi.{me, updateProfile, changePassword}`.
  - `useAuthStore` : `{ user, token, refreshToken, isAuthenticated, setTokens, setUser, login, logout }`.
  - `validate(schema, values) → { data, errors: FieldErrors | null }` et `type FieldErrors = Record<string, string | undefined>`.
  - `<FormField label name type value onChange error autoComplete />`.
  - `Button`, `Card`, `CardHeader`, `CardContent`, `CardFooter` depuis `@/components/ui/*`.
  - Layout `_app` avec navbar ; route `/`.

- [ ] **Step 1 : Configuration du package**

`apps/frontend/package.json` :
```json
{
	"name": "@workshop/frontend",
	"private": true,
	"version": "1.0.0",
	"type": "module",
	"scripts": {
		"dev": "vite",
		"build": "tsc -b && vite build",
		"preview": "vite preview",
		"typecheck": "tsc -b",
		"lint": "biome check .",
		"lint:fix": "biome check --write .",
		"format": "biome format --write ."
	},
	"dependencies": {
		"@repo/shared": "workspace:*",
		"@t3-oss/env-core": "^0.13.11",
		"@tanstack/react-query": "^5.101.2",
		"@tanstack/react-router": "^1.170.18",
		"react": "^19.2.7",
		"react-aria-components": "^1.19.0",
		"react-dom": "^19.2.7",
		"sonner": "^2.0.7",
		"tailwind-merge": "^3.6.0",
		"tailwind-variants": "^3.2.2",
		"tailwindcss": "^4.3.3",
		"tailwindcss-react-aria-components": "^2.2.0",
		"tw-animate-css": "^1.4.0",
		"zod": "^4.5.2",
		"zustand": "^5.0.14"
	},
	"devDependencies": {
		"@biomejs/biome": "2.5.11",
		"@tailwindcss/vite": "^4.3.3",
		"@tanstack/router-plugin": "^1.168.22",
		"@types/node": "^26.1.1",
		"@types/react": "^19.2.17",
		"@types/react-dom": "^19.2.3",
		"@vitejs/plugin-react": "^6.0.4",
		"typescript": "~6.0.3",
		"vite": "^8.0.16"
	}
}
```

`apps/frontend/index.html` :
```html
<!doctype html>
<html lang="fr">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Workshop EPSI</title>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="/src/main.tsx"></script>
	</body>
</html>
```

`apps/frontend/vite.config.ts` :
```ts
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), tailwindcss(), react()],
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
	},
	server: { port: 5173 }
});
```

`apps/frontend/tsconfig.json` :
```json
{
	"files": [],
	"references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }],
	"compilerOptions": { "paths": { "@/*": ["./src/*"] } }
}
```

`apps/frontend/tsconfig.app.json` (copie de `$SS/apps/frontend/tsconfig.app.json`) :
```json
{
	"compilerOptions": {
		"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
		"target": "ES2022",
		"useDefineForClassFields": true,
		"lib": ["ES2022", "DOM", "DOM.Iterable"],
		"module": "ESNext",
		"types": ["vite/client"],
		"skipLibCheck": true,
		"paths": { "@/*": ["./src/*"] },
		"moduleResolution": "bundler",
		"allowImportingTsExtensions": true,
		"verbatimModuleSyntax": true,
		"moduleDetection": "force",
		"noEmit": true,
		"jsx": "react-jsx",
		"strict": true,
		"noUnusedLocals": true,
		"noUnusedParameters": true,
		"erasableSyntaxOnly": true,
		"noFallthroughCasesInSwitch": true,
		"noUncheckedSideEffectImports": true
	},
	"include": ["src"]
}
```

`apps/frontend/tsconfig.node.json` :
```json
{
	"compilerOptions": {
		"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
		"target": "ES2023",
		"lib": ["ES2023"],
		"module": "ESNext",
		"types": ["node"],
		"skipLibCheck": true,
		"moduleResolution": "bundler",
		"allowImportingTsExtensions": true,
		"verbatimModuleSyntax": true,
		"moduleDetection": "force",
		"noEmit": true,
		"strict": true,
		"noUnusedLocals": true,
		"noUnusedParameters": true,
		"erasableSyntaxOnly": true,
		"noFallthroughCasesInSwitch": true,
		"noUncheckedSideEffectImports": true
	},
	"include": ["vite.config.ts"]
}
```

`apps/frontend/.env.example` :
```
VITE_API_URL=http://localhost:3001
VITE_APP_NAME=Workshop EPSI
```

Puis : `cp apps/frontend/.env.example apps/frontend/.env && cd $WS && pnpm install`

- [ ] **Step 2 : Styles et composants UI (portés)**

```bash
cd $WS/apps/frontend && mkdir -p src/components/ui src/lib src/stores src/routes
sed -e '/@plugin "@tailwindcss\/typography"/d' \
    -e '/^@font-face/,/^}$/d' \
    -e '/^@source/d' \
    -e '/--font-borel/d' \
    -e '/^@utility font-borel/,/^}$/d' \
    -e '/Ajustement optique/,/^}$/d' \
    $SS/apps/frontend/src/index.css > src/index.css
grep -n "borel\|typography\|@source\|font-face" src/index.css || echo "OK: index.css nettoyé"
for f in button card field input text-field; do cp $SS/apps/frontend/src/components/ui/$f.tsx src/components/ui/; done
cp $SS/apps/frontend/src/lib/primitive.ts src/lib/primitive.ts
grep -h "^import" src/components/ui/*.tsx src/lib/primitive.ts | sort -u
```
Expected : `OK: index.css nettoyé`. Les imports listés doivent uniquement pointer vers `react-aria-components`, `tailwind-merge`, `tailwind-variants`, `@/lib/primitive` et `./field`. Si un autre import apparaît, supprimer le code qui l'utilise.

- [ ] **Step 3 : env, query client, store, API**

`apps/frontend/src/env.ts` :
```ts
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_API_URL: z.url(),
		VITE_APP_NAME: z.string().min(1).default("Workshop EPSI")
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true
});
```

`apps/frontend/src/lib/query-client.ts` :
```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: 0, gcTime: 1000 * 60 * 5, retry: 1 }
	}
});
```

`apps/frontend/src/stores/useAuthStore.ts` (porté et réduit depuis `$SS/apps/frontend/src/stores/useAuthStore.ts`) :
```ts
import type { User } from "@repo/shared";
import { create } from "zustand";

const KEYS = {
	token: "workshop.auth.token",
	refreshToken: "workshop.auth.refreshToken",
	user: "workshop.auth.user"
} as const;

function readUser(): User | null {
	try {
		const raw = localStorage.getItem(KEYS.user);
		return raw ? (JSON.parse(raw) as User) : null;
	} catch {
		return null;
	}
}

interface AuthState {
	token: string | null;
	refreshToken: string | null;
	user: User | null;
	isAuthenticated: boolean;
	setTokens: (token: string, refreshToken: string) => void;
	setUser: (user: User) => void;
	login: (user: User, token: string, refreshToken: string) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
	token: localStorage.getItem(KEYS.token),
	refreshToken: localStorage.getItem(KEYS.refreshToken),
	user: readUser(),
	isAuthenticated: !!localStorage.getItem(KEYS.token),

	setTokens: (token, refreshToken) => {
		localStorage.setItem(KEYS.token, token);
		localStorage.setItem(KEYS.refreshToken, refreshToken);
		set({ token, refreshToken, isAuthenticated: true });
	},

	setUser: (user) => {
		localStorage.setItem(KEYS.user, JSON.stringify(user));
		set({ user });
	},

	login: (user, token, refreshToken) => {
		localStorage.setItem(KEYS.user, JSON.stringify(user));
		localStorage.setItem(KEYS.token, token);
		localStorage.setItem(KEYS.refreshToken, refreshToken);
		set({ user, token, refreshToken, isAuthenticated: true });
	},

	logout: () => {
		for (const key of Object.values(KEYS)) localStorage.removeItem(key);
		set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
	}
}));
```

`apps/frontend/src/lib/api.ts` (porté de `$SS/apps/frontend/src/lib/api.ts` : refresh sur 401 avec file d'attente, sans query/blob) :
```ts
import type { AuthTokens } from "@repo/shared";
import { env } from "@/env";
import { useAuthStore } from "@/stores/useAuthStore";

const BASE_URL = env.VITE_API_URL;

/**
 * On these endpoints a 401 means "bad credentials", not "expired token": never try to refresh.
 */
const PUBLIC_AUTH_ENDPOINTS = ["/auth/login", "/auth/register", "/auth/refresh"];

export class ApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight refresh: concurrent 401s share one /auth/refresh call.
 */
function refreshAccessToken(): Promise<string> {
	if (!refreshPromise) {
		refreshPromise = (async () => {
			const { refreshToken, setTokens } = useAuthStore.getState();
			if (!refreshToken) throw new ApiError("Session expirée", 401);
			const response = await fetch(`${BASE_URL}/auth/refresh`, {
				method: "POST",
				headers: { Authorization: `Bearer ${refreshToken}` }
			});
			if (!response.ok) throw new ApiError("Session expirée", response.status);
			const tokens = (await response.json()) as AuthTokens;
			setTokens(tokens.accessToken, tokens.refreshToken);
			return tokens.accessToken;
		})().finally(() => {
			refreshPromise = null;
		});
	}
	return refreshPromise;
}

async function toApiError(response: Response): Promise<ApiError> {
	const data = await response.json().catch(() => ({}));
	const message = Array.isArray(data.message) ? data.message.join("\n") : data.message;
	return new ApiError(message || response.statusText, response.status);
}

export async function api<T>(endpoint: string, init: RequestInit = {}, retried = false): Promise<T> {
	const { token, logout } = useAuthStore.getState();
	const headers = new Headers(init.headers);
	if (init.body !== undefined) headers.set("Content-Type", "application/json");
	if (token) headers.set("Authorization", `Bearer ${token}`);

	const response = await fetch(`${BASE_URL}${endpoint}`, { cache: "no-store", ...init, headers });

	if (response.status === 401 && !retried && !PUBLIC_AUTH_ENDPOINTS.includes(endpoint)) {
		try {
			await refreshAccessToken();
		} catch (error) {
			logout();
			throw error;
		}
		return api<T>(endpoint, init, true);
	}

	if (!response.ok) throw await toApiError(response);
	if (response.status === 204) return null as T;
	return (await response.json()) as T;
}
```

`apps/frontend/src/lib/endpoints.ts` :
```ts
import type { AuthResponse, ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto, User } from "@repo/shared";
import { api } from "./api";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const authApi = {
	login: (dto: LoginDto) => api<AuthResponse>("/auth/login", json("POST", dto)),
	register: (dto: RegisterDto) => api<AuthResponse>("/auth/register", json("POST", dto)),
	logout: () => api<null>("/auth/logout", { method: "POST" })
};

export const usersApi = {
	me: () => api<User>("/users/me"),
	updateProfile: (dto: UpdateProfileDto) => api<User>("/users/me", json("PATCH", dto)),
	changePassword: (dto: ChangePasswordDto) => api<null>("/users/me/password", json("PATCH", dto))
};
```

`apps/frontend/src/lib/form.ts` :
```ts
import { z } from "zod";

export type FieldErrors = Record<string, string | undefined>;

type ValidationResult<T> = { data: T; errors: null } | { data: null; errors: FieldErrors };

/**
 * Runs a shared Zod schema and returns the first error message per field.
 */
export function validate<S extends z.ZodType>(schema: S, values: unknown): ValidationResult<z.output<S>> {
	const result = schema.safeParse(values);
	if (result.success) return { data: result.data, errors: null };
	const fieldErrors = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
	return {
		data: null,
		errors: Object.fromEntries(Object.entries(fieldErrors).map(([key, messages]) => [key, messages?.[0]]))
	};
}
```

- [ ] **Step 4 : FormField**

`apps/frontend/src/components/form-field.tsx` :
```tsx
import { FieldError, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TextField } from "@/components/ui/text-field";

interface FormFieldProps {
	label: string;
	name: string;
	value: string;
	onChange: (value: string) => void;
	error?: string;
	type?: "text" | "email" | "password";
	autoComplete?: string;
}

export function FormField({ label, error, ...props }: FormFieldProps) {
	return (
		<TextField {...props} isInvalid={!!error}>
			<Label>{label}</Label>
			<Input />
			<FieldError>{error}</FieldError>
		</TextField>
	);
}
```

- [ ] **Step 5 : Entrée de l'app et route racine**

`apps/frontend/src/main.tsx` :
```tsx
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./index.css";

const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
	document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>
);
```

`apps/frontend/src/routes/__root.tsx` :
```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/query-client";

export const Route = createRootRoute({
	component: RootLayout
});

function RootLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
			<Toaster richColors position="top-right" />
		</QueryClientProvider>
	);
}
```

- [ ] **Step 6 : Layout auth, connexion, inscription**

`apps/frontend/src/routes/_auth.tsx` :
```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_auth")({
	beforeLoad: () => {
		if (useAuthStore.getState().isAuthenticated) throw redirect({ to: "/" });
	},
	component: AuthLayout
});

function AuthLayout() {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
			<div className="w-full max-w-md">
				<Outlet />
			</div>
		</main>
	);
}
```

`apps/frontend/src/routes/_auth.signin.tsx` :
```tsx
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
```

`apps/frontend/src/routes/_auth.signup.tsx` :
```tsx
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
```

- [ ] **Step 7 : Layout protégé et dashboard**

`apps/frontend/src/routes/_app.tsx` :
```tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { authApi, usersApi } from "@/lib/endpoints";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_app")({
	beforeLoad: () => {
		if (!useAuthStore.getState().isAuthenticated) throw redirect({ to: "/signin" });
	},
	component: AppLayout
});

const navLinkClass = "text-muted-fg text-sm hover:text-fg data-[status=active]:font-medium data-[status=active]:text-fg";

function AppLayout() {
	const navigate = useNavigate();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const user = useAuthStore((s) => s.user);
	const setUser = useAuthStore((s) => s.setUser);
	const logout = useAuthStore((s) => s.logout);

	// Resync the cached user with the API (also validates the session on load).
	const me = useQuery({ queryKey: ["me"], queryFn: usersApi.me, enabled: isAuthenticated });
	useEffect(() => {
		if (me.data) setUser(me.data);
	}, [me.data, setUser]);

	const logoutMutation = useMutation({
		mutationFn: authApi.logout,
		onSettled: () => {
			logout();
			queryClient.clear();
			navigate({ to: "/signin" });
		}
	});

	// A failed token refresh calls logout() from api.ts: leave the protected area.
	if (!isAuthenticated) return <Navigate to="/signin" />;

	return (
		<div className="min-h-dvh">
			<header className="border-b">
				<nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
					<span className="font-semibold">{env.VITE_APP_NAME}</span>
					<Link to="/" activeOptions={{ exact: true }} className={navLinkClass}>
						Dashboard
					</Link>
					<div className="ml-auto flex items-center gap-3">
						<span className="text-muted-fg text-sm">{user?.username}</span>
						<Button
							intent="outline"
							size="sm"
							onPress={() => logoutMutation.mutate()}
							isDisabled={logoutMutation.isPending}
						>
							Déconnexion
						</Button>
					</div>
				</nav>
			</header>
			<main className="mx-auto max-w-5xl px-4 py-8">
				<Outlet />
			</main>
		</div>
	);
}
```

`apps/frontend/src/routes/_app.index.tsx` :
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/useAuthStore";

export const Route = createFileRoute("/_app/")({
	component: DashboardPage
});

function DashboardPage() {
	const user = useAuthStore((s) => s.user);
	return (
		<section className="space-y-2">
			<h1 className="font-semibold text-2xl">Bienvenue, {user?.firstName} 👋</h1>
			<p className="text-muted-fg">Ton dashboard est vide pour l'instant.</p>
		</section>
	);
}
```

- [ ] **Step 8 : Générer l'arbre de routes, typecheck, build**

```bash
cd $WS/apps/frontend && pnpm exec vite build   # le plugin génère src/routeTree.gen.ts
cd $WS && pnpm --filter @workshop/frontend typecheck && pnpm --filter @workshop/frontend build
pnpm --filter @workshop/frontend lint:fix && pnpm --filter @workshop/frontend lint
```
Expected : `src/routeTree.gen.ts` existe, `tsc -b` ne remonte aucune erreur, `vite build` affiche `✓ built in …`, et le lint est vert. En cas d'erreur de type dans un composant `ui/` copié (dépendance manquante), supprimer la variante ou l'import en cause.

- [ ] **Step 9 : Vérification manuelle du flux**

Lancer `cd $WS && pnpm dev` (backend, shared et frontend), puis ouvrir http://localhost:5173 :
1. `/` redirige vers `/signin`.
2. Aller sur « Créer un compte » et soumettre le formulaire vide : les erreurs s'affichent sous chaque champ, sans appel réseau.
3. Inscription avec des données valides : toast « Compte créé ! », puis dashboard « Bienvenue, <prénom> ».
4. Aller sur `/signin` une fois connecté : redirection vers `/`.
5. Déconnexion : retour sur `/signin` ; se reconnecter fonctionne.
6. Connexion avec un mauvais mot de passe : toast « Email ou mot de passe incorrect ».
7. Refaire l'inscription avec le même email : toast « Cet email est déjà utilisé ».

- [ ] **Step 10 : Vérifier le refresh et l'expiration (Review Focus n°5)**

Dans les DevTools, onglet Application → Local Storage :
1. Remplacer `workshop.auth.token` par `abc`, puis recharger `/`. L'onglet Network doit montrer `GET /users/me` → 401, puis `POST /auth/refresh` → 200, puis `GET /users/me` → 200. On reste connecté.
2. Remplacer `workshop.auth.token` **et** `workshop.auth.refreshToken` par `abc`, puis recharger. On doit être redirigé vers `/signin` sans boucle, et la clé `workshop.auth.user` doit être supprimée.

- [ ] **Step 11 : Commit**

```bash
cd $WS && git add -A && git commit -m "feat(frontend): add react app with signin, signup and protected dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — page profil et README

**Files:**
- Create: `apps/frontend/src/components/profile-form.tsx`, `apps/frontend/src/components/password-form.tsx`, `apps/frontend/src/routes/_app.profile.tsx`
- Modify: `apps/frontend/src/routes/_app.tsx` (lien « Profil » dans la navbar), `README.md`

**Interfaces:**
- Consumes : `usersApi.updateProfile`, `usersApi.changePassword`, `useAuthStore.setUser`, `validate`, `FormField`, `Button`, `Card*`, `UpdateProfileSchema`, `ChangePasswordSchema`, `User`.
- Produces : la route `/profile`.

- [ ] **Step 1 : Formulaire d'informations**

`apps/frontend/src/components/profile-form.tsx` :
```tsx
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
```

- [ ] **Step 2 : Formulaire mot de passe**

`apps/frontend/src/components/password-form.tsx` :
```tsx
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
			<CardHeader title="Mot de passe" description="12 caractères min., avec majuscule, minuscule, chiffre et symbole" />
			<form onSubmit={onSubmit} noValidate>
				<CardContent className="space-y-4">
					<FormField
						label="Mot de passe actuel"
						type="password"
						autoComplete="current-password"
						{...field("currentPassword")}
					/>
					<FormField label="Nouveau mot de passe" type="password" autoComplete="new-password" {...field("newPassword")} />
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
```

- [ ] **Step 3 : Route et lien navbar**

`apps/frontend/src/routes/_app.profile.tsx` :
```tsx
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
```

Dans `apps/frontend/src/routes/_app.tsx`, juste après le `<Link to="/" …>Dashboard</Link>`, ajouter :
```tsx
					<Link to="/profile" className={navLinkClass}>
						Profil
					</Link>
```

- [ ] **Step 4 : README complet**

`README.md` (remplacer tout le fichier) :
````markdown
# Workshop EPSI

Boilerplate minimal dérivé de StudentSphere.

- **API** (`apps/backend`) : NestJS 12, Prisma 7 + PostgreSQL, Zod, JWT access + refresh (rotation)
- **Front** (`apps/frontend`) : React 19, Vite, TanStack Router + Query, Zustand, Tailwind 4, React Aria
- **Shared** (`packages/shared`) : schémas Zod partagés front/back

## Démarrer

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env      # changer les secrets JWT (openssl rand -hex 32)
cp apps/frontend/.env.example apps/frontend/.env
docker compose -f docker-compose.dev.yml up -d      # Postgres sur localhost:5433
pnpm db:migrate                                     # applique les migrations
pnpm dev                                            # API :3001, front :5173
```

## Scripts

| Commande | Effet |
| --- | --- |
| `pnpm dev` | Lance shared (watch), API et front |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Build, types, Biome sur tout le monorepo |
| `pnpm db:migrate` | `prisma migrate dev` (ajouter `--name xxx` après un changement de schéma) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm smoke` | Smoke tests HTTP de l'API (l'API doit tourner) |

## API

| Méthode | Route | Auth |
| --- | --- | --- |
| POST | `/auth/register` | public |
| POST | `/auth/login` | public |
| POST | `/auth/refresh` | refresh token en Bearer |
| POST | `/auth/logout` | access token |
| GET | `/users/me` | access token |
| PATCH | `/users/me` | access token |
| PATCH | `/users/me/password` | access token (révoque les autres sessions) |

## Ajouter une feature

1. Schéma Zod dans `packages/shared/src/`, exporté depuis `index.ts`.
2. Modèle Prisma dans `apps/backend/prisma/schema/`, puis `pnpm db:migrate --name <nom>`.
3. Module Nest dans `apps/backend/src/<feature>/` avec `@Body({ schema })` (les routes sont protégées par défaut, `@Public()` pour ouvrir).
4. Appels dans `apps/frontend/src/lib/endpoints.ts`, page dans `apps/frontend/src/routes/_app.<feature>.tsx`.
````

- [ ] **Step 5 : Typecheck, build, lint**

```bash
cd $WS && pnpm typecheck && pnpm build && pnpm lint
```
Expected : tout est vert sur les 3 packages (`@repo/shared`, `@workshop/backend`, `@workshop/frontend`).

- [ ] **Step 6 : Vérification manuelle du profil**

Avec `pnpm dev` lancé, connecté sur http://localhost:5173 :
1. La navbar contient « Profil ». La page affiche les deux cartes, pré-remplies.
2. Changer le prénom et le username, puis « Enregistrer » : toast « Profil mis à jour », et le username est mis à jour dans la navbar.
3. Enregistrer sans rien changer : toast de succès, pas d'erreur 409.
4. Saisir l'email d'un autre compte : toast « Cet email est déjà utilisé ».
5. Username `a` : erreur sous le champ, sans appel réseau.
6. Mot de passe : si la confirmation diffère, erreur sous « Confirmer ». Avec un mot de passe actuel faux : toast « Mot de passe actuel incorrect ». Avec des valeurs valides : toast de succès et champs vidés.
7. Déconnexion, puis connexion avec le **nouveau** mot de passe : ça fonctionne ; l'ancien est refusé.
8. Scénario multi-sessions : se connecter dans une fenêtre privée, changer le mot de passe dans la fenêtre normale, puis recharger la fenêtre privée. Elle doit être redirigée vers `/signin`.

- [ ] **Step 7 : Smoke final et commit**

```bash
cd $WS && pnpm smoke     # 19/19 OK
git add -A && git commit -m "feat(frontend): add profile page with info and password forms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
