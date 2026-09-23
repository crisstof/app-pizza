import { PrismaClient } from "@prisma/client";
import { ensureUpcomingTimeSlots } from "../src/lib/timeSlots.js";

const prisma = new PrismaClient();

async function main() {
  const pizzaCount = await prisma.pizza.count();
  if (pizzaCount === 0) {
    await prisma.pizza.createMany({
      data: [
        { name: "Margherita", description: "Tomate, mozzarella, basilic", priceCents: 900 },
        { name: "Reine", description: "Jambon, champignons, mozzarella", priceCents: 1100 },
        { name: "4 Fromages", description: "Mozzarella, gorgonzola, chèvre, emmental", priceCents: 1200 },
      ],
    });
  }

  await ensureUpcomingTimeSlots();

  console.log("Seed terminé.");
}

main().finally(() => prisma.$disconnect());
