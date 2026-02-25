import { http, HttpResponse } from "msw";
import { validUser, VALID_TOKEN } from "./fixtures/users";

/**
 * Handlers MSW que simulan el sync-server de Actual Budget.
 * Se registran globalmente en tests/setup.ts.
 *
 * Para sobreescribir un handler en un test específico:
 *   server.use(http.get("http://localhost:5006/account/validate", () => ...))
 * MSW aplica handlers en orden LIFO — el último registrado tiene prioridad.
 */
export const syncServerHandlers = [
  // GET /account/validate — valida el token x-actual-token
  http.get("http://localhost:5006/account/validate", ({ request }) => {
    const token = request.headers.get("x-actual-token");

    if (token === VALID_TOKEN) {
      return HttpResponse.json({
        status: "ok",
        data: {
          validated: true,
          userId: validUser.id,
          userName: validUser.email,
          displayName: validUser.name,
          loginMethod: validUser.loginMethod,
          permission: validUser.permission,
        },
      });
    }

    // Cualquier otro token → no autorizado
    return HttpResponse.json(
      { status: "error", reason: "not-validated" },
      { status: 401 },
    );
  }),
];
