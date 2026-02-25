// Formato raw que devuelve @actual-app/api getBudgets()
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

// IDs de presupuesto usados en tests
export const BUDGET_SYNC_ID = "budget-sync-abc123";
export const BUDGET_SYNC_ID_WITH_PASSWORD = "budget-sync-def456";
