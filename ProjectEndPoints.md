# ProjectEndPoints.md

This file lists the HTTP endpoints defined in this project (Ktor backend), with a short note on what each endpoint does.

Notes:
- Base static site is served from `src/main/resources/static/ZClassScheduler` at runtime under `/ZClassScheduler/...`.
- JWT auth is installed as `authenticate("auth-jwt")`. Endpoints marked "JWT" require an `Authorization: Bearer <token>` header.
- Bootstrap behavior: on startup, `admin@zcs.edu` is ensured as `SUPER_ADMIN`; teacher profile is upserted/normalized to all departments (`ICT,THM,BM,GE,ME,MT,NA,HS,STAFF`).
- Some route modules exist in source but are not currently registered in `Routing.kt`. These are listed under "Not Mounted".

## Auth

| Method | Path | Auth | What It Does |
|---|---|---|---|
| POST | `/api/auth/login` | No | Login using `{ payload: { email, password, rememberMe } }`, returns `{ token, forcePasswordChange }`. |
| GET | `/api/auth/me` | JWT | Returns the current user identity derived from JWT (`{ userId, role, email }`). |

## Dashboard

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/dashboard/summary` | JWT | KPI summary: active schedules/teachers/rooms (now), schedules today, most common conflict. |
| GET | `/dashboard/rooms` | JWT | Room overview schedule items for a day. Query: `day` (defaults to today). |
| GET | `/dashboard/incomplete` | JWT | List incomplete schedule rows (missing day/time/teacher/room). Query: `limit` (default 200). |
| GET | `/dashboard/live` | JWT | Live schedules feed (used by dashboard live widgets). |
| GET | `/dashboard/conflicts` | JWT | Computed schedule conflicts across all days. Query: `limit` (default 500). |
| GET | `/dashboard/rooms/utilization` | JWT | Room utilization per day using "continuous from first start to last end" definition. Query: `day` (defaults to today). |
| GET | `/dashboard/teachers/today` | JWT | Teacher dashboard list for today. |
| GET | `/dashboard/teachers/now` | JWT | Teachers currently active now. |
| GET | `/dashboard/teachers/test` | JWT | Test endpoint (returns static OK payload). |

## Schedulers

These endpoints manage scheduler "blocks" and per-subject schedule rows.

Common DTO patterns:
- Duplicate row: `POST /rows` body `{ baseRowId: "<uuid>" }`
- Update row: `PUT /rows/{id}` body `{ day, startTime, endTime, roomId, teacherId }` (nullable fields allowed)

### Tertiary (STI)

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/api/scheduler/tertiary/blocks` | No | List blocks and rows for tertiary scheduler. |
| POST | `/api/scheduler/tertiary/blocks` | No | Create a block using `{ courseCode, curriculumId, year, term }`. |
| DELETE | `/api/scheduler/tertiary/blocks/{sectionCode}` | No | Delete a whole block by section code. |
| POST | `/api/scheduler/tertiary/rows` | No | Duplicate an existing schedule row. |
| DELETE | `/api/scheduler/tertiary/rows/{id}` | No | Delete a duplicated row (only duplicate rows allowed). |
| PUT | `/api/scheduler/tertiary/rows/{id}` | No | Update schedule row fields (day/time/room/teacher). |

### SHS

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/api/scheduler/shs/blocks` | No | List SHS blocks and rows. |
| POST | `/api/scheduler/shs/blocks` | No | Create SHS block using `{ courseCode, curriculumId, grade, term }`. |
| DELETE | `/api/scheduler/shs/blocks/{sectionCode}` | No | Delete a whole SHS block. |
| POST | `/api/scheduler/shs/rows` | No | Duplicate an existing SHS schedule row. |
| DELETE | `/api/scheduler/shs/rows/{id}` | No | Delete a duplicated row (only duplicate rows allowed). |
| PUT | `/api/scheduler/shs/rows/{id}` | No | Update SHS schedule row fields. |

### NAMEI

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/api/scheduler/namei/blocks` | No | List NAMEI blocks and rows. |
| POST | `/api/scheduler/namei/blocks` | No | Create NAMEI block using `{ courseCode, curriculumId, year, term }`. |
| DELETE | `/api/scheduler/namei/blocks/{sectionCode}` | No | Delete a whole NAMEI block. |
| POST | `/api/scheduler/namei/rows` | No | Duplicate an existing NAMEI schedule row. |
| DELETE | `/api/scheduler/namei/rows/{id}` | No | Delete a duplicated row (only duplicate rows allowed). |
| PUT | `/api/scheduler/namei/rows/{id}` | No | Update NAMEI schedule row fields. |

### JHS

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/api/scheduler/jhs/blocks` | No | List JHS blocks and rows (sections are rendered like `G7-<name>`). |
| POST | `/api/scheduler/jhs/blocks` | No | Create JHS block using `{ curriculumId, grade, sectionName }`. |
| DELETE | `/api/scheduler/jhs/blocks/{section}` | No | Delete a whole JHS block by rendered section label. |
| POST | `/api/scheduler/jhs/rows` | No | Duplicate an existing JHS schedule row. |
| DELETE | `/api/scheduler/jhs/rows/{id}` | No | Delete a duplicated row (only duplicate rows allowed). |
| PUT | `/api/scheduler/jhs/rows/{id}` | No | Update JHS schedule row fields. |

## Settings (Legacy + Management)

There are two "namespaces" in the project:
- Legacy endpoints under `/settings/...` (mostly JWT protected).
- Management endpoints under `/api/settings/...` used by the current frontend pages (some are not protected in code).

### Courses

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/settings/courses` | JWT | List courses. |
| POST | `/settings/courses` | JWT | Create course. |
| PUT | `/settings/courses/{id}` | JWT | Update course. |
| DELETE | `/settings/courses/{id}` | JWT | Deactivate course. |
| GET | `/api/settings/courses` | No | List courses (used by Manage Course UI). |
| POST | `/api/settings/courses` | No | Create course (validates uniqueness). |
| PUT | `/api/settings/courses/{id}` | No | Update course (validates uniqueness). |
| PUT | `/api/settings/courses/{id}/status` | No | Toggle active status only. |
| DELETE | `/api/settings/courses/{id}` | No | Deactivate course. |

### Curriculums

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/settings/curriculum/{courseCode}` | JWT | List curriculums by course. |
| POST | `/settings/curriculum` | JWT | Create curriculum (no subjects). |
| DELETE | `/settings/curriculum/{id}` | JWT | Deactivate curriculum. |
| GET | `/api/settings/curriculums` | No | List curriculums (query: `course` optional). |
| POST | `/api/settings/curriculums` | No | Create curriculum (no subjects). |
| POST | `/api/settings/curriculums/upload` | No | Create curriculum and subjects (frontend parses PDF then posts). |
| PUT | `/api/settings/curriculums/{id}/status` | No | Toggle active status. |
| GET | `/api/settings/curriculums/{id}/subjects` | No | List subjects for a curriculum. |
| DELETE | `/api/settings/curriculums/{id}` | No | Hard delete curriculum. |

### Subjects

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/settings/subjects?course=...&yearTerm=...&curriculum=...` | JWT | List subjects filtered by course/yearTerm (curriculum optional). |
| POST | `/settings/subjects` | JWT | Create subject. |
| DELETE | `/settings/subjects/{id}` | JWT | Deactivate subject. |

### Rooms

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/rooms/active` | JWT | List rooms currently active now (today/now). |
| GET | `/rooms/free` | JWT | List free rooms right now (today/now). |
| GET | `/api/settings/rooms` | No | List rooms (used by schedulers + Manage Room UI). |
| POST | `/api/settings/rooms` | No | Create room. |
| PUT | `/api/settings/rooms/{id}` | No | Update room. |
| DELETE | `/api/settings/rooms/{id}` | No | Deactivate room. |

### Teachers

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/teachers/free/now` | No | List free teachers right now. |
| GET | `/api/settings/teachers` | No | List teachers (used by schedulers + Manage Teacher UI). |
| POST | `/api/settings/teachers` | No | Create teacher + login credentials. |
| PUT | `/api/settings/teachers/{id}` | No | Update teacher + login credentials. |
| DELETE | `/api/settings/teachers/{id}` | No | Deactivate teacher. |

### Teacher Blocks (Admin Time / Break)

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/api/settings/teacher-blocks?teacherId=...` | JWT | List time blocks for a teacher (ADMIN/BREAK). |
| POST | `/api/settings/teacher-blocks` | JWT | Create a teacher block using `{ teacherId, type, dayOfWeek, timeStart, timeEnd }`. |
| DELETE | `/api/settings/teacher-blocks/{id}` | JWT | Delete a teacher block by id. |

## Static + Misc

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/ZCS` | No | Redirect to login page (`/ZClassScheduler/html/Login.html`). |
| GET | `/ZCSDash` | No | Redirect to dashboard page (`/ZClassScheduler/html/Dashboard.html`). |
| GET | `/health` | No | Health check returns `"OK"`. |
| GET | `/ZClassScheduler/*` | No | Serves static HTML/CSS/JS assets from `src/main/resources/static/ZClassScheduler`. |

## Not Mounted (Defined In Code But Not Registered)

These endpoints are present in source but are not currently called from `configureRouting()`:

| Method | Path | Auth | What It Does |
|---|---|---|---|
| GET | `/dashboard/active` | JWT | Returns active rooms/teachers/sections via `ActiveScheduleService`. Defined in `ActiveStatusRoutes.kt` but not registered. |
| POST | `/settings/room-blocks` | JWT | Create a room block (blocked schedule time). Defined in `roomBlockRoutes()` but not registered. |
