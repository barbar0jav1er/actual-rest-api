# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

REST API wrapper around `@actual-app/api` (Actual Budget) built with Hono on Node.js. Exposes HTTP endpoints so React Native apps (which can't use loot-core directly) can interact with Actual Budget programmatically.

## Commands

```bash
# Development (hot reload)
pnpm dev

# Type checking
pnpm type-check

# Lint
pnpm lint
pnpm lint:fix

# Format
pnpm format
pnpm format:check

# Build
pnpm build

# Start production build
pnpm start

# Local infrastructure (actual-server + keycloak)
pnpm docker:up
pnpm docker:down
pnpm docker:logs
```

## Architecture

### Current State

The repo is in early boilerplate stage. Only `src/index.ts` (Hono app entry point) and `src/config.ts` (env config) exist. The full implementation is planned per the spec docs.

### Planned Source Structure

```
src/
├── index.ts              # Entry point, mounts routes, graceful shutdown
├── config.ts             # All env vars (PORT, HOST, SYNC_SERVER_URL, DATA_DIR, LOG_LEVEL)
├── types/index.ts        # Shared TypeScript interfaces (User, Budget, Account, Transaction)
├── middleware/
│   ├── auth.ts           # Validates x-actual-token header against sync-server, injects user/token into context
│   └── error.ts          # Global error handler
├── routes/
│   ├── user.ts           # GET /api/user
│   ├── budgets.ts        # GET /api/budgets, POST /api/load-budget
│   ├── accounts.ts       # GET /api/accounts?syncId=...
│   └── transactions.ts   # POST /api/transactions
└── services/
    ├── auth.ts           # validateToken() - calls sync-server /account/validate
    └── actual.ts         # Wrapper for @actual-app/api (init, loadBudget, getAccounts, etc.)
```

### Key Architectural Patterns

**`@actual-app/api` is a singleton:** `init()` must be called exactly once. `loadBudget()` is expensive (downloads data). The service layer caches which budget is currently loaded (`LoadedBudgetCache`) and skips re-loading if same `syncId` + `userId`. Call `shutdown()` on SIGTERM.

**Authentication flow:**
1. Client sends `x-actual-token` header with every request
2. Auth middleware calls `GET {SYNC_SERVER_URL}/account/validate` with that token
3. Sync-server returns user info (userId, displayName, permission, loginMethod)
4. User is injected into Hono context via `c.set("user", user)` and `c.set("token", token)`
5. `/health` is the only public route (no auth required)

**Budget loading pattern:** Most endpoints that need budget data (accounts, transactions) accept a `syncId` query param or body field. They call `loadUserBudget(token, userId, syncId)` which handles init + download + cache transparently.

**Amounts convention:** Negative = expense, positive = income (decimal format, e.g., `-50.00`).

### Local Development Infrastructure

`docker-compose.yml` spins up:
- **actual-server** on port `5006` — the Actual Budget sync server (configured with OpenID)
- **keycloak** on port `8080` — OpenID provider for local auth testing

Keycloak realm config is in `docker/keycloak/realm.json`. actual-server data persists in `docker/actual/data/`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | API server port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Environment |
| `SYNC_SERVER_URL` | `http://localhost:5006` | Actual sync-server URL |
| `DATA_DIR` | `./actual-data` | Local storage for budget data |
| `LOG_LEVEL` | `info` | Logging level |

### Tooling

- **Linter:** oxlint (configured in `.oxlintrc.json`)
- **Formatter:** oxfmt (configured in `.oxfmtrc.json`)
- **TypeScript:** strict mode, ES2022, `moduleResolution: bundler`
- **Package manager:** pnpm (monorepo workspace config via `pnpm-workspace.yaml`)

### Reference Documents

All docs live in `docs/`:

- `docs/ACTUAL_REST_API_SPEC.md` — Full API specification, data models, endpoint contracts
- `docs/IMPLEMENTATION_GUIDE.md` — Step-by-step implementation guide with full code samples for all planned files
- `docs/QUICK_REFERENCE.md` — API endpoint cheat sheet and curl examples
- `docs/ACTUAL_SYSTEM_INTERNALS.md` — Actual Budget internals documentation
