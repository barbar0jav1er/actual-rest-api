# Actual REST API - Quick Reference

**Para consulta rápida durante la implementación**

---

## 🚀 Quick Start

```bash
cd /Users/bjvalmaseda/dev/actual-rest-api

# Instalar
npm install

# Desarrollo
npm run dev

# Build
npm run build

# Producción
npm start
```

---

## 📡 Endpoints API

### Health Check
```
GET /health
→ { "status": "ok", "timestamp": "..." }
```

### User Info
```
GET /api/user
Headers: x-actual-token: TOKEN
→ { "success": true, "user": {...} }
```

### List Budgets
```
GET /api/budgets
Headers: x-actual-token: TOKEN
→ { "success": true, "budgets": [...] }
```

### Load Budget
```
POST /api/load-budget
Headers: x-actual-token: TOKEN
Body: { "syncId": "..." }
→ { "success": true, "message": "Budget loaded" }
```

### Get Accounts
```
GET /api/accounts?syncId=SYNC_ID
Headers: x-actual-token: TOKEN
→ { "success": true, "accounts": [...] }
```

### Create Transaction
```
POST /api/transactions
Headers: x-actual-token: TOKEN
Body: {
  "syncId": "...",
  "accountId": "...",
  "amount": -50.00,
  "payee": "...",
  "category": "...",
  "date": "2026-02-21"
}
→ { "success": true, "message": "Transaction recorded" }
```

---

## 📁 Estructura de Archivos

```
actual-rest-api/
├── src/
│   ├── index.ts ..................... Entry point
│   ├── config.ts .................... Configuración
│   ├── types/
│   │   └── index.ts ................ TypeScript types
│   ├── middleware/
│   │   ├── auth.ts ................ Auth middleware
│   │   └── error.ts ............... Error handler
│   ├── services/
│   │   ├── auth.ts ................ Token validation
│   │   └── actual.ts .............. API wrapper
│   └── routes/
│       ├── user.ts ............... /api/user
│       ├── budgets.ts ............ /api/budgets
│       ├── accounts.ts ........... /api/accounts
│       └── transactions.ts ....... /api/transactions
├── dist/ ........................... Compiled JS
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env
└── .gitignore
```

---

## 🔑 Variables de Entorno

```env
# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# API
SYNC_SERVER_URL=http://localhost:5006
DATA_DIR=./actual-data

# Logging
LOG_LEVEL=debug
```

---

## 🧪 Testing Local

```bash
# Health check
curl http://localhost:3001/health

# Get user (with token)
TOKEN="your-token-here"
curl -H "x-actual-token: $TOKEN" http://localhost:3001/api/user

# List budgets
curl -H "x-actual-token: $TOKEN" http://localhost:3001/api/budgets

# Load budget
curl -X POST http://localhost:3001/api/load-budget \
  -H "x-actual-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"syncId": "budget-id"}'

# Get accounts
SYNC_ID="budget-sync-id"
curl -H "x-actual-token: $TOKEN" \
  "http://localhost:3001/api/accounts?syncId=$SYNC_ID"

# Create transaction
curl -X POST http://localhost:3001/api/transactions \
  -H "x-actual-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "syncId": "'$SYNC_ID'",
    "accountId": "acc-id",
    "amount": -50.00,
    "payee": "Starbucks",
    "category": "Food"
  }'
```

---

## 🐳 Docker

```bash
# Build
docker build -t actual-rest-api:1.0.0 .

# Run locally
docker run -p 3001:3001 \
  -e SYNC_SERVER_URL=http://host.docker.internal:5006 \
  actual-rest-api:1.0.0

# Push to registry
docker tag actual-rest-api:1.0.0 registry/actual-rest-api:1.0.0
docker push registry/actual-rest-api:1.0.0
```

---

## ☸️ Kubernetes

```bash
# Deploy
kubectl apply -f k3s-deployment.yaml

# Check status
kubectl get deployment -n actual
kubectl get pods -n actual
kubectl logs -f -n actual deployment/actual-rest-api

# Port forward
kubectl port-forward -n actual svc/actual-rest-api 3001:3001

# Test
curl http://localhost:3001/health
```

---

## 🔧 Debugging

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Inspect TypeScript compilation
npm run lint

# Check for type errors
npm run type-check

# See loaded budget cache
# In browser console:
// fetch('http://localhost:3001/health')
//   .then(r => r.json())
//   .then(d => console.log(d.loadedBudget))
```

---

## 📝 Key Files to Create

| File | Purpose |
|------|---------|
| `src/index.ts` | Main entry point |
| `src/config.ts` | Configuration |
| `src/types/index.ts` | TypeScript types |
| `src/services/auth.ts` | Token validation |
| `src/services/actual.ts` | API wrapper |
| `src/middleware/auth.ts` | Auth middleware |
| `src/middleware/error.ts` | Error handler |
| `src/routes/user.ts` | User routes |
| `src/routes/budgets.ts` | Budget routes |
| `src/routes/accounts.ts` | Account routes |
| `src/routes/transactions.ts` | Transaction routes |
| `package.json` | Dependencies |
| `tsconfig.json` | TypeScript config |
| `.env` | Environment vars |
| `Dockerfile` | Docker image |
| `.dockerignore` | Docker ignore |

---

## 🎯 Implementation Order

1. ✅ Create directory structure
2. ✅ Initialize Node.js project
3. ✅ Install dependencies
4. ✅ Configure TypeScript
5. ✅ Create types
6. ✅ Create services
7. ✅ Create middleware
8. ✅ Create routes
9. ✅ Create main file
10. ✅ Test locally
11. ✅ Docker build
12. ✅ K3s deploy

---

## 🔗 Important URLs

| Service | URL |
|---------|-----|
| Sync Server | `http://localhost:5006` |
| REST API (local) | `http://localhost:3001` |
| REST API (K3s) | `http://actual-rest-api:3001` |
| Actual Docs | https://actualbudget.org/docs/api/ |
| Hono Docs | https://hono.dev |

---

## ❌ Common Errors

| Error | Solution |
|-------|----------|
| `Cannot find module @actual-app/api` | `npm install @actual-app/api` |
| `Token validation failed` | Check SYNC_SERVER_URL, verify token valid |
| `Failed to load budget` | Verify syncId correct, user has access |
| `Port 3001 in use` | `lsof -i :3001` then `kill -9 <PID>` |
| `ENOENT: no such file` | Check DATA_DIR exists or create it |

---

## 📚 Reference Documents

- **ACTUAL_REST_API_SPEC.md** - Full specification
- **IMPLEMENTATION_GUIDE.md** - Step-by-step guide
- **QUICK_REFERENCE.md** - This file

---

## 🆘 Need Help?

1. Check the specification: `ACTUAL_REST_API_SPEC.md`
2. Follow the guide: `IMPLEMENTATION_GUIDE.md`
3. Use this reference: `QUICK_REFERENCE.md`
4. Check logs: `npm run dev` with `LOG_LEVEL=debug`

---

**Last updated:** 2026-02-21
**Ready to implement:** YES ✅
