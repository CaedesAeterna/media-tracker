# Admin Panel Implementation Plan

**Goal:** Create a secure Admin Panel within the `dashboard-service` to manage users and view system stats, leveraging the existing microservices architecture.

## Phase 1: Database & User Model (User Service)
*Why: We need a way to distinguish admins from regular users.*

1.  **Schema Update:**
    *   Modify `services/user-service/models/user.js` to add an `is_admin` (BOOLEAN, default `FALSE`) column to the `users` table.
    *   Update the `createTable` function to apply this change to the PostgreSQL database (idempotent migration).
2.  **Model Update:**
    *   Update `findUserByUsername` and `createUser` to handle the `is_admin` field.

## Phase 2: Authentication & Session Management (User Service)
*Why: The session stored in Redis must carry the user's role so other services can verify it without querying the database every time.*

1.  **Session Logic Update (`services/user-service/routes/auth.js`):**
    *   In the `/login` route, after verifying the password, include `is_admin: user.is_admin` in the `sessionData` object before saving it to Redis.
2.  **API Security:**
    *   Ensure any new Admin APIs in `user-service` verify this `is_admin` flag from the Redis session.

## Phase 3: Admin API Endpoints (User Service)
*Why: The Admin Panel (frontend) needs APIs to fetch user lists and perform actions like banning.*

1.  **New Routes (`services/user-service/routes/api.js`):**
    *   `GET /api/users`: Returns a list of all users (ID, username, email, admin status). Protected by admin check.
    *   `POST /api/users/:id/ban` (or `DELETE`): Allows an admin to ban/delete a user.

## Phase 4: Dashboard Service Evolution (The Admin Panel)
*Why: The `dashboard-service` is the natural place for this UI. It will act as a "Backend-for-Frontend" (BFF).*

1.  **Authentication Module:**
    *   Create `services/dashboard-service/app/auth.py` (adapting from `media-service`).
    *   Implement `get_current_admin_user` dependency that:
        *   Reads `session_id` cookie.
        *   Fetches session JSON from Redis.
        *   **Crucially:** Verifies `data['is_admin'] == True`. Raises 403 Forbidden if not.
2.  **Admin Router (`services/dashboard-service/app/routers/admin.py`):**
    *   `GET /admin`: The main dashboard stats page.
    *   `GET /admin/users`: Renders the user management table.
    *   `POST /admin/users/{id}/ban`: Proxies the request to `user-service`.
3.  **Data Aggregation:**
    *   Use `httpx` within `dashboard-service` to fetch user lists from `user-service` using the internal K8s DNS (e.g., `http://user-service.app.svc.cluster.local:80`).

## Phase 5: Frontend Implementation (Dashboard Service)
*Why: Admins need a visual interface.*

1.  **Templates (`services/dashboard-service/app/templates/`):**
    *   `admin_layout.html`: specific sidebar/navigation for admins.
    *   `admin_dashboard.html`: Stats overview (e.g., "Total Users", "Active Streams").
    *   `admin_users.html`: Table listing users with "Ban" buttons.

## Phase 6: Integration & Verification

1.  **Manual Test:** Manually update a user in Postgres to `is_admin = true`.
2.  **Log in:** Verify the session in Redis contains `is_admin: true`.
3.  **Access:** Verify access to `/admin` works and `/admin` is blocked for non-admins.
