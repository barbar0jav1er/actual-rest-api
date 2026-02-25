# Actual REST API - Especificación Técnica Completa

**Versión:** 1.0
**Fecha:** 2026-02-21
**Autor:** Claude Code
**Estado:** Especificación - Pendiente Implementación

---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura](#arquitectura)
3. [Flujo de Autenticación](#flujo-de-autenticación)
4. [Especificación de Endpoints](#especificación-de-endpoints)
5. [Modelos de Datos](#modelos-de-datos)
6. [Configuración](#configuración)
7. [Instalación y Setup](#instalación-y-setup)
8. [Deployment en K3s](#deployment-en-k3s)
9. [Consideraciones Técnicas](#consideraciones-técnicas)
10. [Roadmap y TODOs](#roadmap-y-todos)

---

## 🎯 Visión General

### Propósito

Crear una **REST API wrapper** alrededor de la librería `@actual-app/api` de Actual Budget que:

- Exponga endpoints HTTP para acceder a Actual de manera programática
- Permita que aplicaciones móviles y terceros accedan a datos de presupuestos
- Integre autenticación OpenID del sync-server de Actual
- Maneje múltiples presupuestos por usuario

### Contexto Actual

- **Sync Server:** Corriendo en K3s con autenticación OpenID
- **App Desktop:** Corriendo en Mac local
- **App Web:** Accesible vía navegador móvil
- **Problema:** React Native no compatible con loot-core, necesita HTTP API
- **Solución:** Servidor Hono que expone REST API

### Stack Tecnológico

- **Framework:** Hono (lightweight web framework para Node.js)
- **API Base:** @actual-app/api
- **Lenguaje:** TypeScript
- **Runtime:** Node.js 20+
- **Container:** Docker
- **Orquestación:** K3s

---

## 🏗️ Arquitectura

### Diagrama de Flujo

```
┌──────────────────────────────────────────────────────────────┐
│                     APP MÓVIL (React Native)                 │
└────────────┬─────────────────────────────────────────────────┘
             │
             ├─ 1️⃣ OpenID Login
             │    └──> Sync Server (K3s)
             │    └──> Obtiene token OpenID
             │
             └─ 2️⃣ Llamadas REST con token
                  │
                  ▼
         ┌────────────────────────────────────────┐
         │   ACTUAL REST API (Hono Server)        │
         │   - Valida token contra sync-server    │
         │   - Carga presupuestos con @actual-api │
         │   - Maneja múltiples usuarios          │
         │   - Sincroniza cambios                 │
         └────────────┬───────────────────────────┘
                      │
         ┌────────────┴──────────────────────┐
         │                                   │
         ▼                                   ▼
    ┌─────────────┐                  ┌─────────────────┐
    │ Sync Server │                  │ @actual-app/api │
    │ (Auth/Sync) │                  │ (Lógica Actual) │
    └─────────────┘                  └─────────────────┘
         │                                   │
         └───────────────┬───────────────────┘
                         │
                         ▼
               ┌──────────────────────┐
               │ Base de Datos Actual │
               │ (En K3s)             │
               └──────────────────────┘
```

### Componentes Principales

#### 1. **Servidor Hono**

- Aplicación web ligera en Node.js
- Expone endpoints REST
- Valida autenticación en cada request
- Gestiona ciclo de vida de presupuestos

#### 2. **Middleware de Autenticación**

- Valida tokens OpenID contra sync-server
- Extrae información del usuario (userId, permisos, etc)
- Inyecta datos del usuario en el contexto de la request

#### 3. **Gestor de Presupuestos**

- Carga presupuestos bajo demanda
- Mantiene cache de presupuestos cargados
- Sincroniza cambios con el servidor

#### 4. **Integraciones Externas**

- **Sync Server:** Para validar tokens y obtener info de usuario
- **@actual-app/api:** Para operaciones de presupuesto
- **Base de datos Actual:** A través de la API

---

## 🔐 Flujo de Autenticación

### 1. Login (OpenID)

**Participantes:**

- App Móvil
- Sync Server (en K3s)

**Flujo:**

```
1. App móvil inicia login:
   POST /account/login (sync-server)
   Body: { returnUrl: "http://app-mobile/callback" }

2. Sync Server devuelve URL de OpenID provider:
   Response: { status: "ok", data: { returnUrl: "https://provider/auth?..." } }

3. App móvil redirige a URL de OpenID provider

4. Usuario se autentica en OpenID provider

5. OpenID provider redirige a callback con código
   GET http://app-mobile/callback?code=...&state=...

6. App móvil completa login en sync-server:
   GET /openid/callback?code=...&state=...
   (desde backend o webview)

7. Sync Server devuelve token:
   Response: { token: "uuid-token-aqui" }

8. App móvil guarda token en AsyncStorage
```

### 2. Validación de Token

**En cada request a REST API:**

```
1. App móvil envía request con header:
   GET /api/budgets
   Headers: { x-actual-token: "uuid-token-aqui" }

2. REST API valida token:
   GET /account/validate (sync-server)
   Headers: { x-actual-token: "uuid-token-aqui" }

3. Sync Server responde:
   {
     status: "ok",
     data: {
       validated: true,
       userId: "user-123",
       userName: "user@example.com",
       displayName: "Usuario",
       loginMethod: "openid",
       permission: "ADMIN"
     }
   }

4. Si válido:
   - Inyecta usuario en contexto
   - Procesa request
   - Devuelve respuesta

5. Si inválido:
   - Devuelve 401 Unauthorized
```

### 3. Manejo de Sesiones de Presupuesto

```
1. Primer request con syncId:
   POST /api/transactions
   Body: {
     syncId: "budget-sync-id-123",
     accountId: "acc-456",
     ...
   }

2. API carga presupuesto:
   - Descarga si no existe localmente
   - Carga en memoria
   - Guarda en cache: { syncId, userId, loadedAt }

3. Siguiente request con mismo syncId + usuario:
   - Detecta que ya está cargado
   - Reutiliza la sesión

4. Si otro usuario o syncId diferente:
   - Descarga presupuesto anterior
   - Carga nuevo
```

---

## 📡 Especificación de Endpoints

### Convenciones

- **Base URL:** `http://api.actual.local:3001` (K3s) o `http://localhost:3001` (desarrollo)
- **Autenticación:** Header `x-actual-token` (requerido excepto en `/health`)
- **Content-Type:** `application/json`
- **Códigos HTTP:**
  - `200` OK
  - `201` Created
  - `400` Bad Request
  - `401` Unauthorized
  - `404` Not Found
  - `500` Internal Server Error

---

### 1. Health Check

```http
GET /health

Response 200:
{
  "status": "ok",
  "loadedBudget": "budget-sync-id-123" | null
}
```

**Propósito:** Verificar que el servidor está disponible
**Autenticación:** No requerida
**Rate Limit:** Ninguno

---

### 2. Información del Usuario

```http
GET /api/user

Headers:
  x-actual-token: "token-uuid"

Response 200:
{
  "success": true,
  "user": {
    "id": "user-123",
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "loginMethod": "openid",
    "permission": "ADMIN" | "BASIC"
  }
}

Response 401:
{
  "error": "invalid-token"
}
```

**Propósito:** Obtener datos del usuario autenticado
**Autenticación:** Requerida
**Rate Limit:** 100 req/min

---

### 3. Listar Presupuestos del Usuario

```http
GET /api/budgets

Headers:
  x-actual-token: "token-uuid"

Response 200:
{
  "success": true,
  "userId": "user-123",
  "budgets": [
    {
      "id": "budget-sync-id-123",
      "name": "Presupuesto Personal 2026",
      "needsPassword": false,
      "owner": "user-123",
      "createdAt": "2025-01-15T10:30:00Z"
    },
    {
      "id": "budget-sync-id-456",
      "name": "Presupuesto Familia",
      "needsPassword": true,
      "owner": "user-789",
      "createdAt": "2025-06-20T14:45:00Z"
    }
  ]
}
```

**Propósito:** Obtener todos los presupuestos accesibles por el usuario
**Autenticación:** Requerida
**Rate Limit:** 30 req/min
**Notas:**

- Incluye presupuestos propios y compartidos
- `needsPassword` indica si requiere contraseña adicional para decrypt

---

### 4. Cargar Presupuesto

```http
POST /api/load-budget

Headers:
  x-actual-token: "token-uuid"
  Content-Type: "application/json"

Body:
{
  "syncId": "budget-sync-id-123"
}

Response 200:
{
  "success": true,
  "message": "Budget loaded",
  "budgetId": "budget-sync-id-123",
  "userId": "user-123"
}

Response 400:
{
  "error": "missing-syncId"
}

Response 500:
{
  "error": "failed-to-load-budget",
  "details": "..."
}
```

**Propósito:** Cargar un presupuesto específico en memoria
**Autenticación:** Requerida
**Rate Limit:** 10 req/min
**Notas:**

- Necesario antes de hacer operaciones sobre transacciones
- El servidor almacena en cache cuál presupuesto está cargado
- Si es otro usuario o presupuesto, descarga el anterior

---

### 5. Obtener Cuentas

```http
GET /api/accounts?syncId=budget-sync-id-123

Headers:
  x-actual-token: "token-uuid"

Query Parameters:
  syncId: string (requerido) - ID del presupuesto

Response 200:
{
  "success": true,
  "budgetId": "budget-sync-id-123",
  "accounts": [
    {
      "id": "acc-123",
      "name": "Cuenta Corriente",
      "type": "checking",
      "offBudget": false,
      "archived": false,
      "balance": 2500.50
    },
    {
      "id": "acc-456",
      "name": "Tarjeta de Crédito",
      "type": "credit",
      "offBudget": false,
      "archived": false,
      "balance": -1200.00
    }
  ]
}

Response 400:
{
  "error": "missing-syncId-query-param"
}
```

**Propósito:** Obtener todas las cuentas de un presupuesto
**Autenticación:** Requerida
**Rate Limit:** 60 req/min
**Notas:**

- El `syncId` debe corresponder a un presupuesto del usuario
- Los saldos están en formato decimal (ej: 1234.56)
- Incluye cuentas archivadas

---

### 6. Registrar Transacción

```http
POST /api/transactions

Headers:
  x-actual-token: "token-uuid"
  Content-Type: "application/json"

Body:
{
  "syncId": "budget-sync-id-123",        // requerido
  "accountId": "acc-123",                // requerido
  "amount": -50.00,                      // requerido (negativo = gasto)
  "payee": "Starbucks",                  // opcional
  "category": "Alimentos",               // opcional
  "date": "2026-02-21",                  // opcional, default: hoy
  "notes": "Café con Juan"               // opcional
}

Response 200:
{
  "success": true,
  "message": "Transaction recorded",
  "budgetId": "budget-sync-id-123",
  "accountId": "acc-123",
  "userId": "user-123",
  "timestamp": "2026-02-21T15:30:00Z"
}

Response 400:
{
  "error": "missing-required-fields",
  "required": ["syncId", "accountId", "amount"]
}

Response 500:
{
  "error": "failed-to-add-transaction"
}
```

**Propósito:** Registrar una nueva transacción
**Autenticación:** Requerida
**Rate Limit:** 120 req/min
**Notas:**

- `amount` negativo = gasto, positivo = ingreso
- `date` en formato ISO (YYYY-MM-DD)
- Automáticamente sincroniza con el servidor
- El `payee` se puede auto-crear si no existe

---

### 7. Obtener Transacciones (Futuro)

```http
GET /api/transactions?syncId=budget-sync-id-123&accountId=acc-123&limit=50

Headers:
  x-actual-token: "token-uuid"

Query Parameters:
  syncId: string (requerido)
  accountId: string (opcional - filtra por cuenta)
  limit: number (opcional, default: 50, max: 500)
  offset: number (opcional, default: 0)
  from: string (opcional - YYYY-MM-DD)
  to: string (opcional - YYYY-MM-DD)

Response 200:
{
  "success": true,
  "budgetId": "budget-sync-id-123",
  "accountId": "acc-123",
  "total": 234,
  "limit": 50,
  "offset": 0,
  "transactions": [
    {
      "id": "txn-123",
      "date": "2026-02-21",
      "payee": "Starbucks",
      "category": "Alimentos",
      "amount": -5.50,
      "notes": "Café",
      "cleared": false
    }
  ]
}
```

**Propósito:** Obtener transacciones de una cuenta
**Autenticación:** Requerida
**Rate Limit:** 60 req/min
**Status:** Pendiente de implementación
**Notas:**

- Soportará filtrado por fecha
- Paginación con limit/offset
- Búsqueda por payee (futuro)

---

### 8. Crear Categoría (Futuro)

```http
POST /api/categories

Headers:
  x-actual-token: "token-uuid"
  Content-Type: "application/json"

Body:
{
  "syncId": "budget-sync-id-123",
  "groupId": "group-123",
  "name": "Entretenimiento"
}

Response 201:
{
  "success": true,
  "category": {
    "id": "cat-789",
    "name": "Entretenimiento",
    "groupId": "group-123"
  }
}
```

**Status:** Pendiente de implementación

---

### 9. Actualizar Transacción (Futuro)

```http
PUT /api/transactions/:id

Headers:
  x-actual-token: "token-uuid"
  Content-Type: "application/json"

Body:
{
  "syncId": "budget-sync-id-123",
  "amount": -60.00,
  "category": "Transporte"
}

Response 200:
{
  "success": true,
  "transaction": { ... }
}
```

**Status:** Pendiente de implementación

---

## 📊 Modelos de Datos

### User

```typescript
interface User {
  id: string; // UUID
  name: string; // Display name
  email: string; // username/email
  loginMethod: "openid" | "password";
  permission: "ADMIN" | "BASIC";
}
```

### Budget

```typescript
interface Budget {
  id: string; // Sync ID
  name: string;
  needsPassword: boolean;
  owner: string; // User ID
  createdAt: string; // ISO datetime
}
```

### Account

```typescript
interface Account {
  id: string; // UUID
  name: string;
  type: "checking" | "savings" | "credit" | "investment" | "loan";
  offBudget: boolean;
  archived: boolean;
  balance: number; // Decimal format
}
```

### Transaction

```typescript
interface Transaction {
  id: string; // UUID
  date: string; // YYYY-MM-DD
  payee: string; // Nombre del beneficiario
  category: string | null; // Nombre de categoría
  amount: number; // Decimal: negativo=gasto, positivo=ingreso
  notes: string | null;
  cleared: boolean; // Reconciliado
}
```

### LoadedBudget (Cache interno)

```typescript
interface LoadedBudget {
  syncId: string;
  userId: string;
  loadedAt: number; // Timestamp
}
```

---

## ⚙️ Configuración

### Variables de Entorno

```bash
# Servidor
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# Sync Server
SYNC_SERVER_URL=http://sync-server:5006

# Storage
DATA_DIR=./actual-data

# Logging
LOG_LEVEL=info

# Seguridad
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Cache
BUDGET_CACHE_TTL_MS=3600000  # 1 hora
```

### Archivo .env (Desarrollo)

```env
# .env.local
SYNC_SERVER_URL=http://localhost:5006
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug
DATA_DIR=./actual-data
```

### Estructura de Directorios

```
actual-rest-api/
├── src/
│   ├── index.ts              # Entry point
│   ├── middleware/
│   │   ├── auth.ts           # Autenticación
│   │   └── errorHandler.ts   # Manejo de errores
│   ├── routes/
│   │   ├── budgets.ts        # Rutas de presupuestos
│   │   ├── accounts.ts       # Rutas de cuentas
│   │   ├── transactions.ts   # Rutas de transacciones
│   │   └── user.ts           # Rutas de usuario
│   ├── services/
│   │   ├── actual.ts         # Wrapper de @actual-app/api
│   │   ├── auth.ts           # Validación de tokens
│   │   └── sync-server.ts    # Comunicación con sync-server
│   └── types/
│       └── index.ts          # TypeScript types
├── .env
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

---

## 🚀 Instalación y Setup

### Prerequisites

- Node.js 20+ LTS
- npm o yarn
- Acceso a sync-server (K3s)
- TypeScript conocimientos básicos

### Paso 1: Crear proyecto

```bash
mkdir actual-rest-api
cd actual-rest-api
npm init -y
```

### Paso 2: Instalar dependencias

```bash
npm install hono @actual-app/api
npm install -D typescript tsx @types/node
```

### Paso 3: Crear estructura

```bash
mkdir -p src/{middleware,routes,services,types}
touch .env tsconfig.json
```

### Paso 4: Configurar TypeScript

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
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

### Paso 5: Configurar package.json

```json
{
  "name": "actual-rest-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@actual-app/api": "latest"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### Paso 6: Crear .env

```bash
# .env
SYNC_SERVER_URL=http://localhost:5006
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug
DATA_DIR=./actual-data
```

### Paso 7: Ejecutar en desarrollo

```bash
npm run dev
# 🚀 Servidor iniciando en puerto 3001...
```

---

## 🐳 Deployment en K3s

### 1. Crear Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código
COPY . .

# Build TypeScript
RUN npm run build

# Exponer puerto
EXPOSE 3001

# Variables de entorno
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Iniciar servidor
CMD ["node", "dist/index.js"]
```

### 2. Crear .dockerignore

```
node_modules
npm-debug.log
.env.local
.git
actual-data
dist
```

### 3. Build y Push a Registry

```bash
# Build
docker build -t actual-rest-api:1.0.0 .

# Tag
docker tag actual-rest-api:1.0.0 tu-registry.azurecr.io/actual-rest-api:1.0.0

# Push
docker push tu-registry.azurecr.io/actual-rest-api:1.0.0
```

### 4. Kubernetes Deployment

```yaml
# k3s-deployment.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: actual-api-config
  namespace: actual
data:
  SYNC_SERVER_URL: "http://sync-server:5006"
  LOG_LEVEL: "info"
  PORT: "3001"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: actual-rest-api
  namespace: actual
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: actual-rest-api
  template:
    metadata:
      labels:
        app: actual-rest-api
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3001"
    spec:
      serviceAccountName: actual-api
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
      containers:
        - name: api
          image: tu-registry.azurecr.io/actual-rest-api:1.0.0
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 3001
              protocol: TCP
          env:
            - name: NODE_ENV
              value: "production"
          envFrom:
            - configMapRef:
                name: actual-api-config
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 2
          volumeMounts:
            - name: data
              mountPath: /app/actual-data
      volumes:
        - name: data
          emptyDir: {}
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - actual-rest-api
                topologyKey: kubernetes.io/hostname

---
apiVersion: v1
kind: Service
metadata:
  name: actual-rest-api
  namespace: actual
spec:
  type: LoadBalancer
  selector:
    app: actual-rest-api
  ports:
    - name: http
      port: 3001
      targetPort: http
      protocol: TCP

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: actual-rest-api
  namespace: actual
spec:
  podSelector:
    matchLabels:
      app: actual-rest-api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: actual
      ports:
        - protocol: TCP
          port: 3001

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: actual-api
  namespace: actual
```

### 5. Deploy en K3s

```bash
# Crear namespace
kubectl create namespace actual

# Aplicar ConfigMap
kubectl apply -f k3s-deployment.yaml

# Verificar deployment
kubectl get deployment -n actual
kubectl get pods -n actual
kubectl logs -f -n actual deployment/actual-rest-api

# Port forward para testing
kubectl port-forward -n actual svc/actual-rest-api 3001:3001

# Verificar health
curl http://localhost:3001/health
```

---

## 🔧 Consideraciones Técnicas

### Seguridad

1. **Autenticación:**
   - Validar token en cada request
   - Mantener sincronizado con sync-server
   - Rate limiting por token

2. **Autorización:**
   - Solo usuarios con permisos pueden acceder a sus presupuestos
   - Validar que usuario tenga acceso al presupuesto

3. **Encryption:**
   - HTTPS en producción (TLS)
   - Tokens en header (no en URL)
   - Datos almacenados en memoria (no persistidos)

4. **CORS:**
   - Restringir orígenes permitidos
   - Solo métodos necesarios

### Performance

1. **Cache de Presupuestos:**
   - Mantener en memoria el presupuesto cargado
   - TTL de 1 hora
   - Limpiar automáticamente al cambiar de usuario

2. **Rate Limiting:**
   - 100 req/min por usuario
   - 1000 req/min total del servidor
   - Implementar con middleware

3. **Concurrencia:**
   - Hono es async-first
   - Usar Promise.all() para operaciones paralelas
   - Cuidado con mutex en presupuestos compartidos

### Error Handling

1. **Validaciones:**
   - Validar tipos de datos
   - Validar rangos (ej: amount > 0)
   - Mensajes de error descriptivos

2. **Recuperación:**
   - Reintentos automáticos para fallos de red
   - Timeout de 30s para operaciones largas
   - Logging detallado de errores

### Monitoreo

1. **Métricas:**
   - Requests/segundo
   - Latencia por endpoint
   - Errores por tipo
   - Cache hit rate

2. **Logs:**
   - Estructura JSON
   - Niveles: error, warn, info, debug
   - Correlation ID por request

3. **Alertas:**
   - Fallos de autenticación
   - Errores 500
   - Latencia > 5s

---

## 📅 Roadmap y TODOs

### Fase 1: MVP (v1.0) ✅

- [ ] Setup inicial con Hono
- [ ] Middleware de autenticación OpenID
- [ ] Endpoints básicos:
  - [ ] `/health`
  - [ ] `/api/user`
  - [ ] `/api/budgets`
  - [ ] `/api/load-budget`
  - [ ] `/api/accounts`
  - [ ] `/api/transactions` (POST)
- [ ] Documentación
- [ ] Docker build
- [ ] K3s deployment básico

### Fase 2: Mejoras (v1.1)

- [ ] GET `/api/transactions` con filtrado
- [ ] PUT `/api/transactions/:id` - editar transacciones
- [ ] DELETE `/api/transactions/:id` - eliminar transacciones
- [ ] Endpoints de categorías
- [ ] Endpoints de payees
- [ ] Paginación mejorada

### Fase 3: Características (v2.0)

- [ ] Webhooks para cambios
- [ ] WebSocket para sync real-time
- [ ] Exports (CSV, Excel)
- [ ] Importación de transacciones batch
- [ ] Análisis y reportes
- [ ] Multi-tenancy mejorado

### Fase 4: Producción (v2.1+)

- [ ] Tests unitarios
- [ ] Tests de integración
- [ ] Tests de carga
- [ ] CI/CD pipeline
- [ ] Versionamiento de API
- [ ] Backward compatibility

---

## 📚 Referencias

### Documentación Oficial

- [Actual Budget API Docs](https://actualbudget.org/docs/api/)
- [Hono Documentation](https://hono.dev)
- [Node.js Best Practices](https://nodejs.org/en/docs/)

### Código Relacionado

- `packages/api/` - Especificación de @actual-app/api
- `packages/sync-server/` - Implementación del sync-server
- `packages/loot-core/` - Core de Actual

### Librerías Clave

- `@actual-app/api` - SDK oficial de Actual
- `hono` - Web framework
- `node-fetch` - HTTP client (incluido en Node 18+)

---

## 📝 Notas de Implementación

### Puntos Críticos

1. **Inicialización de API:**
   - Debe hacerse UNA SOLA VEZ al iniciar el servidor
   - Reutilizar la instancia para todos los requests
   - Limpiar con `shutdown()` al cerrar

2. **Carga de Presupuestos:**
   - Es una operación pesada (descarga datos)
   - Cachear en memoria
   - Sincronizar después de cambios

3. **Autenticación:**
   - Siempre validar contra sync-server
   - Cachear resultado por 5 minutos
   - Manejar timeouts

4. **Concurrencia:**
   - Múltiples usuarios simultáneamente
   - Cada uno puede tener diferente presupuesto cargado
   - Considerar mutex o session per usuario

### Testing Recomendado

```bash
# Health check
curl http://localhost:3001/health

# Obtener usuario (requiere token válido)
curl -H "x-actual-token: YOUR_TOKEN" \
  http://localhost:3001/api/user

# Listar presupuestos
curl -H "x-actual-token: YOUR_TOKEN" \
  http://localhost:3001/api/budgets

# Registrar transacción
curl -X POST http://localhost:3001/api/transactions \
  -H "x-actual-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "syncId": "budget-id",
    "accountId": "account-id",
    "amount": -50.00,
    "payee": "Test",
    "category": "Testing"
  }'
```

---

## ✅ Checklist de Implementación

- [ ] Proyecto creado y configurado
- [ ] Dependencias instaladas
- [ ] TypeScript configurado
- [ ] Estructura de directorios creada
- [ ] Middleware de auth implementado
- [ ] Rutas configuradas
- [ ] Endpoints implementados
- [ ] Error handling
- [ ] Logging
- [ ] Dockerfile creado
- [ ] Kubernetes manifests listos
- [ ] Tests básicos
- [ ] Documentación actualizada
- [ ] GitHub Actions CI/CD
- [ ] Deploy en K3s completado
- [ ] Monitoring/alertas configurado

---

**Documento creado:** 2026-02-21
**Última actualización:** 2026-02-21
**Mantenedor:** Claude Code + Usuario
**Licencia:** Proyecto privado
