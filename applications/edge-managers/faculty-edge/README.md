# faculty-edge

The `faculty-edge` package implements the edge manager for a specific faculty node in the ELVIRA simulation environment. This is one of the five identical edge servers (facultyA through facultyE) in the simulated CDN architecture.

### Overview
- **Purpose**: Acts as an intelligent edge node that handles HTTP traffic, caching, and dynamic resource management. It exposes real-time metrics for performance evaluation of the overall system.
- **Key Components**:
  - **Nginx** reverse proxy with caching (books cache at `/var/cache/nginx/elvira_cache`).
  - **Express.js** control API for metrics collection and management.
  - **Prometheus client** for exporting custom and system metrics.
  - **Periodic metric updates** (every 10s) including CPU, memory, network, disk I/O, energy consumption, cache utilization, and load factor λ(t).
  - **Energy model** with idle/peak power and activation penalties.
  - **Reset endpoint** for metrics during simulation runs.

### Main Endpoints
- `/health` & `/status`: Basic health checks.
- `/reset-metrics`: Resets counters and gauges (protected during simulation).
- `/{faculty}-metrics`: JSON endpoint with aggregated metrics (energy, CPU, memory, network, disk, cache, requests, transitions).
- `/metrics`: Standard Prometheus exposition.
- `/prom-query`: Proxy for Prometheus queries.

### Metrics Collected
- Energy consumption (kWh) and power (W).
- Load factor λ(t) based on CPU and connections.
- Container and host resource usage (CPU%, RAM, network, I/O).
- Nginx request stats (total, RPS, active connections).
- Cache utilization (books used MB/percent).
- Activation transitions for energy penalty.

### Containerization
Built as a multi-stage Docker image:
- Builder stage: Node.js build of the TypeScript application.
- Runtime: Nginx + Node.js + Prometheus node-exporter.
- Entrypoint script handles dynamic configuration and starts services.

### Configuration
Environment-driven:
- `FACULTY`: facultyA–E
- `CONTROL_PORT`: optional override
- `PROMETHEUS_URL`: Prometheus endpoint

This package is deployed as a container per faculty node, enabling scalable monitoring and evaluation of the ELVIRA simulation's energy efficiency and performance.