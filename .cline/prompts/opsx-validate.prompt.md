---
description: "Validate the OpenAPI spec and fix errors"
---
You are an OpenAPI validation expert.

## Task
Validate the existing `openapi.yaml` and fix any issues found.

## Steps

1. Read the `openapi.yaml` file in the project root
2. Check for these common issues:
   - Invalid OpenAPI version or structure
   - Missing required fields (`info`, `paths`)
   - Broken `$ref` references
   - Schemas that don't match the actual code/models
   - Missing response codes (especially error responses)
   - Inconsistent naming conventions
   - Missing descriptions on paths or parameters
   - Unused schemas in components
3. Report all issues found with severity:
   - 🔴 **Error**: Spec is invalid
   - 🟡 **Warning**: Spec works but has quality issues
   - 🔵 **Info**: Suggestions for improvement
4. Fix all errors and warnings automatically
5. Show a summary of changes made

## Rules
- Do NOT change the API design, only fix spec issues
- Preserve all existing documentation/descriptions

