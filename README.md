# Elvira Simulation: Energy-Aware CDN Platform

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-ISC-blue)

## What the Project Does

**Elvira Simulation** is a modular, containerized simulation platform for evaluating energy-aware Content Delivery Network (CDN) strategies in academic environments. It models a central CDN node, multiple edge managers (faculties), DNS, Prometheus monitoring, and student traffic simulators. The system enables research and experimentation with energy optimization, load balancing, and caching policies in a realistic, observable environment.

## Project Structure

```text
elvira_simulation/
├── applications/                # Core simulation components
│   ├── central-manager/         # Central orchestrator (NGINX + API + metrics) → README
│   ├── edge-managers/           # Faculty edge nodes (facultyA–E) → README
│   ├── simulators/              # Traffic generators
│       └── use-case-1/              # Use Case 1: Normal vs. Exam traffic → README
│       └── use-case-2/              # Use Case 2: Compression strategies → README
├── elvira-dashboard/            # React frontend (localhost:3101)
├── img/                         # Images for READMEs (flowcharts, topology)
├── infra/                       # Infrastructure configs (NGINX, Prometheus, DNS)
├── mock-content/                # Sample books/PDFs for CDN
├── ns3-STU-topology/            # NS3 network simulation code (topology)
├── scripts/                     # Entry points, helpers
├── .gitignore
├── README.md                    # This file
├── docker-compose.yml           # Main orchestration
├── package.json                 # Root dependencies (dashboard/dev)
├── package-lock.json
└── tsconfig.json                # TypeScript config (shared)
```

## Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) (for local development)

### Quick Start (Simulation)

1. **Clone the repository:**
   ```sh
   git clone https://github.com/UlianaPlisko/elvira_simulation.git
   cd elvira_simulation
   ```
2. **Build and start all services:**
   ```sh
   docker-compose up --build
   ```
3. **Access the system:**
   - Open: http://localhost:3101
   - Use Case 2 (compression experiments): http://localhost:3101/use-case2
   - Visualize topology, metrics, Eco Index, and control simulations directly in the browser.

4. **Grafana Dashboards (for detailed monitoring):**
   - Open: http://localhost:3010
   - Login: admin / admin123
   - Explore pre-configured dashboards pulling data from Prometheus and logporter.



### Development & Customization
- Edit or add simulators in `applications/simulators/`
- Modify CDN logic in `applications/central-manager/` and `applications/edge-managers/`
- Update DNS, Nginx, or Prometheus configs in `infra/`
- Add mock content (PDFs) in `mock-content/`


## Where Users Can Get Help
- **Documentation:**
  - [Use Case1](./applications/simulators/use-case1/student-sim/README.md)
  - [Use Case2](./applications/simulators/use-case2/README.md)
  - [Central manager](./applications/central-manager/README.md)
  - [Edge manager](./applications/edge-managers/faculty-edge/README.md)
  - [NS-3 Topology](./ns3-STU-topology/README.md)

- **Issues:** Use the GitHub Issues tab for bug reports and feature requests.

## Who Maintains and Contributes
- **Maintainer:** Uliana Plisko
- **Contributions:**
  - Please see `docs/CONTRIBUTING.md` (or open a PR to propose changes)
  - All contributions, bug reports, and feature suggestions are welcome!

---

*This project is for research and educational use. For licensing, see the `LICENSE` file.*
