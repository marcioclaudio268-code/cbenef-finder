import Fastify from "fastify";
import { pathToFileURL } from "node:url";

import { config } from "./config.js";
import { createDatabase } from "./db.js";
import { registerGetCbenefRoute } from "./routes/get-cbenef.js";
import { registerHealthRoute } from "./routes/health.js";

export async function buildServer() {
  const app = Fastify({
    logger: true,
    requestIdHeader: "x-request-id",
    disableRequestLogging: false,
  });

  const database = createDatabase(config.databaseUrl, config.databaseSsl);

  app.addHook("onClose", async () => {
    await database.close();
  });

  await registerHealthRoute(app, database);
  await registerGetCbenefRoute(app, database);

  return app;
}

export async function startServer() {
  const app = await buildServer();

  try {
    const address = await app.listen({
      host: config.host,
      port: config.port,
    });

    app.log.info({ address }, "cbenef-finder api ready");
    return app;
  } catch (error) {
    app.log.error(error);
    await app.close();
    throw error;
  }
}

const entryPoint = process.argv[1];

if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  void startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
