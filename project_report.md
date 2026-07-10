# Server Room Digital Twin - Complete Project Report

## Executive Summary
The Server Room Digital Twin has been upgraded from a basic working prototype to a portfolio-grade, production-leaning architecture. The system now features a robust 3-tier architecture with Machine Learning anomaly detection, an LLM-powered assistant, WebGL spatial visualization, and horizontal scaling capabilities.

## Phase 1: Hardening & Security (Completed)
- **Secrets Management**: Implemented `dotenv` across the backend and edge agents to prevent credential leakage.
- **Payload Validation**: Migrated to `zod` for strict runtime schema validation of incoming login and control requests.
- **Rate Limiting**: Added `express-rate-limit` to the `/api/login` route to protect against brute-force attacks.
- **Structured Logging**: Replaced `console.log` with `pino`, providing JSON-formatted, timestamped, and severity-leveled logs.
- **Broker Fallback**: Built resilience into the Node.js MQTT client, automatically falling back to `broker.emqx.io` if the local broker is unreachable.

## Phase 2: Backend & Data Scaling (Completed)
- **Database Abstraction**: Refactored the storage layer to support switching between the lightweight SQLite and the time-series optimized InfluxDB via the `DB_DRIVER` environment variable.
- **Horizontal Scaling via Redis**: Integrated `@socket.io/redis-adapter` to allow multiple instances of the Node.js backend to synchronize WebSocket states via Redis Pub/Sub.
- **Role-Based Access Control (RBAC)**: Added `admin` and `viewer` roles to the JWT payload. Enforced authorization on critical functions (e.g., Global AC toggle).
- **Automated Testing**: Built an integration test suite for the API using `jest` and `supertest`, and unit tests for the Python physics models using `pytest`.
- **Alert Escalation**: Implemented logic in `server.js` that tracks consecutive warnings. If a rack triggers >3 warnings within 5 minutes, it escalates to a `FATAL` severity.

## Phase 3: Intelligence Layer (ML & AI) (Completed)
- **Predictive Maintenance**: Implemented a sliding window (moving average) on the Node.js backend that calculates the temperature slope (dT/dt) to forecast the time until a rack reaches the critical 28°C threshold.
- **ML Anomaly Detection**: Integrated a Scikit-Learn `IsolationForest` into the Python edge agent. This model analyzes the multivariable state (Temp, Hum, CPU, RAM) and flags anomalies natively on the edge.
- **Power Usage Effectiveness (PUE)**: Added real-time PUE calculation by estimating IT equipment power load versus cooling overhead.
- **"Ask the Twin" LLM Integration**: Created an `/api/chat` endpoint powered by `@google/genai`. The Gemini flash model is injected with the real-time telemetry state, allowing users to query system status conversationally.
- **Chaos Engineering**: Added a `KILL_RACK` MQTT control command that artificially simulates a catastrophic thermal runaway event for testing system resilience.

## Phase 4: Frontend/UX Overhaul (Completed)
- **WebGL Spatial Map**: Replaced the CSS-based isometric view with a true 3D scene using `react-three-fiber` and `@react-three/drei`.
- **Progressive Web App (PWA)**: Added a `manifest.json` and registered PWA capabilities.
- **Tabbed Interface**: Organized the dense UI into clean tabs (`Dashboard`, `Ask the Twin`) for better UX.
- **Email Notifications**: Integrated `nodemailer` to dispatch emails to administrators instantly when a `FATAL` alert is triggered.

## Phase 5: DevOps & Deployment (Completed)
- **Containerization**: Wrote optimized Dockerfiles for both the Node.js Backend (`node:20-alpine`) and the React Frontend (`nginx:alpine`).
- **Orchestration**: Updated `docker-compose.yml` to orchestrate all dependent services (Backend, Frontend, Redis, InfluxDB, MQTT).
- **Reverse Proxy**: Added an NGINX configuration (`nginx.conf`) to serve static files and proxy WebSocket/API traffic.
- **CI/CD Pipeline**: Created a GitHub Actions workflow (`.github/workflows/main.yml`) that automatically runs the `jest` and `pytest` suites on pull requests and pushes to `main`.
- **Kubernetes**: Included baseline Kubernetes manifests (`backend.yaml`, `frontend.yaml`) in the `k8s/` directory.

## System Architecture Flow

1. **Edge Node (`sensor.py`)**: Gathers metrics, computes localized physics/ML, and publishes to MQTT (`digital_twin_anshh_991/server_room/env`).
2. **Message Broker**: Routes telemetry to subscribers.
3. **Backend (`server.js`)**: Subscribes to MQTT. Calculates derived metrics (PUE, Forecast). Persists to DB (SQLite/Influx). Broadcasts to WebSockets. Handles AI chat and HTTP Auth.
4. **Frontend (React)**: Connects via WebSocket. Renders WebGL scene based on live telemetry. Issues Control commands (AC, Kill Rack) back through WebSocket -> Backend -> MQTT -> Edge Node.
