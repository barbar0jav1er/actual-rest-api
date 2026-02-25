import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { syncServerHandlers } from "./mocks/handlers";

// Servidor MSW que intercepta todos los fetch al sync-server
export const server = setupServer(...syncServerHandlers);

beforeAll(() => {
  // "error" falla el test si hay un fetch saliente sin handler declarado.
  // Fuerza explicitar todas las dependencias HTTP externas.
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  // Resetear handlers personalizados añadidos dentro de tests individuales
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Entorno de test aislado — no depende de .env local
process.env["SYNC_SERVER_URL"] = "http://localhost:5006";
process.env["DATA_DIR"] = "/tmp/actual-test-data";
process.env["NODE_ENV"] = "test";
process.env["PORT"] = "3001";
process.env["HOST"] = "127.0.0.1";
process.env["LOG_LEVEL"] = "silent";
