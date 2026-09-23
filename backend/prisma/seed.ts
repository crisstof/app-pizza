import { PrismaClient } from "@prisma/client";
import { ensureUpcomingTimeSlots } from "../src/lib/timeSlots.js";

const prisma = new PrismaClient();

type MenuItem = {
  name: string;
  description: string;
  priceCents: number;
  image: string;
  category: "TOMATO" | "CREAM" | "SPECIAL";
  tags: ("vegetarian" | "spicy" | "popular" | "new")[];
};

// Photos live in frontend/public/images (credits in CREDITS.md there).
const MENU: MenuItem[] = [
  { name: "Margherita", description: "Tomate, mozzarella fior di latte, basilic frais", priceCents: 900, image: "margherita", category: "TOMATO", tags: ["vegetarian", "popular"] },
  { name: "Reine", description: "Tomate, jambon blanc, champignons de Paris, mozzarella", priceCents: 1100, image: "reine", category: "TOMATO", tags: ["popular"] },
  { name: "Diavola", description: "Tomate, mozzarella, salami piquant, piment", priceCents: 1150, image: "diavola", category: "TOMATO", tags: ["spicy"] },
  { name: "Végétarienne", description: "Tomate, mozzarella, poivrons, courgettes, aubergines grillées, olives", priceCents: 1100, image: "vegetarienne", category: "TOMATO", tags: ["vegetarian"] },
  { name: "Orientale", description: "Tomate, mozzarella, merguez, poivrons, oignons", priceCents: 1250, image: "orientale", category: "TOMATO", tags: ["spicy"] },
  { name: "Hawaïenne", description: "Tomate, mozzarella, jambon, ananas", priceCents: 1150, image: "hawaienne", category: "TOMATO", tags: [] },
  { name: "Napolitaine", description: "Tomate, mozzarella, anchois, câpres, olives noires, origan", priceCents: 1100, image: "napolitaine", category: "TOMATO", tags: [] },
  { name: "Burrata", description: "Tomate, burrata crémeuse, roquette, tomates cerises", priceCents: 1450, image: "burrata", category: "TOMATO", tags: ["vegetarian", "new"] },
  { name: "4 Fromages", description: "Crème, mozzarella, gorgonzola, chèvre, emmental", priceCents: 1200, image: "4-fromages", category: "CREAM", tags: ["vegetarian", "popular"] },
  { name: "Savoyarde", description: "Crème, reblochon, pommes de terre, lardons, oignons", priceCents: 1400, image: "savoyarde", category: "CREAM", tags: ["popular"] },
  { name: "Chèvre-Miel", description: "Crème, chèvre, miel, noix, roquette", priceCents: 1250, image: "chevre-miel", category: "CREAM", tags: ["vegetarian"] },
  { name: "Saumon", description: "Crème, saumon fumé, aneth, citron", priceCents: 1450, image: "saumon", category: "CREAM", tags: ["new"] },
  { name: "Truffe", description: "Crème de truffe, champignons, mozzarella, parmesan", priceCents: 1600, image: "truffe", category: "CREAM", tags: ["vegetarian", "new"] },
  { name: "Calzone", description: "Chausson : tomate, jambon, œuf, mozzarella", priceCents: 1250, image: "calzone", category: "SPECIAL", tags: [] },
  { name: "Barbecue", description: "Sauce barbecue, poulet, oignons rouges, mozzarella", priceCents: 1300, image: "barbecue", category: "SPECIAL", tags: [] },
];

async function main() {
  // Starter menu only: creates missing pizzas but never overwrites one, since
  // the staff back-office (/pizzaiolo/carte) is where the menu is edited.
  for (const { image, ...pizza } of MENU) {
    const data = { ...pizza, imageUrl: `/images/${image}.jpg` };
    await prisma.pizza.upsert({ where: { name: pizza.name }, update: {}, create: data });
  }

  await ensureUpcomingTimeSlots();

  console.log(`Seed terminé : ${MENU.length} pizzas.`);
}

main().finally(() => prisma.$disconnect());
