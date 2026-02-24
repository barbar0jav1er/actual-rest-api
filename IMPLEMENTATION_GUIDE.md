# Guía de Implementación - Actual REST API

**Descripción:** Plan paso a paso para implementar el servidor Hono REST API
**Target:** Implementación con Claude Code
**Duración Estimada:** 2-3 horas

---

## 📋 Pre-requisitos

✅ **Verificar antes de comenzar:**

```bash
# Node.js 20+
node --version
# v20.x.x ✓

# npm
npm --version
# 10.x.x ✓

# Acceso a K3s
kubectl get nodes
# NAME    STATUS   ROLES                  AGE   VERSION
# ...

# Sync Server accesible
curl http://tu-sync-server:5006/account/needs-bootstrap
# {"status":"ok","data":...}
```

---

## 🎯 Fases de Implementación

### Fase 1: Setup Inicial (30 minutos)

#### 1.1 Crear directorio y estructura

```bash
cd /Users/bjvalmaseda/dev
mkdir -p actual-rest-api
cd actual-rest-api

# Crear estructura
mkdir -p src/{middleware,routes,services,types}
```

#### 1.2 Inicializar proyecto Node

```bash
npm init -y
```

**Cambios en `package.json`:**
```json
{
  "name": "actual-rest-api",
  "version": "1.0.0",
  "type": "module",
  "description": "REST API wrapper para Actual Budget",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "tsc --noEmit",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@actual-app/api": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",
    "@types/node": "^20.10.0"
  }
}
```

#### 1.3 Instalar dependencias

```bash
npm install
```

#### 1.4 Configurar TypeScript

**Crear `tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "bundler",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 1.5 Crear archivo .env

**`.env`:**
```env
# Servidor
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Sync Server
SYNC_SERVER_URL=http://localhost:5006

# Storage
DATA_DIR=./actual-data

# Logging
LOG_LEVEL=debug
```

#### 1.6 Crear .gitignore

```
node_modules/
dist/
.env.local
actual-data/
*.log
.DS_Store
```

---

### Fase 2: Tipos y Utilidades (20 minutos)

#### 2.1 Crear tipos TypeScript

**`src/types/index.ts`:**
```typescript
// User
export interface User {
  id: string
  name: string
  email: string
  loginMethod: 'openid' | 'password'
  permission: 'ADMIN' | 'BASIC'
}

// Budget
export interface Budget {
  id: string
  name: string
  needsPassword: boolean
  owner: string
}

// Account
export interface Account {
  id: string
  name: string
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'loan'
  offBudget: boolean
  archived: boolean
  balance: number
}

// Transaction
export interface Transaction {
  id: string
  date: string
  payee: string | null
  category: string | null
  amount: number
  notes: string | null
  cleared: boolean
}

// Loaded Budget (cache interno)
export interface LoadedBudgetCache {
  syncId: string
  userId: string
  loadedAt: number
}

// API Responses
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
```

#### 2.2 Crear configuración

**`src/config.ts`:**
```typescript
export const config = {
  port: parseInt(process.env.PORT || '3001'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  syncServerUrl: process.env.SYNC_SERVER_URL || 'http://localhost:5006',
  dataDir: process.env.DATA_DIR || './actual-data',
  logLevel: process.env.LOG_LEVEL || 'info',
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production'
}
```

---

### Fase 3: Servicios Principales (45 minutos)

#### 3.1 Servicio de Autenticación

**`src/services/auth.ts`:**
```typescript
import type { User } from '../types/index'

const SYNC_SERVER_URL = process.env.SYNC_SERVER_URL || 'http://localhost:5006'

export async function validateToken(token: string): Promise<User | null> {
  if (!token) return null

  try {
    const response = await fetch(`${SYNC_SERVER_URL}/account/validate`, {
      method: 'GET',
      headers: {
        'x-actual-token': token,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) return null

    const data = await response.json()

    if (!data.data) return null

    // Mapear response a User
    return {
      id: data.data.userId,
      name: data.data.displayName || data.data.userName,
      email: data.data.userName,
      loginMethod: data.data.loginMethod || 'openid',
      permission: data.data.permission || 'BASIC'
    }
  } catch (err) {
    console.error('Token validation failed:', err)
    return null
  }
}
```

#### 3.2 Servicio de Actual API

**`src/services/actual.ts`:**
```typescript
import {
  init,
  downloadBudget,
  getBudgets,
  getAccounts,
  addTransactions,
  sync,
  loadBudget,
  shutdown
} from '@actual-app/api'
import type { LoadedBudgetCache } from '../types/index'

let actualInitialized = false
let loadedBudget: LoadedBudgetCache | null = null

export async function initActualAPI(token: string): Promise<void> {
  if (actualInitialized) return

  try {
    await init({
      dataDir: process.env.DATA_DIR || './actual-data',
      serverURL: process.env.SYNC_SERVER_URL || 'http://localhost:5006',
      password: token,
      verbose: process.env.LOG_LEVEL === 'debug'
    })
    actualInitialized = true
    console.log('✅ Actual API initialized')
  } catch (err) {
    console.error('❌ Failed to init Actual API:', err)
    throw err
  }
}

export async function loadUserBudget(
  token: string,
  userId: string,
  syncId: string
): Promise<void> {
  // Verificar si ya está cargado
  if (loadedBudget?.syncId === syncId && loadedBudget?.userId === userId) {
    console.log(`✅ Budget ${syncId} already loaded`)
    return
  }

  try {
    await initActualAPI(token)

    console.log(`📥 Loading budget: ${syncId}`)
    await downloadBudget(syncId)
    await loadBudget(syncId)

    loadedBudget = {
      syncId,
      userId,
      loadedAt: Date.now()
    }

    console.log(`✅ Budget loaded: ${syncId}`)
  } catch (err) {
    console.error(`❌ Failed to load budget ${syncId}:`, err)
    throw err
  }
}

export async function getAllBudgets() {
  return await getBudgets()
}

export async function getAllAccounts() {
  return await getAccounts()
}

export async function createTransaction(
  accountId: string,
  data: {
    amount: number
    payee?: string
    category?: string | null
    date?: string
    notes?: string
  }
) {
  const transaction = {
    amount: data.amount,
    payee: data.payee || 'Mobile App',
    category: data.category || null,
    date: data.date ? new Date(data.date) : new Date(),
    notes: data.notes || '',
    cleared: false
  }

  await addTransactions(accountId, [transaction])
  await sync()
}

export async function shutdownAPI(): Promise<void> {
  if (actualInitialized) {
    try {
      await shutdown()
      actualInitialized = false
      loadedBudget = null
      console.log('✅ Actual API shutdown')
    } catch (err) {
      console.error('Error shutting down API:', err)
    }
  }
}

export function getLoadedBudgetCache() {
  return loadedBudget
}
```

---

### Fase 4: Middleware (20 minutos)

#### 4.1 Middleware de Autenticación

**`src/middleware/auth.ts`:**
```typescript
import { Context, Next } from 'hono'
import { validateToken } from '../services/auth'

export async function authMiddleware(c: Context, next: Next) {
  // Rutas públicas
  if (c.req.path === '/health') {
    await next()
    return
  }

  const token = c.req.header('x-actual-token')

  if (!token) {
    return c.json({ error: 'missing-token', success: false }, 401)
  }

  const user = await validateToken(token)
  if (!user) {
    return c.json({ error: 'invalid-token', success: false }, 401)
  }

  // Guardar en contexto
  c.set('user', user)
  c.set('token', token)

  await next()
}

export function getUser(c: Context) {
  return c.get('user')
}

export function getToken(c: Context) {
  return c.get('token')
}
```

#### 4.2 Middleware de Errores

**`src/middleware/error.ts`:**
```typescript
import { Context, Next } from 'hono'

export async function errorHandler(c: Context, next: Next) {
  try {
    await next()
  } catch (err: any) {
    console.error('Error:', err)

    const status = err.status || 500
    const message = err.message || 'Internal Server Error'

    return c.json(
      {
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { details: err.stack })
      },
      status
    )
  }
}
```

---

### Fase 5: Rutas (60 minutos)

#### 5.1 Rutas de Usuario

**`src/routes/user.ts`:**
```typescript
import { Hono } from 'hono'
import { getUser } from '../middleware/auth'
import type { User } from '../types/index'

const app = new Hono()

app.get('/user', (c) => {
  const user = getUser(c) as User

  return c.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      loginMethod: user.loginMethod,
      permission: user.permission
    }
  })
})

export default app
```

#### 5.2 Rutas de Presupuestos

**`src/routes/budgets.ts`:**
```typescript
import { Hono } from 'hono'
import { getUser, getToken } from '../middleware/auth'
import { initActualAPI, getAllBudgets, loadUserBudget } from '../services/actual'
import type { User } from '../types/index'

const app = new Hono()

app.get('/budgets', async (c) => {
  try {
    const user = getUser(c) as User
    const token = getToken(c) as string

    await initActualAPI(token)
    const budgets = await getAllBudgets()

    return c.json({
      success: true,
      userId: user.id,
      budgets: budgets.map((b: any) => ({
        id: b.id,
        name: b.name,
        needsPassword: b.hasPassword,
        owner: b.owner
      }))
    })
  } catch (err: any) {
    console.error('Error getting budgets:', err)
    return c.json({ success: false, error: 'failed-to-get-budgets' }, 500)
  }
})

app.post('/load-budget', async (c) => {
  try {
    const user = getUser(c) as User
    const token = getToken(c) as string
    const { syncId } = await c.req.json()

    if (!syncId) {
      return c.json({ success: false, error: 'missing-syncId' }, 400)
    }

    await loadUserBudget(token, user.id, syncId)

    return c.json({
      success: true,
      message: 'Budget loaded',
      budgetId: syncId,
      userId: user.id
    })
  } catch (err: any) {
    console.error('Error loading budget:', err)
    return c.json({ success: false, error: 'failed-to-load-budget' }, 500)
  }
})

export default app
```

#### 5.3 Rutas de Cuentas

**`src/routes/accounts.ts`:**
```typescript
import { Hono } from 'hono'
import { getUser, getToken } from '../middleware/auth'
import { initActualAPI, getAllAccounts, loadUserBudget } from '../services/actual'
import type { User } from '../types/index'

const app = new Hono()

app.get('/accounts', async (c) => {
  try {
    const user = getUser(c) as User
    const token = getToken(c) as string
    const syncId = c.req.query('syncId')

    if (!syncId) {
      return c.json(
        { success: false, error: 'missing-syncId-query-param' },
        400
      )
    }

    await loadUserBudget(token, user.id, syncId)
    const accounts = await getAllAccounts()

    return c.json({
      success: true,
      budgetId: syncId,
      accounts: accounts.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        offBudget: a.offBudget,
        archived: a.archived,
        balance: a.balance
      }))
    })
  } catch (err: any) {
    console.error('Error getting accounts:', err)
    return c.json({ success: false, error: 'failed-to-get-accounts' }, 500)
  }
})

export default app
```

#### 5.4 Rutas de Transacciones

**`src/routes/transactions.ts`:**
```typescript
import { Hono } from 'hono'
import { getUser, getToken } from '../middleware/auth'
import { loadUserBudget, createTransaction } from '../services/actual'
import type { User } from '../types/index'

const app = new Hono()

app.post('/transactions', async (c) => {
  try {
    const user = getUser(c) as User
    const token = getToken(c) as string

    const {
      syncId,
      accountId,
      amount,
      payee,
      category,
      date,
      notes
    } = await c.req.json()

    // Validaciones
    if (!syncId || !accountId || amount === undefined) {
      return c.json(
        {
          success: false,
          error: 'missing-required-fields',
          required: ['syncId', 'accountId', 'amount']
        },
        400
      )
    }

    // Cargar presupuesto
    await loadUserBudget(token, user.id, syncId)

    // Crear transacción
    await createTransaction(accountId, {
      amount,
      payee,
      category,
      date,
      notes
    })

    return c.json({
      success: true,
      message: 'Transaction recorded',
      budgetId: syncId,
      accountId,
      userId: user.id,
      timestamp: new Date().toISOString()
    })
  } catch (err: any) {
    console.error('Error adding transaction:', err)
    return c.json({ success: false, error: 'failed-to-add-transaction' }, 500)
  }
})

export default app
```

---

### Fase 6: Archivo Principal (15 minutos)

#### 6.1 Crear index.ts

**`src/index.ts`:**
```typescript
import { Hono } from 'hono'
import { config } from './config'
import { authMiddleware, errorHandler } from './middleware/auth'
import userRoutes from './routes/user'
import budgetRoutes from './routes/budgets'
import accountRoutes from './routes/accounts'
import transactionRoutes from './routes/transactions'
import { shutdownAPI } from './services/actual'

const app = new Hono()

// Middleware global
app.use(errorHandler)

// Health check (sin autenticación)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  })
})

// Aplicar middleware de autenticación a partir de aquí
app.use('*', authMiddleware)

// Rutas
app.route('/api', userRoutes)
app.route('/api', budgetRoutes)
app.route('/api', accountRoutes)
app.route('/api', transactionRoutes)

// Manejo de ruta no encontrada
app.notFound((c) => {
  return c.json({ success: false, error: 'not-found' }, 404)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...')
  await shutdownAPI()
  process.exit(0)
})

// Iniciar servidor
console.log(`
╔════════════════════════════════════════╗
║  🚀 Actual REST API Server              ║
╚════════════════════════════════════════╝

📍 Sync Server: ${config.syncServerUrl}
🔌 API Server:  http://${config.host}:${config.port}
🌍 Environment: ${config.nodeEnv}
`)

export default app
```

---

### Fase 7: Testing (20 minutos)

#### 7.1 Ejecutar en desarrollo

```bash
npm run dev

# Output:
# ╔════════════════════════════════════════╗
# ║  🚀 Actual REST API Server              ║
# ╚════════════════════════════════════════╝
#
# 📍 Sync Server: http://localhost:5006
# 🔌 API Server:  http://0.0.0.0:3001
# 🌍 Environment: development
```

#### 7.2 Probar endpoints

**Health check:**
```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"..."}
```

**Con token válido (necesitas obtener un token OpenID):**
```bash
# Variables
TOKEN="tu-token-openid-aqui"

# Usuario
curl -H "x-actual-token: $TOKEN" \
  http://localhost:3001/api/user

# Presupuestos
curl -H "x-actual-token: $TOKEN" \
  http://localhost:3001/api/budgets

# Cargar presupuesto
curl -X POST http://localhost:3001/api/load-budget \
  -H "x-actual-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "syncId": "budget-sync-id-aqui"
  }'

# Obtener cuentas
curl -H "x-actual-token: $TOKEN" \
  'http://localhost:3001/api/accounts?syncId=budget-sync-id-aqui'

# Registrar transacción
curl -X POST http://localhost:3001/api/transactions \
  -H "x-actual-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "syncId": "budget-sync-id-aqui",
    "accountId": "account-id-aqui",
    "amount": -50.00,
    "payee": "Starbucks",
    "category": "Food"
  }'
```

---

### Fase 8: Dockerización (20 minutos)

#### 8.1 Crear Dockerfile

**`Dockerfile`:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001

ENV NODE_ENV=production
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/index.js"]
```

#### 8.2 Crear .dockerignore

**`.dockerignore`:**
```
node_modules
npm-debug.log
.env.local
.git
actual-data
dist
.DS_Store
```

#### 8.3 Build Docker

```bash
docker build -t actual-rest-api:1.0.0 .

# Probar localmente
docker run -p 3001:3001 \
  -e SYNC_SERVER_URL=http://host.docker.internal:5006 \
  actual-rest-api:1.0.0

# Verificar
curl http://localhost:3001/health
```

---

### Fase 9: Deployment en K3s (30 minutos)

Ver archivo `ACTUAL_REST_API_SPEC.md` sección "Deployment en K3s"

```bash
# Crear namespace
kubectl create namespace actual

# Aplicar deployment
kubectl apply -f k3s-deployment.yaml

# Verificar
kubectl get pods -n actual
kubectl logs -f -n actual deployment/actual-rest-api

# Port forward
kubectl port-forward -n actual svc/actual-rest-api 3001:3001

# Probar
curl http://localhost:3001/health
```

---

## ✅ Checklist de Completamiento

- [ ] **Fase 1:** Setup inicial completado
- [ ] **Fase 2:** Tipos y configuración
- [ ] **Fase 3:** Servicios funcionando
- [ ] **Fase 4:** Middleware de auth
- [ ] **Fase 5:** Todas las rutas
- [ ] **Fase 6:** index.ts principal
- [ ] **Fase 7:** Tests locales exitosos
- [ ] **Fase 8:** Docker buildeable
- [ ] **Fase 9:** Deploy en K3s
- [ ] **Documentación:** Actualizada
- [ ] **CI/CD:** Configurado (futuro)

---

## 🐛 Troubleshooting Común

### Error: "Cannot find module @actual-app/api"
```bash
npm install @actual-app/api
```

### Error: "Token validation failed"
- Verificar que SYNC_SERVER_URL es correcto
- Verificar que sync-server está corriendo
- Verificar que token es válido

### Error: "Failed to load budget"
- Verificar que syncId es correcto
- Verificar que usuario tiene acceso al presupuesto
- Revisar logs de @actual-app/api

### Puerto 3001 en uso
```bash
# Cambiar puerto
PORT=3002 npm run dev

# O liberar puerto
lsof -i :3001
kill -9 <PID>
```

---

## 📚 Recursos

- **ACTUAL_REST_API_SPEC.md** - Especificación completa
- **Código base:** `/Users/bjvalmaseda/dev/actual-rest-api/`
- **Documentación oficial:** https://actualbudget.org/docs/api/

---

**Próximo paso:** Ejecutar con Claude Code

```bash
cd /Users/bjvalmaseda/dev/actual-rest-api
npm run dev
```
