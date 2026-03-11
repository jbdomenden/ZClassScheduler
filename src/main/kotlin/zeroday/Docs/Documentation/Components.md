# Component Guide

## Controller
- `Controller/auth/*`
  - JWT configuration
  - `/api/auth/login` route
  - Authentication installation (`configureSecurity`)

- `Controller/service/*`
  - Scheduling rules, conflict detection, availability checks
  - Shared logic used by multiple endpoints

## Models
- `Models/db/*`
  - `DatabaseFactory` initializes Exposed and DB connection
  - `bootstrap/*` seeds and reconciles initial data (e.g., enforces `admin@zcs.edu` as `SUPER_ADMIN` and syncs teacher department scope).
  - `tables/*` defines DB tables

- `Models/dto/*`
  - DTOs for request/response payloads used by routes

## Queries
Repositories that read/write data using Exposed.
Examples:
- User repository
- Curriculum repository
- Teacher repository
- Room repository

## Routes
All Ktor routing is grouped by feature:
- `Routes/settings/*` for management modules
- `Routes/schedule/*` for schedule creation and live schedule
- `Routes/dashboard/*` for dashboard endpoints

