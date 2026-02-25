// Formato raw que devuelve @actual-app/api getAccounts()
// Los saldos están en centavos enteros (como los almacena Actual internamente)
export const mockAccounts = [
  {
    id: "acc-checking-001",
    name: "Cuenta Corriente",
    type: "checking",
    offBudget: false,
    archived: false,
    balance: 250050, // 2500.50 en decimal
  },
  {
    id: "acc-credit-001",
    name: "Tarjeta Visa",
    type: "credit",
    offBudget: false,
    archived: false,
    balance: -120000, // -1200.00 en decimal
  },
  {
    id: "acc-savings-001",
    name: "Cuenta Ahorro",
    type: "savings",
    offBudget: false,
    archived: false,
    balance: 500000,
  },
  {
    id: "acc-archived-001",
    name: "Cuenta Antigua",
    type: "checking",
    offBudget: true,
    archived: true,
    balance: 0,
  },
];

export const ACCOUNT_ID = "acc-checking-001";
