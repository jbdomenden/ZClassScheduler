# ZClassScheduler

ZClassScheduler is a web-based academic scheduling platform built with **Kotlin**, **Ktor**, **PostgreSQL**, and a static **HTML/CSS/JavaScript** frontend. It supports managing master data, generating schedule blocks for multiple academic units, reviewing room and teacher usage, and monitoring dashboard conflict metrics.

## What the app does

- Manages reference data for rooms, teachers, courses, curriculums, school hours, and subjects.
- Supports separate scheduling flows for:
  - STI / Tertiary
  - NAMEI
  - SHS
  - JHS
- Provides dashboard endpoints for room utilization, incomplete schedules, live schedules, and conflict summaries.
- Serves a browser-based UI from the Ktor application itself.
- Bootstraps a `SUPER_ADMIN` account on startup for first-time access.

## Tech stack

- **Backend:** Kotlin, Ktor 3, Netty
- **Database:** PostgreSQL with Exposed ORM
- **Authentication:** JWT
- **Frontend:** Static HTML, CSS, and vanilla JavaScript served from the application resources
- **Build tool:** Gradle Kotlin DSL
- **Java version:** 17+

## Project structure

```text
src/main/kotlin/zeroday/
├── Application.kt              # Ktor entry point
├── Controller/                 # auth, services, audit, security helpers
├── Models/                     # DTOs, database setup, tables, bootstrap logic
├── Queries/                    # repository / data access layer
└── Routes/                     # HTTP route modules

src/main/resources/
├── application.yaml            # runtime configuration
└── static/ZClassScheduler/     # frontend assets (HTML/CSS/JS/images)
```

Helpful companion docs in this repo:

- `ProjectDocumentation.md` – architecture and feature overview
- `ProjectEndPoints.md` – route inventory and endpoint notes

## Requirements

Before running locally, make sure you have:

- **Java 17 or newer**
- **PostgreSQL**
- Environment variables for database connectivity

Required environment variables:

- `JDBC_DATABASE_URL`
- `DB_USER`
- `DB_PASSWORD`
- `PORT` (optional; defaults to `8080`)

Example:

```bash
export JDBC_DATABASE_URL='jdbc:postgresql://localhost:5432/zclassscheduler'
export DB_USER='postgres'
export DB_PASSWORD='postgres'
export PORT='8080'
```

## Running the project

### Start the app in development

```bash
./gradlew run
```

When the server starts, it listens on:

- `http://localhost:8080` by default
- `http://localhost:$PORT` when `PORT` is provided

### Build the project

```bash
./gradlew build
```

### Run tests

```bash
./gradlew test
```

### Build a fat JAR

```bash
./gradlew buildFatJar
```

### Build a container image

```bash
./gradlew buildImage
```

## Default startup behavior

On application startup, the server:

1. Initializes the database connection.
2. Bootstraps the super admin account if it does not already exist.
3. Installs JSON content negotiation.
4. Configures JWT security.
5. Registers API routes and static asset routes.

## Default login

The application bootstraps this initial account on first run:

- **Email:** `admin@zcs.edu`
- **Password:** `admin123`

Change the password after first login if you plan to use the app beyond local development.

## Main URLs

Once the app is running, these routes are useful:

- `/` → redirects to `/login`
- `/login` → redirects to the hosted login page
- `/ZClassScheduler/html/Login.html` → login UI
- `/ZClassScheduler/html/Dashboard.html` → dashboard UI
- `/health` → simple health check returning `OK`

## Key API areas

### Authentication

- `POST /api/auth/login`
- `GET /api/auth/me`

### Dashboard

- `GET /dashboard/summary`
- `GET /dashboard/rooms`
- `GET /dashboard/rooms/utilization`
- `GET /dashboard/incomplete`
- `GET /dashboard/conflicts`
- `GET /dashboard/live`

### Scheduling

- `/api/scheduler/tertiary/*`
- `/api/scheduler/namei/*`
- `/api/scheduler/shs/*`
- `/api/scheduler/jhs/*`

### Settings / master data

- `/api/settings/rooms`
- `/api/settings/teachers`
- `/api/settings/courses`
- `/api/settings/curriculums`
- `/api/settings/teacher-blocks`

For the detailed endpoint list, see `ProjectEndPoints.md`.

## Frontend pages

The frontend is served from `src/main/resources/static/ZClassScheduler` and includes pages for:

- Login
- Dashboard
- Scheduler views for STI, NAMEI, SHS, and JHS
- Schedule overviews by room, teacher, and section
- Room, teacher, course, curriculum, school hours, audit log, and checker log management

## Deployment notes

- The app is configured to read its port from `PORT`, which is compatible with platforms like Render.
- A `Dockerfile` and `render.yaml` are included for containerized and hosted deployments.

## Related files

- `build.gradle.kts` – dependencies, plugins, and Gradle tasks
- `src/main/resources/application.yaml` – Ktor and database configuration
- `src/main/kotlin/zeroday/Application.kt` – application bootstrapping
- `src/main/kotlin/zeroday/Routes/Routing.kt` – route registration

## Status of the README

This README now reflects the actual application structure instead of the default Ktor project generator template.
