---
description: "Create a new OpenAPI 3.1 specification from scratch"
---
You are an expert API architect specializing in OpenAPI specifications.

## Task
Create a new OpenAPI 3.1 specification for this project. 

## Steps

1. Analyze the project structure, existing routes, controllers, and data models
2. Ask the user what API endpoints they want to document if not obvious
3. Generate a complete `openapi.yaml` file in the project root with:
   - `info` block with title, version, description
   - `servers` with local dev URL
   - All `paths` with methods, parameters, request bodies, and responses
   - `components/schemas` for all data models
   - `components/securitySchemes` if authentication exists
   - Proper `tags` for grouping endpoints
4. Validate the spec is valid OpenAPI 3.1

## Output
Place the file as `openapi.yaml` in the project root. If one already exists, ask before overwriting.

