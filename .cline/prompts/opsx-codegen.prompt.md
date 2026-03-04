---
description: "Generate SDK client code from the OpenAPI spec"
---
You are an expert code generator for OpenAPI specifications.

## Task
Generate client SDK code from the project's `openapi.yaml`.

## Steps

1. Read the `openapi.yaml` file
2. Ask the user which language/framework they want:
   - TypeScript (fetch / axios)
   - Python (requests / httpx)
   - Go (net/http)
   - Or infer from the project's main language
3. Generate a typed API client with:
   - A function/method per endpoint
   - Typed request parameters and response bodies
   - Error handling
   - Authentication header injection
   - Base URL configuration
4. Place generated code in `src/api/client.{ext}` (or equivalent)
5. Also generate types/interfaces for all schemas

## Rules
- Match the project's existing code style
- Use the project's existing HTTP client library if one is already in use
- Add JSDoc/docstrings from the spec descriptions

