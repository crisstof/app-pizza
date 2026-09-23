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
npx tsx prisma/seed.ts     # create the starter pizzas that don't exist yet + upcoming time slots
npx tsx prisma/demo-history.ts          # 8 weeks of fake past orders (@demo.local) + dough logs, for the forecast
npx tsx prisma/demo-history.ts --clean  # remove all demo data (never touches real orders)
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

`Pizza.name` is unique. The menu is edited from the staff back-office (`/pizzaiolo/carte`); `backend/prisma/seed.ts` only holds the 15-pizza starter menu and upserts it by name with `update: {}`, so re-running the seed creates missing pizzas but never overwrites staff edits. `Pizza.available = false` means "Épuisée" (shown greyed, can't be ordered); `Pizza.archivedAt` replaces deletion for pizzas that past orders reference (archived pizzas keep their name until a new pizza takes it). `Pizza.category` (`TOMATO` | `CREAM` | `SPECIAL`) drives the menu filters and `Pizza.tags` (`vegetarian`, `spicy`, `popular`, `new`) the card badges. `Pizza.imageUrl` is either `/images/…` (starter photos in `frontend/public/images/`, sources in `CREDITS.md` there) or `/uploads/pizzas/…` (photos uploaded from the back-office, stored in the gitignored `backend/uploads/` and served by the backend) — always render it through `resolveImageUrl()` from `api.ts`.

`Client.passwordHash` is nullable: `null` means a guest-only client created by upsert-on-email during checkout, never logged in. `Client.loyaltyPoints` is the stamp balance (see Loyalty below).

`TimeSlot.capacity`/`reserved` model booking capacity per slot. `TimeSlot.startsAt` has a unique constraint, which the auto-generation logic below relies on for idempotency.

### Anti-overbooking logic (`backend/src/routes/orders.ts`)

Order creation runs inside a single `prisma.$transaction`: it re-reads the slot, rejects if already full, then does a conditional `updateMany` (`WHERE reserved < capacity`) to increment `reserved` — the row only updates if there's still room, so two concurrent bookings can't both land in the last slot. **Any change to booking/capacity logic must preserve this transaction + conditional-update pattern, not just a plain read-then-write** — the same pattern is reused for order status transitions and loyalty point redemption (see below), specifically to prevent the same class of race.

### Auth (`backend/src/lib/auth.ts`, `backend/src/routes/auth.ts`)

Email/password accounts: bcrypt-hashed passwords, a JWT in an httpOnly cookie (`JWT_SECRET` env var). `attachClientIfPresent` middleware decodes the cookie if present but never rejects (used on order creation, so guest checkout keeps working); `requireAuth` rejects with 401 if there's no valid session (used on `/api/auth/me` and `/api/orders/mine`).

Guest checkout (no session) upserts a `Client` by email — but **refuses** if that email already has a `passwordHash` set, returning 403. This prevents an unauthenticated request from attaching an order (and reading/spending loyalty points) to someone else's registered account just by typing their email. Don't remove this check when touching the order-creation guest path.

### Loyalty (`backend/src/routes/orders.ts`)

1 point per pizza ordered. At `LOYALTY_REWARD_THRESHOLD` (10) points, the cheapest item in the *next* order is free. The 10-point debit uses a conditional `updateMany` (`WHERE loyaltyPoints >= threshold`) rather than reading the balance and applying a relative `increment`/`decrement` — otherwise two concurrent orders could both read a balance ≥10 and both redeem, double-spending the same stamps. Cancelling an order claws back the points *it earned* (not any it redeemed) via `Order.pointsEarned`, stored at creation time.

### Live order tracking (`backend/src/routes/orders.ts`, `frontend/src/pages/OrderTracking.tsx`)

Each status change also stamps its own column (`confirmedAt`, `preparingAt`, `readyAt`, `pickedUpAt`, `cancelledAt`; "received" is `createdAt`) in the same conditional `updateMany`, which drives the customer's timeline. `PATCH /api/orders/:id/eta` (`{ minutes }`, 1–120) is the pizzaiolo's "prête dans N min" button: it sets `etaSetAt = now` and `estimatedReadyAt = now + N`, conditionally on the order still being `PENDING`/`CONFIRMED`/`PREPARING`, and the tracking page draws a countdown ring from `etaSetAt` to `estimatedReadyAt`. `GET /api/orders/:id` is readable by anyone holding the order link, so it only exposes `client.name`. The staff routes (`GET /api/orders`, `PATCH .../status`, `PATCH .../eta`) require the staff session (see Staff back-office).

Order API responses select only `{ name, email, phone }` from `client` — never `include: { client: true }`, which would leak `passwordHash`.

### Time-slot auto-generation (`backend/src/lib/timeSlots.ts`, `backend/src/lib/settings.ts`)

`ensureUpcomingTimeSlots()` generates 30-minute slots from the `ShopSettings` singleton row (lunch/dinner windows in minutes since midnight, capacity, `daysAhead` horizon, `closedWeekdays`), skipping `ClosedDay` dates, using `createMany({ skipDuplicates: true })` against the unique `startsAt` constraint — safe to call repeatedly/concurrently. `refreshUpcomingTimeSlots()` wraps it with a once-per-hour throttle and a try/catch that logs instead of rejecting; it's called at server startup and lazily from `GET /api/time-slots`. When staff change the settings or closures, `syncUpcomingTimeSlots()` reconciles existing future slots: stale ones are deleted if no order references them, otherwise set `closed` (hidden from customers, their orders stay valid); a new default capacity is applied with `GREATEST(capacity, reserved)`. `TimeSlot.closed` is also toggled per slot by staff; order creation refuses closed slots inside the booking transaction. Customer-facing code goes through the throttled wrapper rather than calling `ensureUpcomingTimeSlots()` directly, so a generation failure never fails the slot list.

### Frontend data flow

`frontend/src/api.ts` is the only place that talks to the backend — a small `api<T>()` fetch wrapper (always sends `credentials: "include"` for the auth cookie) plus typed functions per endpoint. It normalizes backend error shapes (a plain string, or a Zod `fieldErrors` object) into a single readable message via `extractErrorMessage` — keep using that path rather than reading `err.message` directly, since a raw Zod error object stringifies to `[object Object]`.

`frontend/src/context/AuthContext.tsx` exposes `useAuth()` (`client`, `login`, `register`, `logout`, `refresh`) and wraps the router in `App.tsx`. Routing is `react-router-dom`; pages live in `frontend/src/pages/`: `CustomerBooking` (`/`), `OrderTracking` (`/suivi/:orderId`), `SignUp`/`SignIn` (`/inscription`, `/connexion`), `Account` (`/compte`), and the staff back-office under `pages/staff/` (`/pizzaiolo/*`, see above). Each page owns its own local state — there's no global state library.

### UI components and theming

`frontend/src/components/ui/` is shadcn/ui-generated (via `npx shadcn add ...`) — treat these as vendored, don't hand-edit them beyond what the CLI produces; add new primitives with the CLI so `components.json` stays the source of truth. Custom booking/dashboard components live directly under `frontend/src/components/`.

The `@/` import alias maps to `frontend/src/` (configured in both `vite.config.ts` and the two `tsconfig*.json` files — keep them in sync if it ever changes).

Theme colors are CSS variables in `frontend/src/index.css`, stored as raw hex and consumed directly via `var(--...)` (not wrapped in `hsl()`), with a `@media (prefers-color-scheme: dark)` override block. The app carries **two** themes in the same stylesheet: the default `:root` theme (warm red/gold, Playfair Display SC + Karla) for customer-facing pages, and a `.theme-staff` class override (blue/orange, Plus Jakarta Sans) applied to the pizzaiolo dashboard's root element. A themed subtree must set its own `background`/`color` (not just redeclare the CSS variables) — descendants otherwise inherit the *computed* color from `body`, which resolved `var(--foreground)` before the override was in scope.

### Staff back-office (`backend/src/lib/staffAuth.ts`, `backend/src/routes/admin/`, `frontend/src/pages/staff/`)

A single shared password, `STAFF_PASSWORD`, protects the back-office. Login sets a separate `staff_session` cookie (JWT with `role: "staff"` and a fingerprint of the password, so changing the password logs everyone out; a customer `session` cookie never grants staff access), with a 5-failures-per-15-minutes lockout per IP. Customer login (`/api/auth/login`) has the same kind of guard, keyed on IP + email (5 tries) plus a per-IP cap (30) — never on the email alone, which would let anyone lock a customer out. Both use `createFailureLimiter` (`lib/rateLimit.ts`, in-memory, per process). Behind a reverse proxy, set `TRUST_PROXY` so `req.ip` is the visitor's address. `requireStaff` guards `GET /api/orders` (day view), `PATCH /api/orders/:id/status|eta`, and everything under `/api/admin/*` (menu CRUD + photo upload via multer, settings, slots, closed days, order search, clients, manual loyalty adjustment — the latter conditional so a balance can't go negative). The backend runs **Express 5**, which forwards errors thrown in async handlers to the JSON `errorHandler` in `lib/errors.ts` (500 "Erreur serveur.", or the status/message of a thrown `HttpError`) — handlers can simply `throw new HttpError(404, "…")`. Handlers with a middleware before them (`requireStaff`, multer) type their params explicitly (`req: Request<{ id: string }>`), since Express 5's types don't infer them through the middleware. Cancelling an order also gives its place back to the slot (`reserved` decrement in the same transaction).

On the frontend, `/pizzaiolo` is a nested-route layout (`StaffLayout` checks the session, redirects to `/pizzaiolo/connexion`): Service (live day + "Pilotage du service": today's slots and sold-out switches), Commandes, Carte, Créneaux, Clients. Back-office calls live in `frontend/src/staffApi.ts` (same `api()` helper, which throws `ApiError` with the HTTP status); shared pieces in `frontend/src/components/staff/`. Customer pages read opening hours from the public `GET /api/settings`.

### Dough forecast and waste (`backend/src/lib/doughForecast.ts`, `backend/src/routes/admin/dough.ts`, `frontend/src/pages/staff/Dough.tsx`)

Staff prepare dough the day before, so `/pizzaiolo/pates` forecasts dough balls (1 per pizza) per service for today, tomorrow and the day after. A slot is "lunch" if it starts before `ShopSettings.dinnerStart`, else "dinner". Per service: weighted average of the same weekday over the last 8 weeks (weights 8…1, days with no slot skipped as closed, days under half / over double the median dropped as abnormal), never below pizzas already booked, times `1 + margin`. The margin is learned by backtesting the same forecast over the last 8 weeks (80th percentile of `actual / forecast − 1`, clamped 5–30 %), falling back to `ShopSettings.doughMarginPercent` below 6 data points. Everything is plain statistics returned with its inputs so the screen can explain each number — keep it that way rather than adding opaque models.

`DoughLog` (`@@id([date, service])`, local `YYYY-MM-DD`) is the end-of-service count entered by staff: `prepared` / `wasted` (`wasted ≤ prepared`, no future dates); "sold" always comes from the orders. `demo = true` rows come from `prisma/demo-history.ts`, whose `--clean` removes only @demo.local clients' orders, demo logs and past slots left with no order.

## Environment

- `backend/.env` — `DATABASE_URL` (Postgres connection string matching `docker-compose.yml` credentials), `PORT` (default 4000), `JWT_SECRET` (any long random string), `FRONTEND_URL` (default `http://localhost:5173`, used for CORS), `STAFF_PASSWORD` (back-office password; without it the staff login answers 503), `TRUST_PROXY` (optional, proxy hop count when behind nginx/Traefik)
- `frontend/.env` — `VITE_API_URL` (default `http://localhost:4000`)

Both are gitignored. Copy `backend/.env.example` and `frontend/.env.example` (committed, documented) to `.env` and fill them in; generate a fresh `JWT_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## Workflow

Work on a feature branch, run a thorough review of the diff before committing (look especially hard at anything touching the transaction/conditional-update patterns above — that's where this codebase's real bugs have been), then open a PR rather than committing straight to `main`/`master`. Recent feature branches were stacked on each other while prior PRs were still open — check `git log --graph --all` and the open PRs before branching, and pick the right base so a new PR's diff doesn't include another PR's unmerged commits.

`.claude/skills/` (if present) holds Claude Code-specific skill data and is gitignored — it's not part of the project and other agents can ignore it.
