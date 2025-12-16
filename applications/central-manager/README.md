# central-manager

The `central-manager` package implements the central orchestration and control node for the ELVIRA simulation environment. It serves as the single point of control for the entire simulated CDN infrastructure, managing DNS routing, NGINX configurations, compression strategies, simulation workflows, and aggregated metrics collection.

### Overview
- **Purpose**: Coordinates experiments across the five faculty edge nodes and the central server. It dynamically switches between baseline (central-only) and proposed (edge-cached) architectures, triggers pre-compression, cache clearing, cache warm-up, and runs controlled simulations (normal, exam, usecase2). It provides comprehensive metrics for evaluating energy efficiency, performance, and compression strategies.
- **Key Components**:
  - **Express.js** control API for DNS mode switching, simulation control, and metrics.
  - **Prometheus client** for exporting central-specific metrics (energy, load, resources, requests, cache).
  - **NGINX** reverse proxy with dynamic configuration templates (central.conf.template).
  - **Compression logic** for pre-compressing books on central (gzip/brotli, levels).
  - **Simulation control** — starts/stops usecases, runs Selenium-based client tests.
  - **DNS routing** — toggles between central and edge resolution.
  - **Usecase2 orchestration** — evaluates compression strategies (1: no compress, 2: edge decompress, 3: client decompress) with energy calculations and logging.

### Main Endpoints
- `/health` & `/status`: Basic checks.
- `/reset-metrics`: Resets counters (protected during simulation).
- `/central-metrics`: Aggregated JSON metrics (energy, CPU, memory, network, disk, cache, requests, transitions).
- `/metrics`: Standard Prometheus exposition.
- `/dns-status`: Current DNS mode (central / edge).
- `/switch-to-central` & `/switch-to-edge`: Change DNS resolution.
- `/simulator/normal`, `/simulator/exam`, `/simulator/stop`, `/simulator/status`: Control simulation workflows.
- `/usecase2/start`: Run single compression experiment with metrics and energy accounting.

### Metrics Collected (central-specific)
- Energy consumption (kWh) and power (W).
- Load factor λ(t).
- Host & container resource usage (CPU%, RAM, network, I/O).
- Nginx request stats (total, RPS, active connections).
- Cache utilization (books used MB/percent).
- Activation transitions.
- Pre-compression stats (wall time, CPU time, original/compressed bytes).

### Containerization
Multi-stage Docker image:
- Builder: Node.js + TypeScript build.
- Runtime: Nginx + Node.js + Prometheus node-exporter + Docker CLI (for exec commands).
- Entrypoint script handles dynamic NGINX config and service startup.
- Exposes ports: 80 (HTTP), 9100 (node-exporter), 3000, 3100 (control API).

### Configuration
Environment-driven:
- `CONTROL_PORT`: API port (default 3100)
- `STRATEGY`, `COMPRESS_ALGO`, `COMPRESS_LEVEL`: Usecase2 defaults
- `PROMETHEUS_URL`: Prometheus endpoint

This package enables repeatable experiments, dynamic architecture switching, and detailed metric collection to evaluate the energy and performance benefits of the proposed edge-based CDN architecture.