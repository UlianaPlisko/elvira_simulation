# Elvira Simulation: Energy-Aware CDN Platform

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-ISC-blue)

## What the Project Does

**Elvira Simulation** is a modular, containerized simulation platform for evaluating energy-aware Content Delivery Network (CDN) strategies in academic environments. It models a central CDN node, multiple edge managers (faculties), DNS, Prometheus monitoring, and student traffic simulators. The system enables research and experimentation with energy optimization, load balancing, and caching policies in a realistic, observable environment.

## Why the Project Is Useful

- **Energy Optimization**: Simulate and analyze the impact of energy-saving strategies on CDN performance.
- **Realistic Traffic**: Student simulators generate realistic, bursty access patterns (e.g., exam spikes) using Zipf distributions.
- **Observability**: Integrated Prometheus metrics for load, energy, and latency at each node.
- **Modular & Extensible**: Add new edge managers, simulators, or monitoring easily.
- **Reproducible**: Fully containerized with Docker Compose for consistent, repeatable experiments.

## Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) (for local development)

### Quick Start (Simulation)

1. **Clone the repository:**
   ```sh
   git clone <this-repo-url>
   cd elvira_simulation
   ```
2. **Build and start all services:**
   ```sh
   docker-compose up --build
   ```
3. **Access the system:**
   - Central CDN: http://localhost:8080/books/
   - FacultyA Edge: http://localhost:8081/books/
   - Prometheus: http://localhost:9090/
   - Metrics endpoints: see `infra/prometheus/prometheus.yml`

### Development & Customization
- Edit or add simulators in `applications/simulators/`
- Modify CDN logic in `applications/central-manager/` and `applications/edge-managers/`
- Update DNS, Nginx, or Prometheus configs in `infra/`
- Add mock content (PDFs) in `mock-content/`

### Example: Running a Student Simulator
```sh
cd applications/simulators/student-sim
npm install
npm run build
npm start
```

## Where Users Can Get Help
- **Documentation:**
  - [Use Cases](docs/use-cases.md)
  - [Evaluation Metrics](docs/evaluation-metrics.md)
- **Issues:** Use the GitHub Issues tab for bug reports and feature requests.

## Who Maintains and Contributes
- **Maintainer:** Uliana Plisko
- **Contributions:**
  - Please see `docs/CONTRIBUTING.md` (or open a PR to propose changes)
  - All contributions, bug reports, and feature suggestions are welcome!

---

*This project is for research and educational use. For licensing, see the `LICENSE` file.*
