/* eslint-disable no-console */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });
import { prisma } from "../src/lib/prisma";

async function main() {
  const a = await prisma.academy.findUnique({
    where: { id: "cmommhl7a0000mmekxmbqfefe" },
    select: { code: true, name: true },
  });
  console.log("academy:", JSON.stringify(a));
}
main().finally(() => prisma.$disconnect());
