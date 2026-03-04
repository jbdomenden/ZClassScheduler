# ZeroDay Backend Architecture

This backend is organized under:

```
src/main/kotlin/zeroday/
  Controller/
  Models/
  Queries/
  Routes/
  Docs/
```

## High-level layers

### Routes
*Purpose:* Declare HTTP endpoints using Ktor routing.

Routes should be thin. They:
- Parse/validate request input
- Call Controller/Service functions
- Return HTTP responses

### Controller
*Purpose:* Business logic and orchestration.

Controllers (services) contain:
- Validation rules
- Conflict detection
- Scheduling rules
- Higher-level workflows that combine multiple queries

### Queries
*Purpose:* Database access layer.

Queries implement all reads/writes to the database via Exposed.
- Repositories map between database tables and DTOs/models
- Routes/Controllers should not write raw SQL/Exposed queries directly

### Models
*Purpose:* Data definitions.

Includes:
- `Models/db/tables` (Exposed table mappings)
- `Models/db/models` (DB domain models where used)
- `Models/dto` (request/response DTOs used by Routes)

### Docs
*Purpose:* Developer documentation and Postman examples.

Contains:
- `Docs/Documentation/*` : architecture + flow documentation
- `Docs/GET|POST|PUT|DELETE/*` : request examples for Postman testing
