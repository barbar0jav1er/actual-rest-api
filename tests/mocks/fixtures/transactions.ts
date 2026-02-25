import { BUDGET_SYNC_ID } from "./budgets";
import { ACCOUNT_ID } from "./accounts";

// Payload válido para POST /api/transactions (campos completos)
export const validTransactionPayload = {
  syncId: BUDGET_SYNC_ID,
  accountId: ACCOUNT_ID,
  amount: -50.0,
  payee: "Starbucks",
  category: "Alimentos",
  date: "2026-02-25",
  notes: "Café",
};

// Payload mínimo válido (solo campos requeridos)
export const minimalTransactionPayload = {
  syncId: BUDGET_SYNC_ID,
  accountId: ACCOUNT_ID,
  amount: -50.0,
};

// Transacciones en el formato raw que devuelve @actual-app/api
export const mockTransactions = [
  {
    id: "txn-001",
    date: "2026-02-25",
    payee: "Starbucks",
    category: "Alimentos",
    amount: -5050, // -50.50 en decimal
    notes: "Café",
    cleared: false,
  },
  {
    id: "txn-002",
    date: "2026-02-24",
    payee: "Nómina",
    category: null,
    amount: 300000, // 3000.00 en decimal
    notes: null,
    cleared: true,
  },
];
