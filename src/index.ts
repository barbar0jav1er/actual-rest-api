import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config";

const app = new Hono();

// Ruta de prueba
app.get("/", (c) => {
  return c.json({
    message: "Actual REST API Boilerplate is running!",
    status: "ok",
    environment: config.nodeEnv,
  });
});

// Iniciar el servidor
console.log(`🚀 Server is running on http://${config.host}:${config.port}`);

serve({
  fetch: app.fetch,
  port: config.port,
});

export default app;
