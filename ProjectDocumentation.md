# ProjectDocumentation.md

## What This Project Is

ZClassScheduler is a web-based class scheduling system.

- Backend: Kotlin + Ktor (Netty), JWT auth, JSON via `kotlinx.serialization`
- Persistence: Exposed ORM tables (Rooms, Teachers, Curriculums, Subjects, Schedules, AuditLogs, etc.)
- Frontend: static HTML/CSS/JS served by Ktor from `src/main/resources/static/ZClassScheduler`

The core workflow is:
1. Create master data (rooms, teachers, courses, curriculums, subjects).
2. Create schedule blocks per department (STI/Tertiary, SHS, NAMEI, JHS).
3. Edit rows inside a block (day, start/end time, room, instructor).
4. View schedules by room/teacher/section and track dashboard KPIs (utilization, incomplete schedules, conflicts).

## How It Runs

Ktor module entry point is [`Application.kt`](/C:/Users/john.domenden/Music/GitHub/ZClassScheduler/src/main/kotlin/zeroday/Application.kt).

- Initializes database and bootstraps a SUPER_ADMIN user (see `SuperAdminBootstrap`).
- Installs JSON ContentNegotiation.
- Installs JWT auth via `configureSecurity()`.
- Registers routes via `configureRouting()`.
- Serves static web UI at `/ZClassScheduler/*`.

Useful URLs:
- `/ZCS` redirects to `/ZClassScheduler/html/Login.html`
- `/ZCSDash` redirects to `/ZClassScheduler/html/Dashboard.html`
- `/health` returns `"OK"`

## Authentication

JWT auth is provided under `/api/auth`.

- Login: `POST /api/auth/login`
- Identity: `GET /api/auth/me` (JWT required, returns `userId/role/email`)

Many dashboard endpoints require JWT (`authenticate("auth-jwt")`).
Some `/api/settings/*` endpoints are currently not wrapped with JWT in routing; treat this as "current behavior", not necessarily a security recommendation.

## Backend Modules (High Level)

### Route Modules

Routes are assembled in [`Routing.kt`](/C:/Users/john.domenden/Music/GitHub/ZClassScheduler/src/main/kotlin/zeroday/Routes/Routing.kt).

Major route groups:
- Auth: `/api/auth/*`
- Dashboard: `/dashboard/*`
- Scheduler APIs:
  - STI/Tertiary: `/api/scheduler/tertiary/*`
  - SHS: `/api/scheduler/shs/*`
  - NAMEI: `/api/scheduler/namei/*`
  - JHS: `/api/scheduler/jhs/*`
- Settings / Master data:
  - Rooms: `/api/settings/rooms`
  - Teachers: `/api/settings/teachers`
  - Courses: `/api/settings/courses`
  - Curriculums: `/api/settings/curriculums`
  - Subjects: `/settings/subjects` (legacy path)

For the full endpoint list, see [`ProjectEndPoints.md`](/C:/Users/john.domenden/Music/GitHub/ZClassScheduler/ProjectEndPoints.md).

### Key Services / Logic

- Scheduling time rules: `ScheduleTimePolicy` and `ScheduleTimePolicy.normalize*` are used to normalize time inputs and enforce consistent grid alignment.
- Conflict detection:
  - At create/update time: `ScheduleValidationService.detectConflict(...)` (used by scheduler services)
  - For dashboard: `DashboardConflictService.scheduleConflicts(...)` computes overlaps across schedules.
- Dashboard room utilization:
  - `RoomUtilizationService.calculate(day)` computes utilization per room based on continuous occupancy between first start and last end, with a Wednesday academic break window (13:00-15:00) treated as occupied if it lies within that span.

## Frontend Modules / Pages

All pages live under `src/main/resources/static/ZClassScheduler/HTML` and are served under `/ZClassScheduler/HTML/<Page>.html`.

Shared UI fragments:
- `GlobalHeader.html` and `GlobalSidebar.html` are injected by `load-global.js`.
- `GlobalSearch.html` provides the reusable search dropdown template.

### Login

- Page: `Login.html`
- JS: `Login.js`
- API: `POST /api/auth/login`
- Stores JWT in `localStorage.token`.

### Dashboard

- Page: `Dashboard.html`
- JS: `Dashboard.js`
- APIs:
  - `/dashboard/summary`
  - `/dashboard/rooms` (room overview grid)
  - `/dashboard/rooms/utilization`
  - `/dashboard/incomplete`
  - `/dashboard/conflicts`
  - `/dashboard/live`

Dashboard widgets:
- Room Overview: time-grid with rooms as columns (filled color when occupied).
- Room Utilization: per-room utilization percent + overall average.
- Incomplete Schedules: grouped by section, lists missing fields.
- Conflicts Detected: computed conflicts list (all days).

### Scheduler Pages (CRUD blocks + rows)

These are the main schedule editors. Each follows the STI-style template: global search header, add schedule button, and STI-like modals and styling.

- STI/Tertiary:
  - Page: `SchedulerSTI.html`
  - JS: `SchedulerSTI.js`
  - API base: `/api/scheduler/tertiary`

- SHS:
  - Page: `SchedulerSHS.html`
  - JS: `SchedulerSHS.js`
  - API base: `/api/scheduler/shs`

- NAMEI:
  - Page: `SchedulerNAMEI.html`
  - JS: `SchedulerNAMEI.js`
  - API base: `/api/scheduler/namei`

- JHS:
  - Page: `SchedulerJHS.html`
  - JS: `SchedulerJHS.js`
  - API base: `/api/scheduler/jhs`

All scheduler pages also load lookups for dropdowns:
- Rooms: `/api/settings/rooms`
- Teachers: `/api/settings/teachers`
- Curriculums (for block creation): `/api/settings/curriculums`

### Schedule Viewer Pages (read-only grids)

These pages are cross-department viewers that aggregate blocks across schedulers.

- All Schedules (table list):
  - Page: `SchedulesOverview.html`
  - JS: `SchedulesOverview.js` (uses schedule list engine)

- Room Schedule:
  - Page: `SchedulesRoom.html`
  - JS: `SchedulesRoom.js`
  - Views:
    - Weekly view: pick a room, see weekly grid
    - Daily view: dashboard-style room overview grid with day selector

- Teacher Schedule:
  - Page: `SchedulesTeacher.html`
  - JS: `SchedulesTeacher.js`

- Section Schedule:
  - Page: `SchedulesSection.html`
  - JS: `SchedulesSection.js`

Grid rendering:
- Weekly grids are rendered by `ScheduleGridEngine.js`.
- Schedule grid styling is centralized in `ScheduleGrid.css` + base styles in `base.css`.

### Master Data CRUD Pages

These pages manage core reference data. They use `/api/settings/*` endpoints.

- Manage Rooms:
  - Page: `ManageRoom.html`
  - JS: `ManageRoom.js`
  - API: `/api/settings/rooms`

- Manage Teachers:
  - Page: `ManageTeacher.html`
  - JS: `ManageTeacher.js`
  - API: `/api/settings/teachers`

- Manage Courses:
  - Page: `ManageCourse.html`
  - JS: `ManageCourse.js`
  - API: `/api/settings/courses`

- Manage Curriculum:
  - Page: `ManageCurriculum.html`
  - JS: `ManageCurriculum.js`
  - API: `/api/settings/curriculums` (+ `/upload` for parsed PDF upload)

## Data Model (Simplified)

The project uses Exposed `Table` definitions under `zeroday/Models/db/tables`.

Important tables:
- `Rooms`: room code/name, floor, capacity, type, active
- `Teachers`: teacher identity + department + login linkage (through repository logic)
- `Curriculums`: per course and department (JHS/SHS/STI/NAMEI)
- `Subjects`: attached to curriculum, code/name/yearTerm
- `Schedules`: individual schedule rows (section, subjectName, day/time, roomId, teacherId, active, duplicate-row flag, etc.)
- `AuditLogs`: used for logging actions/conflicts (also used historically for dashboard conflict list)

## Known Wiring Gaps

These route modules exist in source but are not currently registered in `configureRouting()`:
- `activeStatusRoutes()` (`GET /dashboard/active`)
- `roomBlockRoutes()` (`POST /settings/room-blocks`)

If you want these endpoints live, they must be added to `configureRouting()`.
