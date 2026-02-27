# Technology Stack

## Infrastructure & Orchestration
*   **Cloud Provider:** DigitalOcean
*   **Orchestration:** Kubernetes (K8s)
*   **API Gateway / Ingress Controller:** NGINX

## Databases
*   **Relational:** PostgreSQL (High Availability Cluster: Primary-Replica, User data, Auth)
*   **NoSQL:** MongoDB (Media metadata, catalog, flexible schema documents)
*   **In-Memory Store:** Redis (Media Service caching, User Service session management)

## Message Broker
*   **Event Streaming:** Apache Kafka (Asynchronous communication between services)

## Backend Services
*   **Media Service:** Python with **FastAPI**
*   **User Service:** Node.js with **Express**
*   **Notification Service:** Python with **FastAPI** (Event-Driven)
*   **Dashboard Service:** Python with **FastAPI** (Aggregator Pattern)

## Frontend & Templating
*   **Python Services:** **Jinja2** (Server-Side Rendering)
*   **Node.js Services:** **EJS** (Embedded JavaScript templating)
