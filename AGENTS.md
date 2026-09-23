# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, opencode, Cursor, etc.) working in this repository.

## Project

Pizza reservation app: browse pizzas, book a time slot, place an order, track it, and (if logged in) earn loyalty stamps. Two workspaces, no shared package manager workspace config — each has its own `node_modules` and is run independently.

- `backend/` — Express + TypeScript API, Prisma ORM, PostgreSQL, cookie-based auth (JWT)
- `frontend/` — React + Vite + TypeScript, React Router, Tailwind CSS v4, shadcn/ui, Framer Motion
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
npx tsx prisma/seed.ts     # seed pizzas (only if none exist) + upcoming time slots
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

`Client` → `Order` → `OrderItem` → `Pizza`, with `Order` → `TimeSlot` and `Order` → `Payment` (optional, not yet wired to a real payment provider). Money is stored as integer cents (`priceCents`, `totalCents`, `discountCents`) to avoid floating-point rounding — never switch these to float/decimal without updating every call site.

`Pizza.name` is unique, and `backend/prisma/seed.ts` holds the whole menu (15 pizzas) and upserts it by name, so re-running the seed updates the menu instead of duplicating it — edit the menu there. `Pizza.category` (`TOMATO` | `CREAM` | `SPECIAL`) drives the menu filters and `Pizza.tags` (`vegetarian`, `spicy`, `popular`, `new`) the card badges. `Pizza.imageUrl` points at `frontend/public/images/` (Unsplash photos, sources in `CREDITS.md` there).

`Client.passwordHash` is nullable: `null` means a guest-only client created by upsert-on-email during checkout, never logged in. `Client.loyaltyPoints` is the stamp balance (see Loyalty below).

`TimeSlot.capacity`/`reserved` model booking capacity per slot. `TimeSlot.startsAt` has a unique constraint, which the auto-generation logic below relies on for idempotency.

### Anti-overbooking logic (`backend/src/routes/orders.ts`)

Order creation runs inside a single `prisma.$transaction`: it re-reads the slot, rejects if already full, then does a conditional `updateMany` (`WHERE reserved < capacity`) to increment `reserved` — the row only updates if there's still room, so two concurrent bookings can't both land in the last slot. **Any change to booking/capacity logic must preserve this transaction + conditional-update pattern, not just a plain read-then-write** — the same pattern is reused for order status transitions and loyalty point redemption (see below), specifically to prevent the same class of race.

### Auth (`backend/src/lib/auth.ts`, `backend/src/routes/auth.ts`)

Email/password accounts: bcrypt-hashed passwords, a JWT in an httpOnly cookie (`JWT_SECRET` env var). `attachClientIfPresent` middleware decodes the cookie if present but never rejects (used on order creation, so guest checkout keeps working); `requireAuth` rejects with 401 if there's no valid session (used on `/api/auth/me` and `/api/orders/mine`).

Guest checkout (no session) upserts a `Client` by email — but **refuses** if that email already has a `passwordHash` set, returning 403. This prevents an unauthenticated request from attaching an order (and reading/spending loyalty points) to someone else's registered account just by typing their email. Don't remove this check when touching the order-creation guest path.

### Loyalty (`backend/src/routes/orders.ts`)

1 point per pizza ordered. At `LOYALTY_REWARD_THRESHOLD` (10) points, the cheapest item in the *next* order is free. The 10-point debit uses a conditional `updateMany` (`WHERE loyaltyPoints >= threshold`) rather than reading the balance and applying a relative `increment`/`decrement` — otherwise two concurrent orders could both read a balance ≥10 and both redeem, double-spending the same stamps. Cancelling an order claws back the points *it earned* (not any it redeemed) via `Order.pointsEarned`, stored at creation time.

Order API responses select only `{ name, email, phone }` from `client` — never `include: { client: true }`, which would leak `passwordHash`.

### Time-slot auto-generation (`backend/src/lib/timeSlots.ts`)

`ensureUpcomingTimeSlots()` generates slots for fixed lunch (11:00–14:00) and dinner (18:00–22:00) windows, 30 minutes each, for a rolling 7-day horizon, using `createMany({ skipDuplicates: true })` against the unique `startsAt` constraint — safe to call repeatedly/concurrently. `refreshUpcomingTimeSlots()` wraps it with a once-per-hour throttle and a try/catch that logs instead of rejecting; it's called at server startup and lazily from `GET /api/time-slots`. **Don't call `ensureUpcomingTimeSlots()` directly from a request handler** — always go through the throttled wrapper, since Express 4 doesn't catch rejections thrown from async handlers and an uncaught one crashes the whole process (Node's default unhandled-rejection behavior).

### Frontend data flow

`frontend/src/api.ts` is the only place that talks to the backend — a small `api<T>()` fetch wrapper (always sends `credentials: "include"` for the auth cookie) plus typed functions per endpoint. It normalizes backend error shapes (a plain string, or a Zod `fieldErrors` object) into a single readable message via `extractErrorMessage` — keep using that path rather than reading `err.message` directly, since a raw Zod error object stringifies to `[object Object]`.

`frontend/src/context/AuthContext.tsx` exposes `useAuth()` (`client`, `login`, `register`, `logout`, `refresh`) and wraps the router in `App.tsx`. Routing is `react-router-dom`; pages live in `frontend/src/pages/`: `CustomerBooking` (`/`), `OrderTracking` (`/suivi/:orderId`), `PizzaioloDashboard` (`/pizzaiolo`), `SignUp`/`SignIn` (`/inscription`, `/connexion`), `Account` (`/compte`). Each page owns its own local state — there's no global state library.

### UI components and theming

`frontend/src/components/ui/` is shadcn/ui-generated (via `npx shadcn add ...`) — treat these as vendored, don't hand-edit them beyond what the CLI produces; add new primitives with the CLI so `components.json` stays the source of truth. Custom booking/dashboard components live directly under `frontend/src/components/`.

The `@/` import alias maps to `frontend/src/` (configured in both `vite.config.ts` and the two `tsconfig*.json` files — keep them in sync if it ever changes).

Theme colors are CSS variables in `frontend/src/index.css`, stored as raw hex and consumed directly via `var(--...)` (not wrapped in `hsl()`), with a `@media (prefers-color-scheme: dark)` override block. The app carries **two** themes in the same stylesheet: the default `:root` theme (warm red/gold, Playfair Display SC + Karla) for customer-facing pages, and a `.theme-staff` class override (blue/orange, Plus Jakarta Sans) applied to the pizzaiolo dashboard's root element. A themed subtree must set its own `background`/`color` (not just redeclare the CSS variables) — descendants otherwise inherit the *computed* color from `body`, which resolved `var(--foreground)` before the override was in scope.

## Environment

- `backend/.env` — `DATABASE_URL` (Postgres connection string matching `docker-compose.yml` credentials), `PORT` (default 4000), `JWT_SECRET` (any long random string), `FRONTEND_URL` (default `http://localhost:5173`, used for CORS)
- `frontend/.env` — `VITE_API_URL` (default `http://localhost:4000`)

Both are gitignored; there's no `.env.example` yet, so check `docker-compose.yml` for the expected Postgres credentials, and generate a fresh `JWT_SECRET` (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) when recreating `backend/.env`.

## Workflow

Work on a feature branch, run a thorough review of the diff before committing (look especially hard at anything touching the transaction/conditional-update patterns above — that's where this codebase's real bugs have been), then open a PR rather than committing straight to `main`/`master`. Recent feature branches were stacked on each other while prior PRs were still open — check `git log --graph --all` and the open PRs before branching, and pick the right base so a new PR's diff doesn't include another PR's unmerged commits.

`.claude/skills/` (if present) holds Claude Code-specific skill data and is gitignored — it's not part of the project and other agents can ignore it.
