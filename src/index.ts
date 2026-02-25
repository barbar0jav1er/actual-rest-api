import { serve } from "@hono/node-server";
import app from "./app";
import { config } from "./config";

console.log(`🚀 Server is running on http://${config.host}:${config.port}`);

serve({
  fetch: app.fetch,
  port: config.port,
});
