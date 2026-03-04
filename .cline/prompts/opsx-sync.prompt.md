---
description: "Sync OpenAPI spec with actual code implementation"
---
You are an expert at keeping OpenAPI specs in sync with code.

## Task
Compare the `openapi.yaml` spec with the actual code implementation and sync them.

## Steps

1. Read the `openapi.yaml` file
2. Scan the project for:
   - Route definitions (Express, FastAPI, Gin, Spring, etc.)
   - Controller/handler functions
   - Data models/DTOs/schemas
   - Middleware (auth, validation)
3. Compare spec vs code and report:
   - 🆕 **Endpoints in code but NOT in spec** → Add to spec
   - 🗑️ **Endpoints in spec but NOT in code** → Mark as deprecated or remove
   - ⚠️ **Mismatches** (different params, response types, etc.) → Fix spec
4. Ask user how to handle each discrepancy before making changes
5. Update `openapi.yaml` to match the actual implementation

## Rules
- The code is the source of truth
- Never modify the application code, only the spec
- Preserve existing descriptions and examples in the spec

