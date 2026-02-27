# Media Tracker - Microservices System Documentation

## 1. Project Overview
Media Tracker is a distributed, event-driven microservices application designed to run on Kubernetes. It enables users to track their media consumption (Movies, TV Series, Manga, Books) and receive real-time notifications about new releases.

### Key Architectural Patterns
*   **Microservices Architecture:** Decomposed into business capabilities (Media, User, Dashboard, Notification).
*   **Event-Driven (Async Communication):** Uses Kafka with **Protocol Buffers** for high-performance, strictly-typed messaging.
*   **Database per Service:** 
    *   **Media Service:** MongoDB (Document Store for flexible media metadata).
    *   **User Service:** PostgreSQL (Relational DB for user accounts and libraries).
*   **Aggregator Pattern:** `dashboard-service` aggregates data from `media-service` and `user-service`.
*   **Backend for Frontend (BFF):** Services render their own UI fragments (HTML) but also expose APIs.
*   **Caching:** Redis is used for API response caching and distributed session management.
*   **Service Discovery:** Native Kubernetes DNS.

---

## 2. Directory Structure
```
project/
├── k8s/                       # Kubernetes Manifests
│   ├── apps/                  # Deployments/Services for microservices
│   └── infra/                 # Infrastructure (DBs, Kafka, Redis, Ingress)
├── scripts/                   # CI/CD and Utility Scripts
│   └── deploy_do.sh           # Main deployment script for DigitalOcean
├── services/                  # Source Code
│   ├── dashboard-service/     # Python/FastAPI
│   ├── media-service/         # Python/FastAPI
│   ├── notification-service/  # Python/FastAPI
│   └── user-service/          # Node.js/Express
└── shared/
    └── protos/                # Shared Protocol Buffer Definitions
        └── events.proto       # Kafka Message Schemas
```

---

## 3. Infrastructure Components

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Cluster** | Kubernetes | 1.28+ | Container Orchestration. |
| **Ingress** | NGINX | 1.8.2 | Layer 7 Load Balancing & SSL Termination. |
| **Messaging** | Apache Kafka | 3.6.0 | Strimzi Operator. Asynchronous Event Bus. |
| **Database** | MongoDB | 6.0 | Replica Set. Stores Media Metadata. |
| **Database** | PostgreSQL | 15.0 | Relational Data (Users, Libraries). |
| **Cache** | Redis | 7.0 | Caching & Session Storage. |

---

## 4. Database Schemas

### A. Media Service (MongoDB)
**Collection:** `media`
```json
{
  "_id": "ObjectId(...)",
  "title": "String",
  "media_type": "String (Movie, Series, Manga, etc.)",
  "description": "String (Optional)",
  "created_at": "ISODate(...)",
  "seasons": [
    {
      "season_number": "Integer",
      "episodes": [
        {
          "episode_number": "Integer",
          "title": "String (Optional)",
          "air_date": "String (Optional)"
        }
      ]
    }
  ]
}
```

### B. User Service (PostgreSQL)
**Table:** `users`
| Column | Type | Constraints |
| :--- | :--- | :--- |
| `id` | SERIAL | PK |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL |
| `password` | VARCHAR(255) | NOT NULL (Hashed) |
| `email` | VARCHAR(255) | |
| `bio` | TEXT | |
| `created_at` | TIMESTAMP | DEFAULT NOW() |

**Table:** `user_library`
| Column | Type | Constraints |
| :--- | :--- | :--- |
| `id` | SERIAL | PK |
| `user_id` | INTEGER | FK -> users(id) |
| `media_id` | VARCHAR(50) | NOT NULL (Ref to MongoDB ID) |
| `media_title` | VARCHAR(255) | |
| `media_type` | VARCHAR(50) | |
| `status` | VARCHAR(50) | 'Plan to Watch', 'Watching', 'Completed' |
| `progress` | VARCHAR(50) | Free text progress |
| `current_season` | INTEGER | Default 0 |
| `current_episode` | INTEGER | Default 0 |
| `rating` | INTEGER | 0-10 |
| `review_text` | TEXT | User's personal review |
| `watched_date` | DATE | Date finished/read |
| `is_rewatch` | BOOLEAN | Default FALSE |

**Table:** `friendships`
| Column | Type | Constraints |
| :--- | :--- | :--- |
| `id` | SERIAL | PK |
| `requester_id` | INTEGER | FK -> users(id) |
| `addressee_id` | INTEGER | FK -> users(id) |
| `status` | ENUM | 'pending', 'accepted', 'blocked' |
| `created_at` | TIMESTAMP | DEFAULT NOW() |
| `updated_at` | TIMESTAMP | DEFAULT NOW() |

---

## 5. Event Specifications (Protobuf)

All services communicate changes via the `shared/protos/events.proto` schema.

```protobuf
syntax = "proto3";
package events;

message MediaUpdate {
  string event_type = 1; // "new_release", "media_deleted"
  string media_id = 2;
  string media_title = 3;
  string media_type = 4; 
  string release_title = 5; // e.g., "The Final Episode"
  int32 season = 6;
  int32 episode = 7;
  int32 volume = 8;
  int32 chapter = 9;
  int64 timestamp = 10;
}
```

---

## 6. Detailed Service Documentation

### A. Media Service
*   **Role:** Content Management System (CMS) for media.
*   **Port:** 8000
*   **Dependencies:** MongoDB, Redis, Kafka (Producer).

**Key Endpoints:**
*   `POST /media/{id}/release`: **Trigger.** Simulates a new content release.
    *   *Payload:* `release_title="New Ep", season_number=1, episode_number=5`
    *   *Effect:* Updates DB -> Invalidates Cache -> **Publishes Protobuf Message**.
*   `GET /media`: **Query.** Returns list of media.
    *   *Effect:* Checks Redis `media_list:{query}`. If miss, queries Mongo and caches for 60s.
*   **Ownership:**
    *   Editing (`/media/{id}/edit`) and Deleting (`/media/{id}/delete`) are restricted. Only the user who created the item (`creator` field) can perform these actions.

### B. User Service
*   **Role:** User Identity & Library Tracking.
*   **Port:** 3000
*   **Dependencies:** PostgreSQL, Redis, Kafka (Consumer + Producer).

**Key Workflows:**
*   **Auth:** Login generates a Session ID (UUID), stored in Redis with 24h TTL, returned as `session_id` HttpOnly cookie.
*   **Profile Management:**
    *   Users can change their username via `/profile/edit`.
    *   Triggers a Kafka event (`user_updated`) to synchronize the new name across the system (e.g., updating media ownership).
*   **Social & Friends:**
    *   **Friend Requests:** Case-sensitive username lookup to send requests.
    *   **Public Profiles:** `/u/:username` displays a read-only view of a friend's library (hidden for non-friends).
    *   **Diary:** Users can add reviews, dates, and rewatch status to items.
*   **Event Consumption (`media-updates`):**
    *   On `new_release`: Queries `user_library` for users tracking that media.
    *   For each match, produces a JSON event to `notification-dispatch` topic.
    *   On `media_deleted`: Executes `DELETE FROM user_library WHERE media_id = ...`.

### C. Dashboard Service
*   **Role:** User Interface Aggregator.
*   **Port:** 8000
*   **Dependencies:** Kafka (Consumer).

**Key Workflows:**
*   **Live Feed:** Consumes `media-updates` (Protobuf) and maintains an in-memory `deque` of the last 10 events.
*   **Dashboard Page (`/dashboard`):**
    *   Async HTTP Call -> `user-service/api/data` (User Stats).
    *   Async HTTP Call -> `media-service/api/recent` (New Additions).
    *   Renders HTML with data + Live Feed.

### D. Notification Service
*   **Role:** Output Adapter.
*   **Port:** 8000
*   **Dependencies:** Kafka (Consumer).

**Key Workflows:**
*   **Consumption:** Listens to `notification-dispatch` (JSON).
*   **Action:** Logs the notification message (Stub for Email/SMS/Push).

---

## 7. Deployment Guide

### Prerequisites
*   Kubernetes Cluster
*   `kubectl` configured
*   `docker` installed
*   DigitalOcean Container Registry (configured in script)

### Deploy Script (`scripts/deploy_do.sh`)
This script automates the full CI/CD lifecycle:
1.  **Version Bump:** Increments `VERSION` file (Patch/Minor).
2.  **Infra Deploy:** Applies `k8s/infra/` (DBs, Kafka). Waits for DBs to be ready.
3.  **Build Loop:** For each service:
    *   Copies `shared/protos` into the service context.
    *   `docker build` -> `docker push` to Registry.
    *   Updates Kubernetes Deployment image (`kubectl set image`).
    *   Cleans up `shared/protos`.
4.  **Rollout:** Waits for `kubectl rollout status` for zero-downtime updates.

---

## 8. Troubleshooting

*   **"Simulate Release" doesn't appear on Dashboard?**
    *   Check `kubectl logs -l app=dashboard-service`. ensure it is connected to Kafka.
    *   Check `kubectl logs -l app=media-service` to ensure Producer sent the message.
*   **Login fails?**
    *   Check Redis connection in `user-service`. Ensure Cookies are being set (Browser DevTools).
*   **Database connection errors?**
    *   Ensure `k8s/infra` manifests are applied and pods (`mongo-0`, `postgres-0`) are `Running`.
    *   Check internal DNS resolution: `kubectl run -it --rm --image=busybox:1.28 dns-test -- nslookup mongo-0.mongo.database.svc.cluster.local`.
