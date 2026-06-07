import { PrismaMariaDb } from "@prisma/adapter-mariadb";

export function getDbAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const parsed = new URL(url);
  const socket = parsed.searchParams.get("socket");

  // Handle both TCP and Unix socket DB URLs.
  if (socket) {
    return new PrismaMariaDb({
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
      socketPath: socket,
      connectTimeout: 15000,
      acquireTimeout: 15000,
    });
  }

  return new PrismaMariaDb({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    connectTimeout: 15000,
    acquireTimeout: 15000,
  });
}
