import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.pizza.createMany({
    data: [
      { name: "Margherita", description: "Tomate, mozzarella, basilic", priceCents: 900 },
      { name: "Reine", description: "Jambon, champignons, mozzarella", priceCents: 1100 },
      { name: "4 Fromages", description: "Mozzarella, gorgonzola, chèvre, emmental", priceCents: 1200 },
    ],
  });

  const now = new Date();
  const slots = Array.from({ length: 6 }).map((_, i) => {
    const startsAt = new Date(now.getTime() + (i + 1) * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    return { startsAt, endsAt, capacity: 5 };
  });
  await prisma.timeSlot.createMany({ data: slots });

  console.log("Seed terminé.");
}

main().finally(() => prisma.$disconnect());
