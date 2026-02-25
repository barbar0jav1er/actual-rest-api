import { describe, it, expect } from "vitest";
import app from "../src/app";

describe("Smoke test", () => {
  it("la app responde en GET /", async () => {
    const res = await app.request("/");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.message).toBeDefined();
  });
});
