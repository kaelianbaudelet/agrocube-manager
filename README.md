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
pnpm dev                                            # API :3000, front :5173
```

## Scripts

| Commande | Effet |
| --- | --- |
| `pnpm dev` | Lance shared (watch), API et front |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Build, types, Biome sur tout le monorepo |
| `pnpm db:migrate` | `prisma migrate dev` (ajouter `--name xxx` après un changement de schéma) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm smoke` | Smoke tests HTTP de l'API (l'API doit tourner ; attendre ~1 min entre deux lancements à cause du throttle du login) |

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
