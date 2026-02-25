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

export default app;
