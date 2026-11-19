import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite driver must stay external to the server bundle.
  // Evidence, attachment and backup-restore uploads go through server actions.
  experimental: { serverActions: { bodySizeLimit: "100mb" } },
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "exceljs"],
};

export default nextConfig;
