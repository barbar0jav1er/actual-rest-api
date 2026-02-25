# Estrategia de Testing — Actual REST API

**Versión:** 1.0
**Fecha:** 2026-02-25
**Stack de testing:** Vitest 4.x + MSW 2.x
**Autor:** Claude Code (Senior Node Developer perspective)

---

## 1. Filosofía y Principios

Este proyecto es una **API REST con dependencias externas críticas**: el sync-server de Actual (autenticación) y la librería `@actual-app/api` (singleton con estado). La estrategia de testing debe:

1. **Aislar las dependencias externas** — nunca llamar a servicios reales en tests automatizados.
2. **Probar comportamiento, no implementación** — validar contratos HTTP (status codes, body shape) más que internos de función.
3. **Mantener tests rápidos** — unit < 50ms, integration < 200ms por test.
4. **Hacer el CI determinista** — sin dependencias de red, sin side effects entre tests.

> **Regla de oro:** Si un test requiere que Docker esté corriendo, no es un test unitario ni de integración — es E2E y debe estar separado.

---

## 2. Pirámide de Testing

```
         ▲
        /E2E\          ← Contra infra real (docker-compose)
       /─────\            Pocos, lentos, frágiles
      /  Integ \       ← Routes completas con MSW + vi.mock
     /───────────\        Cobertura de contratos HTTP
    /  Unit Tests  \   ← Services, middleware, helpers
   /─────────────────\    Muchos, rápidos, aislados
```

| Capa        | Herramientas           | Cantidad  | Velocidad   | Ejecuta en CI |
|-------------|------------------------|-----------|-------------|---------------|
| Unit        | Vitest + vi.mock       | ~40 tests | < 1s total  | Siempre       |
| Integration | Vitest + MSW + vi.mock | ~25 tests | < 5s total  | Siempre       |
| E2E         | Vitest + docker-compose| ~5 tests  | ~60s total  | Opcional      |

---

## 3. Dependencias a Instalar

```bash
pnpm add -D vitest @vitest/coverage-v8 msw
```

**Herramientas:**

- **Vitest 4.x** — Native ESM, TypeScript sin config extra, compatible con el `moduleResolution: bundler` del proyecto. API idéntica a Jest pero significativamente más rápido.
- **`@vitest/coverage-v8`** — Coverage basado en el motor V8 de Node.js, sin instrumentación adicional de código.
- **MSW 2.x (`msw/node`)** — Intercepta llamadas `fetch` a nivel de proceso Node.js para simular el sync-server. No parchea `fetch` manualmente; usa interceptores de red reales.

---

## 4. Estructura de Directorios

```
actual-rest-api/
├── src/
└── tests/
    ├── setup.ts                 # Bootstrap global: MSW server, env vars de test
    ├── mocks/
    │   ├── handlers.ts          # MSW: handlers del sync-server (/account/validate)
    │   └── fixtures/
    │       ├── users.ts         # Datos de usuario de prueba
    │       ├── budgets.ts       # Presupuestos de prueba
    │       ├── accounts.ts      # Cuentas de prueba
    │       └── transactions.ts  # Transacciones de prueba
    ├── unit/
    │   ├── config.test.ts
    │   ├── services/
    │   │   ├── auth.test.ts
    │   │   └── actual.test.ts
    │   └── middleware/
    │       ├── auth.test.ts
    │       └── error.test.ts
    └── integration/
        ├── health.test.ts
        ├── user.test.ts
        ├── budgets.test.ts
        ├── accounts.test.ts
        └── transactions.test.ts
```

---

## 5. Configuración de Vitest

### `vitest.config.ts` (raíz del proyecto)

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/mocks/**"],

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      // Entry point excluido: tiene side effects de servidor (serve())
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },

    testTimeout: 10000,
    // Limpiar mocks automáticamente entre tests
    clearMocks: true,
    restoreMocks: true,
  },
});
```

### Scripts en `package.json`

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration"
  }
}
```

---

## 6. Setup Global

### `tests/setup.ts`

```typescript
import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { syncServerHandlers } from "./mocks/handlers";

export const server = setupServer(...syncServerHandlers);

beforeAll(() => {
  // onUnhandledRequest: "error" falla el test si hay un fetch no mockeado.
  // Fuerza a declarar explícitamente todos los endpoints externos.
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  // Resetear handlers entre tests para evitar contaminación
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Variables de entorno para tests — no depender de .env
process.env.SYNC_SERVER_URL = "http://localhost:5006";
process.env.DATA_DIR = "/tmp/actual-test-data";
process.env.NODE_ENV = "test";
process.env.PORT = "3001";
```

---

## 7. Mocks Compartidos

### `tests/mocks/handlers.ts`

```typescript
import { http, HttpResponse } from "msw";
import { validUser } from "./fixtures/users";

export const syncServerHandlers = [
  http.get("http://localhost:5006/account/validate", ({ request }) => {
    const token = request.headers.get("x-actual-token");

    if (token === "valid-test-token") {
      return HttpResponse.json({
        status: "ok",
        data: {
          validated: true,
          userId: validUser.id,
          userName: validUser.email,
          displayName: validUser.name,
          loginMethod: "openid",
          permission: "ADMIN",
        },
      });
    }

    return HttpResponse.json(
      { status: "error", reason: "not-validated" },
      { status: 401 },
    );
  }),
];
```

### `tests/mocks/fixtures/users.ts`

```typescript
import type { User } from "../../../src/types/index";

export const validUser: User = {
  id: "user-test-001",
  name: "Test User",
  email: "test@example.com",
  loginMethod: "openid",
  permission: "ADMIN",
};

export const VALID_TOKEN = "valid-test-token";
export const INVALID_TOKEN = "invalid-token-xyz";
```

### `tests/mocks/fixtures/budgets.ts`

```typescript
export const mockBudgets = [
  {
    id: "budget-sync-abc123",
    name: "Presupuesto Personal 2026",
    hasPassword: false,
    owner: "user-test-001",
  },
  {
    id: "budget-sync-def456",
    name: "Presupuesto Familia",
    hasPassword: true,
    owner: "user-test-002",
  },
];
```

### `tests/mocks/fixtures/accounts.ts`

```typescript
export const mockAccounts = [
  {
    id: "acc-checking-001",
    name: "Cuenta Corriente",
    type: "checking",
    offBudget: false,
    archived: false,
    balance: 250050,
  },
  {
    id: "acc-credit-001",
    name: "Tarjeta Visa",
    type: "credit",
    offBudget: false,
    archived: false,
    balance: -120000,
  },
];
```

---

## 8. Tests Unitarios

### 8.1 `tests/unit/services/auth.test.ts`

**Objetivo:** Verificar que `validateToken()` maneja correctamente todas las respuestas posibles del sync-server.

```typescript
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../setup";
import { validateToken } from "../../../src/services/auth";
import { VALID_TOKEN, INVALID_TOKEN, validUser } from "../../mocks/fixtures/users";

describe("validateToken()", () => {
  it("retorna User cuando el token es válido", async () => {
    const user = await validateToken(VALID_TOKEN);

    expect(user).not.toBeNull();
    expect(user?.id).toBe(validUser.id);
    expect(user?.email).toBe(validUser.email);
    expect(user?.permission).toBe("ADMIN");
  });

  it("retorna null cuando el token es inválido", async () => {
    const user = await validateToken(INVALID_TOKEN);
    expect(user).toBeNull();
  });

  it("retorna null cuando el token está vacío", async () => {
    const user = await validateToken("");
    expect(user).toBeNull();
  });

  it("retorna null cuando el sync-server no responde (error de red)", async () => {
    server.use(
      http.get("http://localhost:5006/account/validate", () => {
        return HttpResponse.error();
      }),
    );

    const user = await validateToken(VALID_TOKEN);
    expect(user).toBeNull();
  });

  it("retorna null cuando sync-server responde 500", async () => {
    server.use(
      http.get("http://localhost:5006/account/validate", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const user = await validateToken(VALID_TOKEN);
    expect(user).toBeNull();
  });
});
```

### 8.2 `tests/unit/services/actual.test.ts`

**Objetivo:** Verificar la lógica de cache (`LoadedBudgetCache`) y el comportamiento singleton de `@actual-app/api`.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock SIEMPRE al top level, antes de cualquier import del código fuente
vi.mock("@actual-app/api", () => ({
  init: vi.fn().mockResolvedValue(undefined),
  downloadBudget: vi.fn().mockResolvedValue(undefined),
  loadBudget: vi.fn().mockResolvedValue(undefined),
  getBudgets: vi.fn().mockResolvedValue([]),
  getAccounts: vi.fn().mockResolvedValue([]),
  addTransactions: vi.fn().mockResolvedValue(undefined),
  sync: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

import * as actualApi from "@actual-app/api";
import {
  loadUserBudget,
  getLoadedBudgetCache,
  shutdownAPI,
} from "../../../src/services/actual";

describe("loadUserBudget()", () => {
  beforeEach(async () => {
    // Resetear el estado del singleton entre tests
    await shutdownAPI();
    vi.clearAllMocks();
  });

  it("llama a downloadBudget y loadBudget en el primer load", async () => {
    await loadUserBudget("token-123", "user-001", "budget-abc");

    expect(actualApi.downloadBudget).toHaveBeenCalledWith("budget-abc");
    expect(actualApi.loadBudget).toHaveBeenCalledWith("budget-abc");
  });

  it("NO vuelve a descargar si el mismo syncId + userId ya están en cache", async () => {
    await loadUserBudget("token-123", "user-001", "budget-abc");
    vi.clearAllMocks();

    await loadUserBudget("token-123", "user-001", "budget-abc");

    expect(actualApi.downloadBudget).not.toHaveBeenCalled();
    expect(actualApi.loadBudget).not.toHaveBeenCalled();
  });

  it("descarga de nuevo si cambia el syncId", async () => {
    await loadUserBudget("token-123", "user-001", "budget-abc");
    vi.clearAllMocks();

    await loadUserBudget("token-123", "user-001", "budget-xyz");

    expect(actualApi.downloadBudget).toHaveBeenCalledWith("budget-xyz");
  });

  it("descarga de nuevo si cambia el userId", async () => {
    await loadUserBudget("token-123", "user-001", "budget-abc");
    vi.clearAllMocks();

    await loadUserBudget("token-123", "user-002", "budget-abc");

    expect(actualApi.downloadBudget).toHaveBeenCalledWith("budget-abc");
  });

  it("actualiza el cache con los datos correctos tras cargar", async () => {
    await loadUserBudget("token-123", "user-001", "budget-abc");

    const cache = getLoadedBudgetCache();
    expect(cache).not.toBeNull();
    expect(cache?.syncId).toBe("budget-abc");
    expect(cache?.userId).toBe("user-001");
    expect(cache?.loadedAt).toBeGreaterThan(0);
  });

  it("propaga el error cuando @actual-app/api falla", async () => {
    vi.mocked(actualApi.downloadBudget).mockRejectedValueOnce(
      new Error("Network error"),
    );

    await expect(
      loadUserBudget("token-123", "user-001", "budget-fail"),
    ).rejects.toThrow("Network error");
  });
});
```

### 8.3 `tests/unit/middleware/auth.test.ts`

**Objetivo:** Verificar el middleware rechaza/acepta requests correctamente antes de llegar a los handlers de ruta.

```typescript
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../../../src/middleware/auth";
import { VALID_TOKEN, INVALID_TOKEN } from "../../mocks/fixtures/users";

function buildTestApp() {
  const app = new Hono();
  app.use("*", authMiddleware);
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/api/protected", (c) => c.json({ ok: true }));
  return app;
}

describe("authMiddleware", () => {
  it("permite el acceso a /health sin token", async () => {
    const res = await buildTestApp().request("/health");
    expect(res.status).toBe(200);
  });

  it("devuelve 401 cuando falta el header x-actual-token", async () => {
    const res = await buildTestApp().request("/api/protected");

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("missing-token");
  });

  it("devuelve 401 cuando el token es inválido", async () => {
    const res = await buildTestApp().request("/api/protected", {
      headers: { "x-actual-token": INVALID_TOKEN },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid-token");
  });

  it("inyecta el user en el contexto con token válido", async () => {
    const app = new Hono();
    app.use("*", authMiddleware);
    app.get("/api/me", (c) => c.json({ userId: c.get("user")?.id }));

    const res = await app.request("/api/me", {
      headers: { "x-actual-token": VALID_TOKEN },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("user-test-001");
  });
});
```

---

## 9. Tests de Integración

Los tests de integración llaman directamente a `app.request()` de Hono — **no levantan ningún servidor HTTP**. MSW intercepta los `fetch` al sync-server y `vi.mock` reemplaza `@actual-app/api`.

> **Patrón base:** `vi.mock` siempre al top del archivo, antes de importar el código fuente.

### 9.1 `tests/integration/health.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@actual-app/api", () => ({
  init: vi.fn(), shutdown: vi.fn(),
}));

import app from "../../src/index";

describe("GET /health", () => {
  it("responde 200 con status ok sin autenticación", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
```

### 9.2 `tests/integration/user.test.ts`

```typescript
describe("GET /api/user", () => {
  it("devuelve datos del usuario con token válido", async () => {
    const res = await app.request("/api/user", {
      headers: { "x-actual-token": VALID_TOKEN },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      email: expect.any(String),
      loginMethod: expect.stringMatching(/^(openid|password)$/),
      permission: expect.stringMatching(/^(ADMIN|BASIC)$/),
    });
  });

  it("devuelve 401 sin token", async () => {
    const res = await app.request("/api/user");
    expect(res.status).toBe(401);
  });
});
```

### 9.3 `tests/integration/budgets.test.ts`

```typescript
describe("GET /api/budgets", () => {
  it("retorna lista de presupuestos mapeados", async () => {
    vi.mocked(getBudgets).mockResolvedValueOnce(mockBudgets);

    const res = await app.request("/api/budgets", {
      headers: { "x-actual-token": VALID_TOKEN },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.budgets).toHaveLength(2);
  });
});

describe("POST /api/load-budget", () => {
  it("carga presupuesto con syncId válido", async () => {
    const res = await app.request("/api/load-budget", {
      method: "POST",
      headers: {
        "x-actual-token": VALID_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ syncId: "budget-sync-abc123" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.budgetId).toBe("budget-sync-abc123");
  });

  it("devuelve 400 si falta syncId", async () => {
    const res = await app.request("/api/load-budget", {
      method: "POST",
      headers: {
        "x-actual-token": VALID_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing-syncId");
  });
});
```

### 9.4 `tests/integration/accounts.test.ts`

```typescript
describe("GET /api/accounts", () => {
  it("retorna cuentas del presupuesto indicado", async () => {
    vi.mocked(getAccounts).mockResolvedValueOnce(mockAccounts);

    const res = await app.request("/api/accounts?syncId=budget-sync-abc123", {
      headers: { "x-actual-token": VALID_TOKEN },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.budgetId).toBe("budget-sync-abc123");
    expect(body.accounts).toHaveLength(2);
    expect(body.accounts[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      type: expect.any(String),
      balance: expect.any(Number),
    });
  });

  it("devuelve 400 si falta el query param syncId", async () => {
    const res = await app.request("/api/accounts", {
      headers: { "x-actual-token": VALID_TOKEN },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing-syncId-query-param");
  });
});
```

### 9.5 `tests/integration/transactions.test.ts`

```typescript
const validPayload = {
  syncId: "budget-sync-abc123",
  accountId: "acc-checking-001",
  amount: -50.0,
  payee: "Starbucks",
  category: "Alimentos",
  date: "2026-02-25",
  notes: "Café",
};

describe("POST /api/transactions", () => {
  it("registra transacción con todos los campos", async () => {
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: {
        "x-actual-token": VALID_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.budgetId).toBe(validPayload.syncId);
    expect(body.accountId).toBe(validPayload.accountId);
    expect(body.timestamp).toBeDefined();
  });

  it("acepta transacción sin campos opcionales (payee, category, notes, date)", async () => {
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: {
        "x-actual-token": VALID_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        syncId: "budget-sync-abc123",
        accountId: "acc-checking-001",
        amount: 1000.0,
      }),
    });

    expect(res.status).toBe(200);
  });

  it.each([
    [{ ...validPayload, syncId: undefined }, "syncId"],
    [{ ...validPayload, accountId: undefined }, "accountId"],
    [{ ...validPayload, amount: undefined }, "amount"],
  ])("devuelve 400 si falta el campo requerido: %s", async (payload, missingField) => {
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: {
        "x-actual-token": VALID_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.required).toContain(missingField);
  });

  it("devuelve 401 sin token", async () => {
    const res = await app.request("/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    });
    expect(res.status).toBe(401);
  });
});
```

---

## 10. Consideraciones Específicas del Proyecto

### El singleton de `@actual-app/api`

La librería mantiene estado global (`actualInitialized`, `loadedBudget`). Para evitar contaminación entre tests:

- Llamar `shutdownAPI()` en el `beforeEach` de `services/actual.test.ts` para resetear el estado.
- En tests de integración, el mock de `vi.mock` aplica a nivel de módulo y se resetea por `clearMocks: true` en la config.

### `onUnhandledRequest: "error"` en MSW

Cualquier `fetch` que no tenga un handler MSW declarado **falla el test**. Esto es intencional: si se añade una nueva llamada externa al código, el test rompe y obliga a mockearla explícitamente.

Para sobreescribir un handler en un test específico usar `server.use(...)` — MSW aplica handlers en orden LIFO.

### Exclusión de `src/index.ts` del coverage

`src/index.ts` llama a `serve()` de `@hono/node-server`, lo que levantaría un servidor real durante los tests. Se excluye del coverage y se prueba indirectamente exportando el `app` para los tests de integración.

---

## 11. CI/CD — GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install

      - name: Type check
        run: pnpm type-check

      - name: Lint
        run: pnpm lint

      - name: Tests con cobertura
        run: pnpm test:coverage

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
```

---

## 12. Roadmap de Tests por Fase de Implementación

| Fase | Implementación             | Tests a crear                           |
|------|----------------------------|-----------------------------------------|
| 1    | `src/types/`, `config.ts`  | `unit/config.test.ts`                   |
| 2    | `services/auth.ts`         | `unit/services/auth.test.ts`            |
| 3    | `services/actual.ts`       | `unit/services/actual.test.ts`          |
| 4    | `middleware/auth.ts`, `error.ts` | `unit/middleware/*.test.ts`        |
| 5    | `routes/*.ts`              | `integration/*.test.ts`                 |
| 6    | App completa               | Revisar cobertura global, ajustar umbrales |

---

## 13. Métricas de Cobertura Objetivo

| Módulo                | Lines | Functions | Branches |
|-----------------------|-------|-----------|----------|
| `services/auth.ts`    | 95%   | 100%      | 90%      |
| `services/actual.ts`  | 90%   | 100%      | 85%      |
| `middleware/auth.ts`  | 95%   | 100%      | 95%      |
| `middleware/error.ts` | 90%   | 100%      | 80%      |
| `routes/*.ts`         | 85%   | 100%      | 80%      |
| **Global mínimo**     | **80%** | **80%** | **70%** |

---

**Documento creado:** 2026-02-25
**Stack:** Vitest 4.0.18 + MSW 2.12.10
**Próximo paso:** `pnpm add -D vitest @vitest/coverage-v8 msw`
