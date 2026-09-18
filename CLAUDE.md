# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Pizza reservation app: browse pizzas, book a time slot, place an order. Two workspaces, no shared package manager workspace config — each has its own `node_modules` and is run independently.

- `backend/` — Express + TypeScript API, Prisma ORM, PostgreSQL
- `frontend/` — React + Vite + TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion
- `docker-compose.yml` (repo root) — PostgreSQL container for local dev

## Commands

Postgres must be running before the backend will work:

```bash
docker compose up -d          # from repo root, starts Postgres on :5432
```

### Backend (`backend/`)

```bash
npm run dev              # tsx watch src/index.ts — API on :4000
npm run build             # tsc -p tsconfig.json
npm run start              # run compiled dist/index.js
npm run prisma:migrate     # create + apply a migration from schema.prisma changes
npm run prisma:generate    # regenerate Prisma Client after schema changes
npm run prisma:studio      # GUI at localhost:5555 to inspect/edit data
npx tsx prisma/seed.ts     # reseed pizzas + time slots
```

No test suite exists yet.

### Frontend (`frontend/`)

```bash
npm run dev       # Vite dev server on :5173
npm run build      # tsc -b && vite build
npm run lint        # oxlint
npm run preview     # preview a production build
```

No test suite exists yet.

## Architecture

### Data model (`backend/prisma/schema.prisma`)

`Client` → `Order` → `OrderItem` → `Pizza`, with `Order` → `TimeSlot` and `Order` → `Payment` (optional, not yet wired to a real payment provider). Money is stored as integer cents (`priceCents`, `totalCents`) to avoid floating-point rounding — never switch these to float/decimal without updating every call site.

`TimeSlot.capacity`/`reserved` model booking capacity per slot (e.g. how many orders the kitchen can handle in that window). This is the anti-overbooking mechanism: see below.

### Anti-overbooking logic (`backend/src/routes/orders.ts`)

Order creation runs inside a single `prisma.$transaction`: it re-reads the slot, rejects if already full, then does a conditional `updateMany` (`WHERE reserved < capacity`) to increment `reserved` — the row only updates if there's still room, so two concurrent bookings can't both land in the last slot. Any change to booking/capacity logic must preserve this transaction + conditional-update pattern, not just a plain read-then-write.

### Frontend data flow

`frontend/src/api.ts` is the only place that talks to the backend (fetch wrappers + shared types `Pizza`/`TimeSlot`/`CreateOrderInput`). It also normalizes backend error shapes (a plain string, or a Zod `fieldErrors` object) into a single readable message via `extractErrorMessage` — keep using that path rather than reading `err.message` directly when handling API errors, since a raw Zod error object stringifies to `[object Object]`.

`App.tsx` owns all booking state (selected pizzas/quantities, selected slot, contact fields) and passes it down to `PizzaCard`, `TimeSlotPicker`, `CartFooter`. There's no router or global state library — this is intentionally a single-page flow.

### UI components

`frontend/src/components/ui/` is shadcn/ui-generated (via `npx shadcn add ...`) — treat these as vendored, don't hand-edit them beyond what the CLI produces; add new primitives with the CLI so `components.json` stays the source of truth. Custom booking components live directly under `frontend/src/components/`.

The `@/` import alias maps to `frontend/src/` (configured in both `vite.config.ts` and the two `tsconfig*.json` files — keep them in sync if it ever changes).

Theme colors are CSS variables in `frontend/src/index.css`, stored as raw hex and consumed directly via `var(--...)` (not wrapped in `hsl()`), with a `@media (prefers-color-scheme: dark)` override block — follow that pattern for any new theme tokens rather than hardcoding colors in components.

The app carries two color/font themes in the same stylesheet: the default `:root` theme (warm red/gold, Playfair Display SC + Karla) for the customer-facing pages, and a `.theme-staff` class override (blue/orange, Plus Jakarta Sans) applied to the pizzaiolo dashboard's root element. A themed subtree must set its own `background`/`color` (not just redeclare the CSS variables) — descendants otherwise inherit the *computed* color from `body`, which resolved `var(--foreground)` before the override was in scope.

## Environment

- `backend/.env` — `DATABASE_URL` (Postgres connection string matching `docker-compose.yml` credentials), `PORT` (default 4000)
- `frontend/.env` — `VITE_API_URL` (default `http://localhost:4000`)

Both are gitignored; there's no `.env.example` yet, so check `docker-compose.yml` for the expected Postgres credentials when recreating `backend/.env`.
