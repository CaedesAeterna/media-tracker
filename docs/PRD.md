# Product Requirements Document (PRD) - Media Tracker App

## 1. Introduction
The Media Tracker App is a microservices-based application designed to help users track their consumption of various forms of media, including series, movies, web novels, novels, and physical books. It allows users to manage their libraries, track progress, and organize content.

## 2. Architecture
The application will follow a **microservice architecture** deployed on **Kubernetes**.

### Core Services:
*   **User Service:** Handles authentication (Auth0/OAuth2), user profiles, and preferences.
*   **Media Service:** Manages metadata for all media types (Movies, TV Series, Books, Novels).
*   **Tracker Service:** Records user progress (watched episodes, read chapters/pages).
*   **Search Service:** specialized indexing for fast retrieval of media items.
*   **Frontend (Web/Mobile):** The user interface.

## 3. Functional Requirements

### 3.1. Media Types Supported (Implemented)
The system currently supports and tracks:
*   **Series (TV/Anime):** Tracks by specific Seasons and Episodes numbers.
*   **Movies:** Tracks watched status, rating, and review.
*   **Web Novels:** Tracks by chapter count (via generic progress).
*   **Novels (Light Novels/E-books):** Tracks by volume and chapter (via generic progress).
*   **Books (Physical/General):** Tracks page number/chapter (via generic progress).

### 3.2. Detailed Tracking for Books & Series (Implemented)
*   **Series/Anime:** Fully implemented structured tracking (Season X, Episode Y).
*   **Books:** Currently supports free-text progress (e.g., "Page 50" or "Chapter 3").
*   **Future Goal:** Granular page vs total page tracking for books.

### 3.3. User Library Management (Implemented)
*   **Status:** Users can mark items as *Plan to Watch/Read*, *Watching/Reading*, *Completed*, *On Hold*, or *Dropped*.
*   **Rating & Reviews:** Users can rate items using a **1-10 Dropdown**.
*   **Favorites:** Mark specific items as favorites.
*   **Removal:** Users can remove items from their library via a minimal "X" button (logically deleted/archived in history).
*   **Profile Management:** Users can edit their profile (Email, Bio).
*   **Quick Progress:** "+1" buttons for easy progress tracking (Seasons, Episodes, Chapters).
*   **Duplicate Prevention:** System prevents adding the same item twice, redirecting users to their existing entry.

### 3.4. Search & Discovery (Implemented)
*   Search for media by title, author/director, genre, or tags.
*   Filter by media type and status.
*   **Global Delete:** Users can delete media items from the catalog, which automatically cleans up all user libraries.

### 3.5. Notifications (Implemented)
*   **Welcome Email:** Simulated email notification upon user registration via Kafka (`user-registered`).
*   **New Content Alert:** Targeted alerts (`notification-dispatch`) to users watching/reading a specific item when a new release occurs.
    *   **Series/Anime:** Notifies about new Seasons/Episodes.
    *   **Books/Manga:** Notifies about new Volumes/Chapters.
    *   **Movies:** Notifies about theatrical/digital releases.

### 3.6. Dashboard (Implemented)
*   **Live Feed:** Real-time list of newly released media content (Episodes, Chapters, etc.), updated via Kafka events (`media-updates`).
*   **Aggregated Stats:** View combined statistics from User and Media services.

## 4. Technical Stack (Implemented)
*   **Container Orchestration:** Kubernetes (DigitalOcean K8s).
*   **API Gateway / Ingress:** NGINX.
*   **Databases:** PostgreSQL (User/Auth) and MongoDB (Media Metadata).
*   **Message Broker:** Kafka (Strimzi).
*   **Backend:**
    *   Python (FastAPI) - Media, Notification, Dashboard Services.
    *   Node.js (Express) - User Service.
*   **Frontend:** Server-Side Rendering (SSR) using:
    *   **Jinja2** (for Python/FastAPI services).
    *   **EJS** (for Node.js/Express services).

## 5. Deployment Strategy
*   CI/CD pipelines for automated testing and deployment.
*   Helm charts for managing Kubernetes manifests.
*   Secrets management via Kubernetes Secrets or external Vault.
