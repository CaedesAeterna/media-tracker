# Implementation Plan - Media Tracker App (COMPLETED)

This plan outlines the steps to build and deploy the microservices-based Media Tracker App on Kubernetes.

**Status:** ✅ All Phases Completed.

## Phase 1: Infrastructure & Foundation (✅ Done)

### 1.1 Kubernetes Namespaces
*   ✅ Create distinct namespaces for organization: `app`, `database`, `kafka`.

### 1.2 Message Broker (Kafka)
*   ✅ **Goal:** Deploy a robust Kafka cluster using Strimzi (KRaft mode).
*   ✅ **Action:** Apply `kafka-cluster.yaml` to the `kafka` namespace.
*   ✅ **Verification:** RBAC permissions fixed, Cluster is Ready.

### 1.3 Databases
*   ✅ **PostgreSQL (Relational):** Deployed as StatefulSet in `database` namespace for User Service.
*   ✅ **MongoDB (NoSQL):** Deployed as StatefulSet in `database` namespace for Media Service.
*   ✅ **Redis (Caching):** Deployed in `database` namespace for Media Service caching.

## Phase 2: Backend Services Implementation (✅ Done)

### 2.1 User & Tracker Service (Node.js/Express)
*   ✅ **Tech:** Node.js, Express, EJS, PostgreSQL.
*   ✅ **Features:**
    *   User Authentication (Login/Register/Logout).
    *   **Session Management:** Implemented robust Redis-backed session management using `sessionAuth` middleware for scalable, multi-device authentication. This includes generation, storage (Redis), validation, and cookie handling.
    *   **Kubernetes Environment Variable Handling:** Ensured correct precedence of Kubernetes-provided environment variables by removing `dotenv` override conflicts, crucial for Redis connectivity.
    *   **Module Import Compatibility:** Addressed `ERR_REQUIRE_ESM` for `uuid` module with dynamic import.
    *   **User Library:** Track media, update status (Plan to Watch, etc.), progress, and rating.
    *   **User Profile:** Dashboard with consumption stats and breakdowns.
    *   **Activity History:** Global and item-level history tracking.
    *   **API Endpoint:** `/api/data` for consumption by aggregator services.
    *   **Frontend:** Bootstrap-styled EJS templates with client-side filtering for Library.
*   ✅ **Kafka Integration:** Produces `user-registered` events.

### 2.2 Media & Search Service (Python/FastAPI)
*   ✅ **Tech:** Python, FastAPI, Jinja2, MongoDB, Redis (client).
*   ✅ **Features:**
    *   **Authentication:** Implemented robust session-based authentication for protected routes (create, update, delete media). This uses a `get_current_user` dependency to validate user sessions against the User Service's Redis store.
    *   **Unauthorized Access Handling:** For unauthenticated HTML requests to protected routes, a user-friendly "Not Authorized" popup (HTML response) is displayed instead of a redirect or raw JSON error.
    *   CRUD for Media Items (Movies, Series, Anime, Manga, Novels, Books).
    *   **Search:** Regex-based title search (server-side and client-side filtering).
    *   **Caching:** Redis caching for media listings.
    *   **API Endpoint:** `/api/recent` for consumption by aggregator services.
    *   **Frontend:** Bootstrap-styled Jinja2 templates with client-side filtering for Media List.
*   ✅ **Kafka Integration:** Consumes `user-registered` events (Skeleton implemented).

### 2.3 Dashboard Aggregator Service (Python/FastAPI)
*   ✅ **Tech:** Python, FastAPI, Jinja2, httpx.
*   ✅ **Features:**
    *   Aggregates data from User Service (stats) and Media Service (recent items).
    *   **Circuit Breaker:** Basic resilience for service calls (timeout and fallback).
    *   **Frontend:** Bootstrap-styled Jinja2 template for a unified dashboard.

### 2.4 Notification Service (Python/FastAPI)
*   ✅ **Tech:** Python, FastAPI, aiokafka.
*   ✅ **Features:**
    *   **Event Driven:** Listens to `user-registered` events.
    *   **Notification:** Simulates sending a welcome email (logging).
    *   **Fan-out:** Demonstrates multiple consumers (Media & Notification services) for the same event.
*   ✅ **Kafka Integration:** Consumes `user-registered` events.

## Phase 3: Deployment & Networking (✅ Done)

### 3.1 Containerization
*   ✅ Dockerfiles created for all services.
*   ✅ Images built and loaded into Minikube.
*   ✅ Semantic Versioning implemented (Current: `1.1.42`).

### 3.2 Kubernetes Deployment Manifests
*   ✅ Deployments and Services created in `k8s/apps/`.
*   ✅ Environment variables configured for DB and Kafka connections.

### 3.3 Ingress Configuration (NGINX)
*   ✅ NGINX Ingress Controller configured.
*   ✅ **Routing Rules:**
    *   `/auth`, `/library`, `/profile`, `/api` -> **User Service**.
    *   `/media`, `/` -> **Media Service**.
    *   `/dashboard` -> **Dashboard Service**.

## Phase 4: Development Workflow (Iterative) (✅ Done)

1.  ✅ **Step 1:** Deploy Databases & Kafka.
2.  ✅ **Step 2:** Scaffold Node.js Service (Express) + Connect to Postgres.
3.  ✅ **Step 3:** Scaffold Python Service (FastAPI) + Connect to Mongo.
4.  ✅ **Step 4:** Implement Basic UI (EJS/Jinja2).
5.  ✅ **Step 5:** Implement Kafka Producer/Consumer logic.
6.  ✅ **Step 6:** Finalize Ingress and test end-to-end flow.
7.  ✅ **Refactoring:** Project structure organized into `services/`, `k8s/`, `scripts/`.
8.  ✅ **Automation:** Deployment scripts created with smart version bumping and dynamic service detection.
9.  ✅ **UI/UX:** Bootstrap 5 integration, client-side filtering.
10. ✅ **Feature Expansion:** Added Search, Profile Stats, extended Media Types, History, Aggregator Service, Caching.

## Phase 5: Advanced Tracking & Polish (✅ Done)

1.  ✅ **Structured Tracking:** Updated Media Service to support `seasons` and `episodes` structure.
2.  ✅ **Database Migration:** Updated User Service (Postgres) to track `current_season` and `current_episode` (v1.1.12).
3.  ✅ **UI Enhancements:**
    *   **Media Service:** Implemented "Friendly Series Builder" UI for easy addition of nested seasons/episodes (v1.1.13).
    *   **User Service:** Smart Season/Episode inputs in User Library.
    *   **User Service:** "Remove" button evolution -> From text -> To column -> To minimal "X" button (v1.1.17).
4.  ✅ **Logic Improvements:**
    *   Implemented Duplicate Check (Prevent adding same item twice - redirects to library).
    *   Implemented Safe Delete (Removes from library, logs to history).
    *   Fixed Authorization bugs (Cookie check fallback).

## Phase 6: Advanced Event Driven Architecture (✅ Done)

1.  ✅ **Pub/Sub Fan-Out:**
    *   Implemented `media-updates` topic for "New Episode" releases.
    *   Configured **Fan-Out** where one event triggers multiple services simultaneously.
2.  ✅ **Complex Chains:**
    *   **Chain:** Media Service (Producer) -> User Service (Consumer/Processor) -> Notification Service (Consumer).
    *   User Service now acts as both Consumer and Producer (Intermediate Node).
3.  ✅ **Dashboard Live Feed:**
    *   Updated `dashboard-service` to consume `media-updates` directly using `aiokafka`.
    *   Implemented in-memory "Live Feed" on the Dashboard UI.
4.  ✅ **Notification Alerts:**
    *   Expanded `notification-service` to handle targeted alerts (`notification-dispatch`).

## Phase 7: Profile & Cleanup (✅ Done)

1.  ✅ **Edit Profile:**
    *   Updated `users` table schema (Email, Bio).
    *   Implemented Profile Edit UI and Backend logic.
2.  ✅ **Global Delete:**
    *   Implemented `DELETE` flow in Media Service.
    *   Added Kafka `media_deleted` event to clean up User Libraries automatically.
3.  ✅ **Bug Fixes:**
    *   Fixed "Empty Title" bug in Library.
    *   Fixed `datetime` serialization error in Redis caching.
    *   Fixed `ObjectId` error handling.

## Phase 8: UX Refinements (✅ Done)

1.  ✅ **Quick Increment:**
    *   Added "+1" buttons to User Library UI for quick progress updates.
    *   Implemented backend logic to auto-increment Seasons, Episodes, and Regex-match Chapters.
3.  ✅ **Generic Event System:**
    *   Refactored `media-updates` Kafka topic to support generic "New Release" events.
    *   Updated Media Service to trigger releases for Movies (Premiere), Books (Volumes/Chapters), and Series (Seasons/Episodes).
    *   Updated User Service and Dashboard Service to consume and display these varied formats correctly.
## Phase 9: Stability & UX Polish (✅ Done)

1.  ✅ **Resilience:**
    *   Implemented robust **Kafka Connection Retry** logic (Exponential Backoff) in all services to handle startup race conditions (e.g., after laptop restart).
    *   Enhanced Dashboard error logging and timeouts.
2.  ✅ **UX Improvements:**
    *   Replaced text-based Rating input with a user-friendly **Dropdown (1-10)** in My Library.
    *   Fixed "Simulate Release" behavior to refresh the current page instead of opening new tabs.
3.  ✅ **Bug Fixes:**
    *   **Dashboard Stats:** Fixed "Service returned 302" error by removing authentication middleware from internal `/api` routes.
    *   **Cache Invalidation:** Fixed a bug where new media didn't appear immediately by correctly awaiting the Redis delete command.

## Next Steps / Future Work

*   **Recommendation Engine:** Suggest media based on user history (Python/Redis).
*   **Advanced Notifications:** Email users when new episodes of tracked series are released.
*   **Error Handling:** More robust error pages and alerts.
*   **Testing:** Unit and Integration tests for all services.