# Actual Budget - System Internals

**Entendimiento Profundo del Sistema Actual**

**Versión:** 1.0
**Fecha:** 2026-02-21
**Propósito:** Documentar cómo funciona Actual internamente para implementar el REST API wrapper

---

## 📋 Tabla de Contenidos

1. [Arquitectura de Packages](#arquitectura-de-packages)
2. [Components Principales](#components-principales)
3. [Flow de Datos](#flow-de-datos)
4. [La API (@actual-app/api)](#la-api-actual-appapi)
5. [Métodos por Categoría](#métodos-por-categoría)
6. [Cómo Funciona la Sincronización](#cómo-funciona-la-sincronización)
7. [Encryption y Seguridad](#encryption-y-seguridad)
8. [Bases de Datos](#bases-de-datos)
9. [Limitaciones y Constraints](#limitaciones-y-constraints)
10. [Integración del REST API](#integración-del-rest-api)

---

## 🏗️ Arquitectura de Packages

### Estructura General

```
actual/
├── packages/
│   ├── api/                    ← Librería NPM (@actual-app/api)
│   ├── crdt/                   ← Conflict-free Replicated Data Type
│   ├── loot-core/              ← Core del negocio (logica principal)
│   ├── sync-server/            ← Servidor de sincronización
│   ├── desktop-client/         ← Frontend React
│   ├── desktop-electron/       ← App Electron (desktop)
│   ├── component-library/      ← Componentes React compartidos
│   └── docs/                   ← Documentación
```

### Relaciones entre Packages

```
┌──────────────────────────────────────┐
│        USER (Desktop/Web/Mobile)     │
└──────────────────┬───────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
   ┌─────────┐           ┌──────────┐
   │ Desktop │           │  Sync    │
   │ Client  │           │ Server   │
   │ (React) │           │ (Node.js)│
   └────┬────┘           └──────┬───┘
        │                       │
        │     ┌─────────────────┘
        │     │
        ▼     ▼
    ┌─────────────────┐
    │  loot-core      │  ← Lógica de negocio
    │ (Handlers)      │
    └────────┬────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌─────────────┐  ┌──────────────────┐
│   @actual-  │  │  Localstorage /  │
│   app/api   │  │  SQLite Database │
└─────────────┘  └──────────────────┘
```

---

## 🔧 Components Principales

### 1. **loot-core** (El Corazón)

**Ubicación:** `packages/loot-core/`

**Propósito:** Contiene toda la lógica de negocio de Actual. Es agnóstico al frontend/backend.

**Responsabilidades:**
- Manejo de presupuestos
- Cálculos de transacciones
- Reglas y filtros
- Sincronización
- Encryption/Decryption
- Reportes y análisis

**Estructura:**
```
loot-core/src/server/
├── main.ts              ← Entry point, instala handlers
├── api.ts               ← Handlers de la API
├── accounts/            ← Lógica de cuentas
├── budget/              ← Lógica de presupuestos
├── transactions/        ← Lógica de transacciones
├── payees/              ← Lógica de beneficiarios
├── categories/          ← Lógica de categorías
├── sync/                ← Sincronización CRDT
├── encryption/          ← Encryption/Decryption
├── aql.ts               ← Query engine (Actual Query Language)
├── mutators.ts          ← Mutation handlers
└── db.ts                ← Database abstraction
```

**Key Exports:**
- `handlers` - Objeto con todos los "command handlers"
- `lib` - API pública usada por @actual-app/api
- Métodos de sincronización, encryption, etc.

### 2. **@actual-app/api** (Wrapper)

**Ubicación:** `packages/api/`

**Propósito:** Librería NPM que expone métodos para usar Actual programáticamente

**Responsabilidades:**
- Wrapper sobre loot-core handlers
- Descarga/Carga de presupuestos
- Validación de tipos
- Export de métodos públicos

**Estructura:**
```
api/
├── index.ts           ← init() y shutdown()
├── methods.ts         ← Métodos públicos (100+ funciones)
├── injected.ts        ← Injection de funciones
├── utils.ts           ← Utilidades (amountToInteger, etc)
├── app/
│   └── bundle.api.js  ← Bundle compilado de loot-core
└── package.json       ← Exporta como NPM
```

**Exporta:**
```typescript
// Métodos principales
export { init, shutdown }
export { getBudgets, loadBudget, downloadBudget }
export { addTransactions, updateTransaction, deleteTransaction }
export { getAccounts, createAccount, updateAccount }
export { getCategories, createCategory, updateCategory }
export { getPayees, createPayee, updatePayee }
// ... más de 100 métodos
```

### 3. **sync-server** (Servidor Central)

**Ubicación:** `packages/sync-server/`

**Propósito:** Servidor HTTP que maneja:
- Autenticación (OpenID, Password, Header)
- Sincronización de archivos
- Almacenamiento en la nube

**Responsabilidades:**
- Login/autenticación
- Descarga de presupuestos
- Sincronización de cambios
- Almacenamiento de archivos cifrados
- Gestión de usuarios (multiuser)

**Estructura:**
```
sync-server/src/
├── app.ts                ← Express app principal
├── app-account.ts        ← Endpoints de cuenta
├── app-sync.ts           ← Endpoints de sincronización
├── app-openid.js         ← Endpoints de OpenID
├── app-gocardless/       ← Integración bancaria
├── app-simplefin/        ← Integración SimpleFin
├── app-pluggyai/         ← Integración PluggyAI
├── accounts/
│   ├── openid.js         ← Lógica OpenID
│   └── password.js       ← Lógica de password
├── services/
│   ├── user-service.js   ← Gestión de usuarios
│   └── file-service.js   ← Gestión de archivos
└── util/
    ├── validate-user.ts  ← Validación de tokens
    └── middlewares.ts    ← Express middlewares
```

**Endpoints Principales:**
- `POST /account/login` - Login
- `GET /account/validate` - Validar token
- `POST /sync` - Sincronización
- `GET /openid/callback` - OpenID callback

### 4. **CRDT** (Synchronization)

**Ubicación:** `packages/crdt/`

**Propósito:** Implementa Conflict-free Replicated Data Type para sincronización automática

**Responsabilidades:**
- Sincronización sin conflictos
- Vector clocks para ordenamiento
- Merge de datos de múltiples clientes

**Concepto:**
```
Cliente 1    Cliente 2    Cliente 3
   ↓            ↓            ↓
   └────────────┼────────────┘
                │
          CRDT Sync
          (automático)
                │
         ┌──────┼──────┐
         ↓      ↓      ↓
      Base de Datos Centralizada
```

---

## 🔄 Flow de Datos

### 1. Inicialización (`init()`)

```
User calls: await api.init({ serverURL, password })
    │
    ├─ Fetch lista de presupuestos del servidor
    ├─ Crear estructura de datos local
    └─ Conectar a base de datos local

Result: API lista para usar
```

### 2. Cargar Presupuesto (`downloadBudget()` + `loadBudget()`)

```
User calls: await api.downloadBudget(syncId)
    │
    ├─ Si es primer acceso:
    │   └─ Descargar presupuesto del servidor
    │      └─ Desencriptar si tiene password
    │      └─ Guardar en directorio local
    │
    └─ Si ya existe:
       └─ Usar versión local

User calls: await api.loadBudget(budgetId)
    │
    ├─ Abrir base de datos local (SQLite)
    ├─ Cargar presupuesto en memoria
    └─ Inicializar loot-core con datos

Result: Presupuesto listo para operaciones
```

### 3. Agregar Transacción (`addTransactions()`)

```
User calls: await api.addTransactions(accountId, [transactions])
    │
    ├─ Validar datos
    ├─ Asignar IDs únicos
    ├─ Ejecutar lógica de mutación en loot-core
    │   ├─ Actualizar saldo de cuenta
    │   ├─ Crear transacción espejo (transfers)
    │   └─ Ejecutar reglas si aplica
    │
    ├─ Guardar en base de datos local (SQLite)
    └─ Marcar como "dirty" para sincronización

User calls: await api.sync()
    │
    ├─ Crear mensaje de sincronización
    ├─ Enviar a servidor
    └─ Servidor actualiza su copia

Result: Cambios persistidos localmente y en servidor
```

### 4. Sincronización (`sync()`)

```
await api.sync()
    │
    ├─ Crear protobuffer de cambios
    ├─ Enviar POST /sync al servidor
    │   ├─ Servidor recibe cambios
    │   ├─ Aplica CRDT merge
    │   └─ Persiste en su BD
    │
    ├─ Recibir cambios remotos (si los hay)
    ├─ Aplicar CRDT merge localmente
    └─ Actualizar BD local

Result: Cliente y servidor sincronizados
```

---

## 📡 La API (@actual-app/api)

### Cómo Funciona Internamente

**Flujo de una llamada:**

```typescript
// User code
await api.addTransactions(accountId, transactions)

// Internamente en methods.ts:
export function addTransactions(...) {
  return send('api/add-transactions', {
    accountId,
    transactions
  })
}

// La función send() es inyectada por loot-core:
function send(handlerName, args) {
  return actualApp.send(handlerName, args)
}

// actualApp es la instancia de loot-core
// Que llama al handler en loot-core/src/server/api.ts:
handlers['api/add-transactions'] = async function({
  accountId,
  transactions
}) {
  // Lógica real aquí
  // Mutation en BD
  // Validaciones
  // Return resultado
}
```

**Pattern común:**
```
API Method → send() → loot-core Handler → DB Operation → Return Result
```

### Categorías de Métodos

#### A. **Presupuesto (Budget)**
```typescript
getBudgets()                           // Listar todos
loadBudget(id)                         // Cargar en memoria
downloadBudget(syncId)                 // Descargar del servidor
getBudgetMonths()                      // Meses con datos
getBudgetMonth(month)                  // Datos de mes específico
setBudgetAmount(month, categoryId, amount)
setBudgetCarryover(month, categoryId, amount)
holdBudgetForNextMonth(month, amount)
resetBudgetHold(month)
```

#### B. **Transacciones**
```typescript
addTransactions(accountId, transactions)      // Crear múltiples
importTransactions(accountId, transactions)   // Importar (sin deduplicar)
getTransactions(query)                        // Obtener con filtros
updateTransaction(id, fields)                 // Modificar
deleteTransaction(id)                         // Eliminar
```

#### C. **Cuentas (Accounts)**
```typescript
getAccounts()                          // Listar todas
createAccount(account)                 // Crear
updateAccount(id, fields)              // Modificar
closeAccount(id)                       // Archivar
reopenAccount(id)                      // Desarchivar
deleteAccount(id)                      // Eliminar
getAccountBalance(id, cutoff?)         // Obtener saldo
runBankSync(accountId)                 // Sincronizar banco
```

#### D. **Categorías**
```typescript
getCategories()                        // Listar todas
createCategory(category)               // Crear
updateCategory(id, fields)             // Modificar
deleteCategory(id, transferCategoryId) // Eliminar (transferir)
getCategoryGroups()                    // Listar grupos
createCategoryGroup(group)             // Crear grupo
```

#### E. **Beneficiarios (Payees)**
```typescript
getPayees()                            // Listar todos
createPayee(payee)                     // Crear
updatePayee(id, fields)                // Modificar
deletePayee(id)                        // Eliminar
getCommonPayees()                      // Top beneficiarios
mergePayees(targetId, mergeIds)        // Fusionar
```

#### F. **Tags**
```typescript
getTags()                              // Listar todos
createTag(tag)                         // Crear
updateTag(id, fields)                  // Modificar
deleteTag(id)                          // Eliminar
```

#### G. **Reglas**
```typescript
getRules()                             // Listar reglas
createRule(rule)                       // Crear
updateRule(rule)                       // Modificar
deleteRule(id)                         // Eliminar
getPayeeRules(payeeId)                 // Reglas de beneficiario
```

#### H. **Programas (Schedules)**
```typescript
getSchedules()                         // Listar
createSchedule(schedule)               // Crear
updateSchedule(id, fields, resetNextDate)
deleteSchedule(id)                     // Eliminar
```

#### I. **Queries (AQL)**
```typescript
aqlQuery(query)                        // Ejecutar query Actual Query Language
q                                      // Query builder
runQuery(query)                        // Deprecated: usar aqlQuery
```

#### J. **Sincronización**
```typescript
sync()                                 // Sincronizar con servidor
runBankSync(accountId)                 // Sincronizar banco
runImport(budgetName, func)            // Importar datos
batchBudgetUpdates(func)               // Batch updates
```

#### K. **System**
```typescript
init(config)                           // Inicializar
shutdown()                             // Cerrar
getServerVersion()                     // Versión servidor
utils.amountToInteger(amount)          // Conversión
utils.integerToAmount(amount)          // Conversión
```

---

## 🔐 Métodos por Categoría (Detallado)

### Transacciones - Métodos Críticos

```typescript
// ============================================
// addTransactions() - MÁS IMPORTANTE
// ============================================
addTransactions(
  accountId: string,
  transactions: Array<{
    amount: number              // En centavos (ej: 5000 = $50.00)
    payee?: string              // Nombre (se auto-crea si no existe)
    category?: string | null    // ID de categoría
    date: Date                  // Fecha
    notes?: string              // Notas
    cleared?: boolean           // Reconciliado
  }>
)

// IMPORTANTE:
// - amount: negativo = gasto, positivo = ingreso
// - Se ejecutan reglas automáticamente
// - Se crean transfers automáticamente
// - Se deduplican automáticamente
// - NO run reconciliation process

// ============================================
// importTransactions() - Para importaciones
// ============================================
importTransactions(
  accountId: string,
  transactions: Array<{...}>,
  options?: { skipDuplicates: boolean }
)

// IMPORTANTE:
// - Ejecuta full reconciliation
// - Deduplica transacciones
// - Crea lado opuesto de transfers
// - MÁS LENTO que addTransactions
// - Mejor para migración de datos

// ============================================
// updateTransaction() - Modificar
// ============================================
updateTransaction(
  id: string,
  fields: {
    amount?: number
    payee?: string
    category?: string | null
    date?: Date
    notes?: string
    cleared?: boolean
  }
)

// ============================================
// deleteTransaction() - Eliminar
// ============================================
deleteTransaction(id: string)
// Elimina la transacción y reversa los cambios
```

### Queries - Actual Query Language (AQL)

```typescript
// ============================================
// aqlQuery() - Queries avanzadas
// ============================================
aqlQuery(query)

// El query builder:
const query = q('transactions')
  .filter({ account: accountId })
  .filter({ date: { $gte: '2026-01-01' } })
  .select(['*'])

const results = await aqlQuery(query)

// Soporta:
// - filter() - Filtrar
// - select() - Campos a retornar
// - groupBy() - Agrupar
// - sort() - Ordenar
// - limit() - Limitar resultados
// - Operadores: $eq, $ne, $lt, $lte, $gt, $gte, $in, $contains

// Ejemplos:
q('transactions').filter({
  date: { $gte: '2026-01-01', $lt: '2026-02-01' },
  account: accountId,
  cleared: true
})

q('accounts').filter({
  offBudget: false,
  archived: false
})

q('payees').filter({
  name: { $contains: 'Amazon' }
})
```

---

## 🔄 Cómo Funciona la Sincronización

### Concept: Vector Clocks + CRDT

```
Cliente A                    Servidor                  Cliente B
 │                              │                         │
 ├─ Crear Txn 1                 │                         │
 │  (timestamp: 100)            │                         │
 │                              │                         │
 ├─ Enviar sync                 │                         │
 │  ├─ Mensaje con cambios      │                         │
 │  └─ Vector clock: {A:100}    │                         │
 │                              │                         │
 │                          ┌───┴────────────────────────┐
 │                          │ Merge en servidor:         │
 │                          │ - Recibe de A: {A:100}     │
 │                          │ - Aplica cambio           │
 │                          │ - Actualiza {A:100}       │
 │                          └───┬────────────────────────┘
 │                              │                         │
 │                              │                    ┌────┴─────────────┐
 │                              │                    │ Crear Txn 2      │
 │                              │                    │ (timestamp: 50)  │
 │                              │                    │ Vector: {B:50}   │
 │                              │                    └────┬─────────────┘
 │                              │                         │
 │                              │ ◄─── Envía sync
 │                              │      {B:50}
 │                              │
 │ ◄─── Pull cambios
 │      del servidor
 │      {A:100, B:50}
 │
 ├─ Merge local
 │  ├─ Tiene A:100 (propios)
 │  ├─ Recibe B:50 (nuevo)
 │  └─ Resultado: {A:100, B:50}
```

### Operación `sync()`

```typescript
await api.sync()

// Internamente:
// 1. Detectar cambios locales desde último sync
// 2. Crear mensaje protobuffer
// 3. Enviar POST /sync al servidor
//    {
//      fileId: id,
//      messages: [ ... ],
//      since: timestamp_ultimo_sync
//    }
// 4. Servidor responde con cambios remotos
// 5. Merge local de cambios remotos
// 6. Actualizar vector clock local
```

### Conflictos

**El CRDT evita conflictos:**
```
Cliente A:     Cambia Txn 1 a $100
Cliente B:     Cambia Txn 1 a $200
Servidor:      Recibe ambas con vector clocks
               Resuelve automáticamente
               (generalmente el timestamp gana)
```

---

## 🔒 Encryption y Seguridad

### Modelo de Cifrado

```
┌─────────────────────────────────────┐
│     User Password / OpenID Token    │
└──────────────┬──────────────────────┘
               │
               ├─ Derive Key (PBKDF2)
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
   Local DB        Budget File
   (Plaintext)     (Encrypted)
                   en servidor
```

### Flow de Encryption

**Al descargar presupuesto:**
```typescript
// Si el presupuesto tiene contraseña:
await downloadBudget(syncId, { password: 'user-password' })

// Internamente:
// 1. Descargar archivo cifrado del servidor
// 2. Derivar clave de contraseña (PBKDF2)
// 3. Desencriptar (AES-256)
// 4. Guardar localmente (sin encriptar)
```

**Al sincronizar:**
```typescript
// Los cambios locales se encriptan antes de enviar:
// 1. Serializar cambios
// 2. Encriptar con clave derivada
// 3. Enviar protobuffer cifrado
// 4. Servidor almacena cifrado
```

### Niveles de Seguridad

```
Nivel 1: Sin contraseña
  └─ Datos en servidor: PLAINTEXT
  └─ Datos locales: PLAINTEXT

Nivel 2: Con contraseña
  └─ Datos en servidor: ENCRYPTED (AES-256)
  └─ Datos locales: PLAINTEXT
  └─ Clave derivada de password

Nivel 3: OpenID + Server-side encryption
  └─ Datos en servidor: DOUBLE ENCRYPTED
  └─ Token OpenID valida acceso
```

---

## 💾 Bases de Datos

### 1. **Server-side (sync-server)**

```
account.sqlite
├── users
│   ├── id
│   ├── user_name (email)
│   ├── display_name
│   ├── enabled
│   ├── role
│   └── owner
│
├── sessions
│   ├── token
│   ├── user_id
│   ├── expires_at
│   └── auth_method
│
├── auth
│   ├── method (openid, password, header)
│   ├── display_name
│   ├── active
│   └── extra_data (JSON config)
│
└── budget_files
    ├── id
    ├── user_id
    ├── name
    ├── budget_id
    ├── cloudFileId
    ├── encryptKeyId
    └── encryptMeta
```

### 2. **File Storage**

```
/server-files/
├── account.sqlite          (metadatos de usuarios)
├── budgets/
│   └── {user_id}/
│       └── {budget_id}/
│           ├── data.sqlite (datos descargados)
│           └── metadata.json
└── encrypted-files/
    └── {cloudFileId}       (datos cifrados en servidor)
```

### 3. **Client-side (local)**

```
./actual-data/
└── {syncId}/
    └── data.sqlite
        │
        ├── transactions
        │   ├── id
        │   ├── account_id
        │   ├── amount
        │   ├── payee_id
        │   ├── category_id
        │   ├── date
        │   ├── notes
        │   └── cleared
        │
        ├── accounts
        │   ├── id
        │   ├── name
        │   ├── type
        │   ├── offBudget
        │   ├── archived
        │   └── balance
        │
        ├── categories
        │   ├── id
        │   ├── name
        │   ├── group_id
        │   ├── hidden
        │   └── budgeted
        │
        ├── payees
        │   ├── id
        │   ├── name
        │   ├── category_id
        │   └── transfer_acct
        │
        ├── rules
        │   ├── id
        │   ├── conditions
        │   ├── actions
        │   └── enabled
        │
        └── ...más tablas
```

---

## ⚠️ Limitaciones y Constraints

### 1. **Una Sola Instancia de Presupuesto**

```typescript
// ❌ ESTO NO FUNCIONARÁ:
await api.loadBudget('budget-1')
await api.loadBudget('budget-2')  // Sobrescribe budget-1

// ✅ TIENES QUE:
await api.shutdown()               // Cierra budget-1
await api.loadBudget('budget-2')
```

**Implicación para REST API:**
- Cache de presupuesto cargado por usuario/sessión
- Cambiar de presupuesto requiere unload/load
- Posible: mantener múltiples instancias de API (complejo)

### 2. **Inicialización Una Sola Vez**

```typescript
// ❌ ESTO NO FUNCIONARÁ:
await api.init(config1)
await api.init(config2)  // Se ignora

// ✅ TIENES QUE:
await api.shutdown()
await api.init(config2)
```

**Implicación para REST API:**
- Una sola instancia de API por servidor
- Todos los usuarios comparten la misma conexión
- Pool de conexiones necesario para multiuser

### 3. **Moneda Única por Presupuesto**

```
Un presupuesto = Una moneda
No soporta múltiples monedas simultáneamente
```

### 4. **Sin Transacciones ACID**

```
El CRDT no garantiza ACID
Posibles estados intermedios durante sincronización
```

### 5. **Límites de Rendimiento**

| Operación | Límite Recomendado | Notas |
|-----------|-------------------|-------|
| Transacciones/import | 1000s | Por batch |
| Queries | Complejo | Límite de memoria |
| Usuarios concurrentes | 10+ | Depende del servidor |
| Tamaño DB | 500MB+ | Sin problemas |

### 6. **No Hay Soporte para Múltiples Instancias**

```
No puedes tener 2 procesos Node.js
usando el mismo presupuesto simultáneamente
Riesgo: Corrupción de datos
```

---

## 🧩 Integración del REST API

### Cómo el REST API Wrapper se Integra

#### Arquitectura del Wrapper

```
┌─────────────────────────────────────┐
│        REST API (Hono)              │
│  - autenticación                    │
│  - endpoints HTTP                   │
└────────────┬────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌─────────────┐  ┌──────────────────┐
│   @actual-  │  │   sync-server    │
│   app/api   │  │   (validación)   │
└─────────────┘  └──────────────────┘
    │
    ├─ init()
    ├─ loadBudget()
    ├─ getAccounts()
    ├─ addTransactions()
    ├─ sync()
    └─ ...
```

#### Flujo Completo: Registrar Transacción

```
1. REST API recibe:
   POST /api/transactions
   Headers: x-actual-token: token
   Body: { syncId, accountId, amount, payee, ... }

2. Middleware valida token:
   GET /account/validate (sync-server)
   → Obtiene userId, permisos, etc.

3. Servicio actual carga presupuesto:
   ├─ Detecta syncId diferente
   ├─ Cierra presupuesto anterior (si lo hay)
   ├─ init(@actual-app/api)
   ├─ downloadBudget(syncId)
   └─ loadBudget(syncId)

4. Ejecuta operación:
   await addTransactions(accountId, [{
     amount,
     payee,
     category,
     date,
     notes
   }])

5. Sincroniza:
   await sync()
   → POST /sync (sync-server)

6. Devuelve respuesta:
   { success: true, timestamp, ... }
```

#### Manejo de Estado

```typescript
// Estado del servidor Hono:
let actualInitialized = false      // ¿API iniciada?
let loadedBudget = {               // ¿Qué presupuesto?
  syncId,
  userId,
  loadedAt
}

// Lógica de carga inteligente:
if (loadedBudget?.syncId === syncId && loadedBudget?.userId === userId) {
  // Presupuesto ya está cargado, reusar
  return
} else {
  // Cambio de presupuesto, descargar anterior, cargar nuevo
  await shutdown()
  actualInitialized = false
  await loadUserBudget(token, userId, syncId)
}
```

#### Consideraciones de Performance

```
# Operación       Costo Aproximado        Caché
─────────────────────────────────────────────────
init()           1s (primera vez)         Sí
downloadBudget() 5-30s (tamaño)           Sí
loadBudget()     2-5s (parser)            En memoria
addTransaction() 50-200ms                 N/A
sync()           1-5s (network)           N/A
```

**Optimizaciones en el wrapper:**
1. Cache de presupuesto cargado
2. Reusar API instance
3. Batch updates cuando sea posible
4. Connection pooling (si hay múltiples usuarios)

---

## 📊 Ejemplo Práctico: Flow Completo

### Escenario: Usuario registra gasto desde mobile

```
MÓVIL (React Native)
  ├─ Usuario abre app
  ├─ Ve lista de presupuestos (cached)
  ├─ Selecciona presupuesto
  ├─ Ve lista de cuentas
  ├─ Hace click en "Registrar Gasto"
  └─ Completa formulario:
      ├─ Monto: $50
      ├─ Beneficiario: "Starbucks"
      ├─ Categoría: "Food"
      └─ Fecha: Hoy

PETICIÓN HTTP
  POST http://api.actual.local/api/transactions
  Headers: {
    "x-actual-token": "eyJhbGc...",
    "Content-Type": "application/json"
  }
  Body: {
    "syncId": "abc123...",
    "accountId": "def456...",
    "amount": -50.00,
    "payee": "Starbucks",
    "category": "Food",
    "date": "2026-02-21"
  }

SERVIDOR HONO
  1. Middleware autenticación:
     GET /account/validate (sync-server)
     ✓ Token válido
     ✓ userId = "user-123"
     ✓ Permisos = "ADMIN"

  2. Validar presupuesto cargado:
     - syncId = "abc123..."
     - Si es diferente:
       - await shutdown()
       - await init(token)
       - await downloadBudget("abc123...")
       - await loadBudget("abc123...")

  3. Crear transacción:
     await addTransactions("def456...", [{
       amount: -5000,  // En centavos
       payee: "Starbucks",
       category: "Food",
       date: new Date("2026-02-21"),
       notes: "",
       cleared: false
     }])

     Internamente en loot-core:
     ├─ Validar account existe
     ├─ Validar category existe
     ├─ Crear/reusar payee "Starbucks"
     ├─ Validar monto
     ├─ Crear transacción
     ├─ Actualizar saldo
     ├─ Ejecutar reglas (si aplica)
     └─ Guardar en SQLite local

  4. Sincronizar:
     await sync()

     Envía POST /sync (sync-server) con:
     ├─ fileId: "abc123..."
     ├─ messages: [ protobuffer con cambios ]
     ├─ since: timestamp_último_sync

     sync-server:
     ├─ Recibe cambios
     ├─ Aplica CRDT merge
     ├─ Actualiza BD
     └─ Responde ACK

  5. Devolver respuesta:
     {
       "success": true,
       "message": "Transaction recorded",
       "budgetId": "abc123...",
       "accountId": "def456...",
       "userId": "user-123",
       "timestamp": "2026-02-21T15:30:00Z"
     }

MOBILE
  ├─ Recibe respuesta 200 OK
  ├─ Actualiza UI (optimistic update)
  ├─ Muestra confirmación
  ├─ Sincroniza con el servidor (background)
  └─ Termina

RESULTADO FINAL:
  ✓ Transacción creada localmente
  ✓ Transacción sincronizada al servidor
  ✓ Otros clientes verán el cambio
  ✓ Dinero deducido de la cuenta
  ✓ Categoría actualizada
```

---

## 🔗 Relaciones entre Componentes

### Cuando Algo Cambia

```
Usuario modifica transacción
  │
  ├─ updateTransaction() vía API
  │
  ├─ loot-core handler ejecuta
  │   ├─ Validaciones
  │   ├─ Calcula nuevos saldos
  │   ├─ Ejecuta reglas
  │   └─ Persiste en SQLite
  │
  ├─ Marca como "dirty"
  │
  ├─ sync() envía cambios
  │   ├─ Crea protobuffer
  │   ├─ Envía a servidor
  │   └─ Servidor aplica CRDT merge
  │
  └─ Otros clientes:
      ├─ Reciben cambios en siguiente sync
      ├─ Aplican CRDT merge
      ├─ Actualizan UI
      └─ Ven el cambio
```

---

## 📝 Resumen: Puntos Clave

### Para Implementar el REST API:

1. **Una sola instancia de @actual-app/api**
   - Se inicializa una vez al inicio
   - Todos los usuarios la comparten
   - Requiere sincronización

2. **Un presupuesto cargado por vez**
   - Mantener cache de cuál está cargado
   - Cambiar de presupuesto requiere unload/load
   - Caro en recursos (datos en memoria)

3. **Cada usuario necesita su token OpenID válido**
   - Validar contra sync-server
   - Token tiene timeout
   - Manejo de refresh

4. **Sincronización es automática**
   - Llamar sync() después de cambios
   - CRDT resuelve conflictos
   - No requiere intervención manual

5. **Los datos son locales**
   - Descargados en ./actual-data/
   - SQLite comprimida
   - Requiere almacenamiento

### Operaciones CRÍTICAS:

```typescript
// Siempre usar estas en orden:
await init(config)           // Una sola vez
await downloadBudget(syncId) // Descargar
await loadBudget(syncId)     // Cargar en memoria
await addTransactions(...)   // Operar
await sync()                 // Sincronizar
await shutdown()             // Limpiar
```

---

## 🚀 Próximos Pasos para el REST API

1. **Inicializar API en startup:**
   ```typescript
   await init({
     serverURL: SYNC_SERVER_URL,
     password: ADMIN_TOKEN,
     dataDir: './actual-data'
   })
   ```

2. **Validar token en middleware:**
   ```typescript
   const user = await validateToken(c.req.header('x-actual-token'))
   ```

3. **Cargar presupuesto dinámicamente:**
   ```typescript
   if (loadedBudget?.syncId !== syncId) {
     await loadUserBudget(token, userId, syncId)
   }
   ```

4. **Ejecutar operaciones:**
   ```typescript
   await addTransactions(accountId, transactions)
   await sync()
   ```

5. **Devolver resultado:**
   ```typescript
   return c.json({ success: true, ... })
   ```

---

## 📚 Recursos Internos

### Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `packages/api/methods.ts` | API pública |
| `packages/api/index.ts` | init/shutdown |
| `packages/loot-core/src/server/main.ts` | Handlers |
| `packages/loot-core/src/server/api.ts` | Implementación |
| `packages/sync-server/src/app-account.ts` | Login endpoints |
| `packages/sync-server/src/app-sync.ts` | Sync endpoints |

### Documentación Oficial

- https://actualbudget.org/docs/api/
- https://github.com/actualbudget/actual/tree/master/packages/api

---

**Documento actualizado:** 2026-02-21
**Versión del sistema:** 26.2.0
**Propósito:** Referencia interna para implementación del REST API wrapper
