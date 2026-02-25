// Token de prueba reconocido por el handler MSW en tests/mocks/handlers.ts
export const VALID_TOKEN = "valid-test-token";
export const INVALID_TOKEN = "invalid-token-xyz";

// Usuario que devuelve el sync-server cuando el token es válido
export const validUser = {
  id: "user-test-001",
  name: "Test User",
  email: "test@example.com",
  loginMethod: "openid" as const,
  permission: "ADMIN" as const,
};

// Usuario con permisos básicos para casos de borde
export const basicUser = {
  id: "user-test-002",
  name: "Basic User",
  email: "basic@example.com",
  loginMethod: "openid" as const,
  permission: "BASIC" as const,
};
