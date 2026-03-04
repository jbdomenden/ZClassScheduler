# Request Flow (Routes → Controller → Queries)

## Example: Create a schedule

1. **Route** receives the request
   - File: `Routes/schedule/ScheduleRoutes.kt`
   - Endpoint: `POST /schedules/all`

2. **Controller/Service** validates and checks conflicts
   - File(s): `Controller/service/ScheduleValidationService.kt`, `Controller/service/ScheduleService.kt`
   - Validates time range
   - Detects conflicts (teacher/room/section)

3. **Queries** persist schedule to DB
   - File: `Queries/ScheduleRepository.kt` (or similar)
   - Uses Exposed tables under `Models/db/tables`

4. **Route** returns HTTP status
   - `201 Created` if inserted
   - `409 Conflict` if conflict detected

## Example: Manage Curriculum

1. **Route** handles curriculum listing/upload
   - File: `Routes/settings/CurriculumManagementRoutes.kt`
   - Base path: `/api/settings/curriculums`

2. **Controller/Service** (if present) coordinates curriculum creation
   - Parses request DTO
   - Calls Queries to create curriculum and subjects

3. **Queries** insert/read curriculum + subject rows

