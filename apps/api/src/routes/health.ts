import type { FastifyInstance } from "fastify";

import type { Database } from "../db.js";

export async function registerHealthRoute(app: FastifyInstance, database: Database) {
  app.get("/health", async (_request, reply) => {
    const databaseHealth = await database.ping();
    const isDegraded = databaseHealth.status === "unavailable";

    return reply.code(isDegraded ? 503 : 200).send({
      status: isDegraded ? "degraded" : "ok",
      service: "cbenef-finder-api",
      database: databaseHealth,
      uptime_seconds: Number(process.uptime().toFixed(3)),
    });
  });
}
