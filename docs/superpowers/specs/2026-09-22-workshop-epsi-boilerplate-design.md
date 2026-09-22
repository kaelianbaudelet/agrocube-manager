# Spec — Boilerplate `workshop-epsi` (mini StudentSphere)

## Context
Kaelian veut un boilerplate minimal pour le workshop EPSI, dérivé de son projet StudentSphere
(`/Users/kaelian/Desktop/projet-worshop-epsi/studentsphere`), sans tout le superflu (IA, Stripe, S3,
BullMQ, websockets, Sentry, PostHog, OAuth, MFA, passkeys…). Il doit contenir uniquement : auth
login/register fonctionnelle (JWT access + refresh), un dashboard vide, et une page profil pour
modifier username, prénom, nom, email et mot de passe. D'autres features seront ajoutées plus tard
à la demande.

**Décisions validées**
- Monorepo Turborepo + pnpm (même structure que StudentSphere)
- Auth JWT access + refresh (Passport local/jwt/jwt-refresh, bcrypt), tokens en localStorage côté front
- Outillage : Biome uniquement (pas de lefthook/commitlint, pas de Swagger, pas de Jest)
- Schémas Zod partagés dans `packages/shared`
- Approche : scaffold neuf écrit à la main + portage ciblé de fichiers StudentSphere (pas de clone/élagage)

## Emplacement
`/Users/kaelian/Desktop/projet-worshop-epsi/workshop-epsi/` (nouveau repo git, `git init`).

## Structure
```
workshop-epsi/
├─ package.json            # scripts turbo: dev, build, lint, lint:fix, format, typecheck, db:*
├─ pnpm-workspace.yaml     # apps/*, packages/*
├─ turbo.json              # simplifié depuis studentsphere/turbo.json
├─ biome.json              # repris de studentsphere/apps/backend/biome.json
├─ .npmrc, .gitignore, .env.example, README.md
├─ docker-compose.dev.yml  # postgres:17 seul (port 5432, volume nommé)
├─ packages/
│  ├─ typescript-config/   # copié de studentsphere/packages/typescript-config
│  └─ shared/              # @repo/shared — schémas Zod + types communs
└─ apps/
   ├─ backend/             # @workshop/backend — NestJS 12, port 3001, HTTP
   └─ frontend/            # @workshop/frontend — Vite + React 19, port 5173
```

## packages/shared (`@repo/shared`)
- `src/auth.ts` : `zPassword()` (repris de `studentsphere/apps/backend/src/utils/zod.ts`),
  `RegisterSchema` {username, email, firstName, lastName, password}, `LoginSchema` {email, password}.
- `src/user.ts` : `UserSchema` (sans password), `UpdateProfileSchema` {username, email, firstName, lastName}
  (tous optionnels via `.partial()`), `ChangePasswordSchema` {currentPassword, newPassword}.
- `username` : 3–30 caractères, `^[a-zA-Z0-9_.-]+$`.
- Types exportés via `z.infer`.
- Build avec `tsup` → ESM + CJS + d.ts (backend CJS, frontend ESM). `dev` = `tsup --watch`.
- turbo : `build`, `dev` et `typecheck` dépendent de `^build`.

## Backend (`apps/backend`)
Dépendances : `@nestjs/{common,core,platform-express,config,jwt,passport,throttler}`, `@prisma/client`,
`@prisma/adapter-pg`, `pg`, `prisma`, `passport`, `passport-local`, `passport-jwt`, `bcryptjs`,
`helmet`, `zod`, `dotenv`, `reflect-metadata`, `rxjs`, `@repo/shared`. Dev : `@nestjs/cli`, `@swc/*`,
types, `tsx`, `typescript`, `@biomejs/biome`.

**Prisma** (`prisma/schema/schema.prisma`, `prisma.config.ts` repris de StudentSphere, generator
sortie `src/generated/prisma`, moduleFormat cjs) :
```prisma
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

**Modules**
- `config/` : `ConfigModule.forRoot({ isGlobal, validate })` avec un schéma Zod des env
  (`DATABASE_URL`, `PORT`, `FRONTEND_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
  `JWT_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`).
- `prisma/` : `PrismaService` porté de `studentsphere/apps/backend/src/prisma/prisma.service.ts`
  (adapter pg), module global.
- `auth/` :
  - `POST /auth/register` (public) → crée user (bcrypt), 409 si email/username pris, renvoie `{ user, accessToken, refreshToken }`
  - `POST /auth/login` (public, `LocalAuthGuard`, throttle 5/10s) → idem, 401 si mauvais identifiants
  - `POST /auth/refresh` (public, `JwtRefreshGuard`, refresh en Bearer) → vérifie la session + hash, rotation, renvoie nouveaux tokens
  - `POST /auth/logout` → supprime la session courante
  - Payload JWT : `{ sub: userId, sessionId }`
  - Stratégies `local`, `jwt`, `jwt-refresh` portées de `studentsphere/apps/backend/src/auth/strategies/` (sans MFA/PAT)
  - `JwtAuthGuard` global (APP_GUARD) + décorateur `@Public()` + `@CurrentUser()` (portés, sans MFA)
- `users/` :
  - `GET /users/me` → user sans password
  - `PATCH /users/me` (`UpdateProfileSchema`) → 409 si email/username pris
  - `PATCH /users/me/password` (`ChangePasswordSchema`) → 400 si currentPassword faux ; révoque les autres sessions
- Validation : syntaxe native Nest 12 `@Body({ schema: RegisterSchema })` (Standard Schema), comme StudentSphere ;
  reprendre `studentsphere/apps/backend/src/types/nestjs.d.ts` (augmentation de `ParameterDecoratorOptions`)
  + dépendance `@standard-schema/spec`.
- `main.ts` : helmet (config par défaut), `enableCors({ origin: FRONTEND_URL })`, `listen(PORT)`. Pas de SSL.
- Filtre d'exception : erreurs de validation → 400 `{ message, errors }` ; Prisma P2002 → 409.

Scripts : `dev` (`nest start --watch`), `build`, `start:prod`, `db:generate`, `db:migrate:dev`,
`db:push`, `db:studio`, `typecheck`, `lint`, `lint:fix`, `format`, `postinstall: prisma generate`.

## Frontend (`apps/frontend`)
Dépendances : `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `zustand`,
`zod`, `@t3-oss/env-core`, `tailwindcss`, `@tailwindcss/vite`, `react-aria-components`,
`tailwind-variants`, `tailwind-merge`, `tailwindcss-react-aria-components`, `sonner`, `lucide-react`,
`@repo/shared`. Dev : `vite`, `@vitejs/plugin-react`, `@tanstack/router-plugin`, types, `typescript`, biome.

- `src/env.ts` : T3 env réduit (`VITE_API_URL`, `VITE_APP_NAME`).
- `src/lib/api.ts` : porté de `studentsphere/apps/frontend/src/lib/api.ts` (fetch + Bearer + refresh
  auto sur 401 avec file d'attente), sans endpoints superflus.
- `src/lib/query-client.ts`, `src/lib/primitive.ts` : portés.
- `src/stores/useAuthStore.ts` : porté et réduit (User = id, username, email, firstName, lastName, createdAt ; clés `workshop.auth.*`).
- `src/components/ui/` : seulement `button`, `text-field`, `field`, `input`, `card`, `form`, `link`,
  `heading` (copiés de StudentSphere et nettoyés des dépendances inutilisées).
- `src/index.css` : thème Tailwind repris (tokens couleurs, dark via `prefers-color-scheme`).
- Routes (TanStack file-based) :
  - `__root.tsx` : QueryClientProvider + `<Toaster />` sonner
  - `_auth.tsx` : layout centré ; `beforeLoad` → redirect `/` si connecté
  - `_auth.signin.tsx`, `_auth.signup.tsx` : formulaires validés avec les schémas `@repo/shared`, erreurs API en toast / sous champs
  - `_app.tsx` : `beforeLoad` → redirect `/signin` si non connecté ; navbar (Dashboard, Profil, Déconnexion)
  - `_app.index.tsx` : dashboard vide (« Bienvenue, {firstName} »)
  - `_app.profile.tsx` : carte « Informations » (username, prénom, nom, email → `PATCH /users/me`, met à jour le store)
    + carte « Mot de passe » (actuel, nouveau, confirmation → `PATCH /users/me/password`)
- Pas de Sentry, PostHog, CSP guard, mkcert, MDX.

## Gestion d'erreurs
- Back : 400 validation (détail par champ), 401 identifiants/token, 409 conflit unique (Prisma P2002 → message « Email déjà utilisé » / « Username déjà utilisé »).
- Front : `ApiError` → toast ; erreurs Zod affichées sous les champs ; refresh échoué → logout + redirect `/signin`.

## Hors périmètre (YAGNI)
Vérif email, mot de passe oublié, MFA, OAuth, avatar/upload, rôles, i18n, tests, Swagger, Docker prod, CI.

## Vérification
1. `cd workshop-epsi && pnpm install`
2. `cp .env.example .env` (+ `apps/backend/.env`, `apps/frontend/.env`) puis `docker compose -f docker-compose.dev.yml up -d`
3. `pnpm --filter @workshop/backend db:migrate:dev --name init`
4. `pnpm typecheck && pnpm lint && pnpm build` → tout vert
5. `pnpm dev`, puis dans le navigateur (http://localhost:5173) :
   signup → dashboard → profil (changer username/email) → changer mot de passe → logout → login avec nouveau mot de passe ;
   vérifier redirects (accès `/profile` déconnecté → `/signin`) ; username dupliqué → 409 affiché.
6. `curl` rapide : `POST /auth/login` puis `POST /auth/refresh` avec le refresh token → nouveaux tokens, ancien refresh refusé.

## Suite (après approbation)
1. Écrire cette spec dans `workshop-epsi/docs/superpowers/specs/2026-09-22-workshop-epsi-boilerplate-design.md` et la committer (après `git init`).
2. Invoquer `superpowers:writing-plans` pour le plan d'implémentation détaillé.
