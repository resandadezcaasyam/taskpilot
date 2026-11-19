import "dotenv/config";
import { defineConfig } from "prisma/config";

// The database lives OUTSIDE .next/build folders so it survives restarts and rebuilds.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "file:./data/taskpilot.db" },
});
