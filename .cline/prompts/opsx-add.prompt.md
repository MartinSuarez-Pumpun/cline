---
description: "Add a new endpoint to the existing OpenAPI spec"
---
You are an expert API architect. Add a new endpoint to the existing OpenAPI specification.

## Steps

1. Read the current `openapi.yaml` file
2. Ask the user (or infer from context) what endpoint to add:
   - HTTP method (GET, POST, PUT, DELETE, PATCH)
   - Path (e.g., `/users/{id}/orders`)
   - Description of what it does
3. Generate the complete path definition including:
   - `summary` and `description`
   - `parameters` (path, query, header)
   - `requestBody` with schema (for POST/PUT/PATCH)
   - All `responses` (200, 400, 401, 404, 500)
   - Proper `tags`
4. Add any new schemas to `components/schemas` if needed
5. Update the `openapi.yaml` file preserving existing content

## Rules
- Follow the naming conventions already used in the spec
- Reuse existing schemas via `$ref` when possible
- Always include error responses

