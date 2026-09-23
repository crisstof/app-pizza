// Demo history for the dough forecast: 8 weeks of fake past orders (clients
// @demo.local) and end-of-service dough logs, so the forecast has something
// to learn from. Reproducible (seeded random), and fully removable:
//
//   npx tsx prisma/demo-history.ts          # create
//   npx tsx prisma/demo-history.ts --clean  # remove everything it created
//
// Never touches real orders: days/services that already have real orders
// are skipped, and --clean only deletes @demo.local clients' orders, demo
// dough logs, and past slots left without any order.
import { serviceOf } from "../src/lib/doughForecast.js";
import { getSettings, localDateKey, serviceWindows } from "../src/lib/settings.js";
import { prisma } from "../src/prisma.js";

const DEMO_DOMAIN = "@demo.local";
const WEEKS = 8;
const SLOT_MINUTES = 30;

// mulberry32: small seeded PRNG, so every run generates the same history.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seeded(42);
const between = (min: number, max: number) => min + random() * (max - min);
const pick = <T>(items: T[], weights: number[]) => {
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]) <= 0) return items[i];
  return items[items.length - 1];
};

const NAMES = ["Camille", "Lucas", "Emma", "Hugo", "Chloé", "Louis", "Inès", "Nathan", "Jade", "Gabriel", "Manon", "Arthur"];
// Sunday … Saturday: quiet start of week, busy Friday/Saturday.
const WEEKDAY_FACTOR = [1.0, 0.7, 0.75, 0.85, 0.9, 1.25, 1.4];
const BASE = { LUNCH: 14, DINNER: 26 } as const;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function clean() {
  const clients = await prisma.client.findMany({ where: { email: { endsWith: DEMO_DOMAIN } }, select: { id: true } });
  const ids = clients.map((c) => c.id);
  const orders = await prisma.order.deleteMany({ where: { clientId: { in: ids } } });
  const deletedClients = await prisma.client.deleteMany({ where: { id: { in: ids } } });
  const logs = await prisma.doughLog.deleteMany({ where: { demo: true } });
  const slots = await prisma.timeSlot.deleteMany({ where: { startsAt: { lt: startOfToday() }, orders: { none: {} } } });
  console.log(
    `Démo supprimée : ${orders.count} commandes, ${deletedClients.count} clients, ${logs.count} relevés de pâtons, ${slots.count} créneaux passés vides.`
  );
}

async function create() {
  if (await prisma.client.count({ where: { email: { endsWith: DEMO_DOMAIN } } })) {
    throw new Error("Un historique de démo existe déjà. Lance d'abord : npx tsx prisma/demo-history.ts --clean");
  }
  const settings = await getSettings();
  const pizzas = await prisma.pizza.findMany({ where: { archivedAt: null } });
  if (pizzas.length === 0) throw new Error("Aucune pizza : lance d'abord le seed.");
  const pizzaWeights = pizzas.map((p) => (p.tags.includes("popular") ? 3 : p.tags.includes("new") ? 1.5 : 1));

  const today = startOfToday();
  const windows = serviceWindows(settings);

  // Real orders already in the window: those services are left alone.
  const realOrders = await prisma.order.findMany({
    where: { timeSlot: { startsAt: { gte: new Date(today.getTime() - WEEKS * 7 * 86400000), lt: today } } },
    select: { timeSlot: { select: { startsAt: true, service: true } } },
  });
  const taken = new Set(realOrders.map((o) => `${localDateKey(o.timeSlot.startsAt)}|${serviceOf(o.timeSlot, settings)}`));

  const clients = await Promise.all(
    NAMES.map((name, i) =>
      prisma.client.create({
        data: { name: `${name} (démo)`, email: `demo-${i + 1}${DEMO_DOMAIN}`, createdAt: new Date(today.getTime() - 60 * 86400000) },
      })
    )
  );

  type PlannedOrder = { id: string; slotStart: Date; clientId: string; items: { pizzaId: string; quantity: number; price: number }[]; cancelled: boolean };
  const planned: PlannedOrder[] = [];
  const slotStarts: { startsAt: Date; service: string }[] = [];
  const logs: { date: string; service: string; prepared: number; wasted: number; demo: boolean }[] = [];
  let orderNumber = 0;

  for (let daysAgo = WEEKS * 7; daysAgo >= 1; daysAgo--) {
    const day = new Date(today);
    day.setDate(day.getDate() - daysAgo);
    if (settings.closedWeekdays.includes(day.getDay())) continue;
    // Waste shrinks over the weeks, as if the forecast was being followed.
    const progress = 1 - daysAgo / (WEEKS * 7);

    for (const window of windows) {
      const key = `${localDateKey(day)}|${window.service}`;
      if (taken.has(key)) continue;

      const starts: Date[] = [];
      for (let m = window.start; m + SLOT_MINUTES <= window.end; m += SLOT_MINUTES) {
        const s = new Date(day);
        s.setHours(Math.floor(m / 60), m % 60, 0, 0);
        starts.push(s);
      }
      slotStarts.push(...starts.map((startsAt) => ({ startsAt, service: window.service })));

      const noise = (between(0.8, 1.2) + between(0.8, 1.2)) / 2;
      const target = Math.round(BASE[window.service] * WEEKDAY_FACTOR[day.getDay()] * (0.95 + 0.1 * progress) * noise);
      let sold = 0;
      while (sold < target) {
        const count = Math.min(target - sold, pick([1, 2, 3, 4], [4, 4, 2, 1]));
        const items = new Map<string, number>();
        for (let i = 0; i < count; i++) {
          const pizza = pick(pizzas, pizzaWeights);
          items.set(pizza.id, (items.get(pizza.id) ?? 0) + 1);
        }
        const cancelled = random() < 0.05;
        planned.push({
          id: `demo_${(++orderNumber).toString(36).padStart(6, "0")}`,
          // Peak in the middle of the service.
          slotStart: starts[Math.min(starts.length - 1, Math.floor(((between(0, 1) + between(0, 1)) / 2) * starts.length))],
          clientId: clients[Math.floor(random() * clients.length)].id,
          items: [...items].map(([pizzaId, quantity]) => ({
            pizzaId,
            quantity,
            price: pizzas.find((p) => p.id === pizzaId)!.priceCents,
          })),
          cancelled,
        });
        if (!cancelled) sold += count;
      }

      const surplus = between(0.18, 0.4) * (1 - 0.6 * progress);
      const prepared = Math.round(sold * (1 + surplus));
      logs.push({ date: localDateKey(day), service: window.service, prepared, wasted: prepared - sold, demo: true });
    }
  }

  await prisma.timeSlot.createMany({
    data: slotStarts.map(({ startsAt, service }) => ({
      startsAt,
      endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60000),
      capacity: settings.slotCapacity,
      service,
    })),
    skipDuplicates: true,
  });
  const slots = await prisma.timeSlot.findMany({
    where: { startsAt: { in: slotStarts.map((s) => s.startsAt) } },
    select: { id: true, startsAt: true },
  });
  const slotId = new Map(slots.map((s) => [s.startsAt.getTime(), s.id]));

  const minutes = (n: number) => n * 60000;
  await prisma.order.createMany({
    data: planned.map((o) => {
      const t = o.slotStart.getTime();
      const createdAt = new Date(t - minutes(Math.round(between(60, 30 * 60))));
      const quantity = o.items.reduce((s, i) => s + i.quantity, 0);
      return {
        id: o.id,
        clientId: o.clientId,
        timeSlotId: slotId.get(t)!,
        status: o.cancelled ? ("CANCELLED" as const) : ("PICKED_UP" as const),
        totalCents: o.items.reduce((s, i) => s + i.price * i.quantity, 0),
        pointsEarned: o.cancelled ? 0 : quantity,
        createdAt,
        confirmedAt: new Date(createdAt.getTime() + minutes(3)),
        ...(o.cancelled
          ? { cancelledAt: new Date(createdAt.getTime() + minutes(45)) }
          : {
              preparingAt: new Date(t - minutes(15)),
              readyAt: new Date(t - minutes(2)),
              pickedUpAt: new Date(t + minutes(6)),
            }),
      };
    }),
  });
  await prisma.orderItem.createMany({
    data: planned.flatMap((o) =>
      o.items.map((i) => ({ orderId: o.id, pizzaId: i.pizzaId, quantity: i.quantity, unitPriceCents: i.price }))
    ),
  });

  // Keep slot bookkeeping consistent with the orders now in them.
  const perSlot = new Map<string, number>();
  for (const o of planned) {
    if (o.cancelled) continue;
    const id = slotId.get(o.slotStart.getTime())!;
    perSlot.set(id, (perSlot.get(id) ?? 0) + 1);
  }
  for (const [id, reserved] of perSlot) {
    await prisma.timeSlot.update({ where: { id }, data: { reserved, capacity: Math.max(settings.slotCapacity, reserved) } });
  }

  await prisma.doughLog.createMany({ data: logs, skipDuplicates: true });
  console.log(
    `Démo créée : ${planned.length} commandes sur ${WEEKS} semaines, ${clients.length} clients ${DEMO_DOMAIN}, ${logs.length} relevés de pâtons.`
  );
  console.log("Pour tout supprimer : npx tsx prisma/demo-history.ts --clean");
}

(process.argv.includes("--clean") ? clean() : create())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
