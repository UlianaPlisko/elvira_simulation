# NS-3 CDN Topology Simulator (Bratislava ↔ Trnava STU)

**Lightweight NS-3 simulation that builds a near-real geographic CDN topology for the Slovak University of Technology (STU) campuses using CSV data, a simple cache server application and NetAnim visualization.**

---

## Table of Contents

- [What this project does](#what-this-project-does)
- [Prerequisites](#prerequisites)
- [Repository / File layout](#repository--file-layout)
- [CSV formats](#csv-formats)
  - [nodes.csv](#nodescsv)
  - [links.csv](#linkscsv)
- [How it works (high level)](#how-it-works-high-level)
- [Build & Run](#build--run)
- [Command line options](#command-line-options)

---

## What this project does

This simulator reads two CSV files (`nodes.csv`, `links.csv`) describing real servers (rectorate, faculties, etc.) and their links  found by this link: https://www.stuba.sk/new/docs/stu/pracoviska/cvt/Topologia-siete-STU.htm, then:

- Converts real-world addresses → `lat/lon` → approximate meters using a simple projection.
- Constructs an NS-3 topology with point-to-point links and assigns per-link subnets.
- Installs a custom `CacheServerApp` on nodes to emulate a CDN: a central origin (rectorate) and multiple edge caches (faculties).
- Optionally deploys `ClientRequestApp` instances on edge nodes to generate `REQ`/`DATA` traffic and measure RTTs / hits / misses.
- Produces a NetAnim XML (`animation.xml`) that visualizes topology and packet flows; PNG icons (`central.png`, `edge.png`) are used for nicer visualization.

**This repository should contain (place in `scratch/`):**

- `topology-csv.cc` — main simulation driver.
- `cache-server.inc` and `cache-server.h` — `CacheServerApp` implementation.
- `client-request.inc` and `client-request.h` — `ClientRequestApp` for testing.
- `simple-header.inc` and `simple-header.h` — small header encoding `REQ` / `DATA`.
- `scratch/nodes.csv`, `scratch/links.csv` — your CSV data (you provide real data).
- `scratch/central.png`, `scratch/edge.png` — NetAnim icons.

---

## Prerequisites

You need:

- **ns-3** (development tree, built). The code uses `std::filesystem` → **C++17** required.
- **NetAnim** (to open `animation.xml`).
- Modern compiler (GCC/Clang) with C++17 support.

### Official Documentation
- ns-3 Tutorial: https://www.nsnam.org/docs/release/3.37/tutorial/ns-3-tutorial.pdf
- NetAnim Manual: https://www.nsnam.org/docs/models/html/animation.html


## Repository / File layout

Place the following files in ns-3's `scratch/` folder (or put them into your project folder and reference accordingly):

- `scratch/`
  - `topology-csv.cc` # main driver (this project)
  - `cache-server.inc` # CacheServerApp implementation (or .cc/.h)
  - `client-request.inc` # ClientRequestApp implementation
  - `simple-header.inc` # Simple packet header
  - `central.png` # icon for central/origin nodes
  - `edge.png` # icon for edge cache nodes
  - `nodes.csv` # your node list (see format below)
  - `links.csv` # your link list (see format below)

- The simulator defaults to `scratch/nodes.csv` and `scratch/links.csv`.  
- You can override these paths with command line options (see [Command line options](#command-line-options)).

## CSV Formats

### `nodes.csv`

- `csvid` — arbitrary ID (for traceability)  
- `name` — node name used in simulation (must be unique)  
- `role` — e.g. `central` or `edge` (code treats `central` specially)  
- `address` — original address string (informational)  
- `lat`, `lon` — decimal degrees (used for placement). Leave empty if unknown.  
- `notes` — optional free text

### `links.csv`

- `src`, `dst` must match `name` values in `nodes.csv`.  
- `capacity` — e.g. `1Gbps` or `100Mbps`. If malformed, the simulator falls back to `1Gbps`.  
- `delay_ms` — one-way delay in milliseconds (numeric).  
- `hops`, `notes` — optional (parsed but not required for connectivity).


## How it Works (High Level)

1. The main program reads `nodes.csv` and `links.csv`.  
2. It creates NS-3 `Node` objects. Nodes with `role` containing `central` (or `name == CVT_STU`) are created **last** so their NodeId is higher and they render on top in NetAnim.  
3. For each `links.csv` row:
   - Create a point-to-point device with `DataRate = capacity` and `Delay = <delay_ms>ms`.
   - Assign a per-link subnet: `10.1.<linkIndex>.0/24`.
4. Install Internet stack and populate routing tables.  
5. Select central/origin node (role `central`) and install `CacheServerApp` as origin. Install `CacheServerApp` on edge nodes pointing to the origin IP.  
6. Optionally install `ClientRequestApp` on edge nodes to generate `REQ` packets and measure responses (RTT/hits/misses).  
7. Compute node positions by averaging `lat/lon`, converting differences to meters with `LatLonToMeters`, scale & center values for NetAnim.  
8. Add NetAnim resources (`central.png`, `edge.png`) using `std::filesystem` and update node images / sizes / colors.  
9. Run the simulation for `--simTime` seconds. `FlowMonitor` data is optionally saved to `flowmon-results.xml`.

## Build & Run

Make sure all simulator files (C++ + `.inc`/`.h` + PNGs + CSVs) are placed in `scratch/` (or update paths accordingly).

From ns-3 root:

### 1) Build ns-3 (if not already built)

```
 $ ./ns3 configure--enable-examples--enable-tests
 $ ./ns3 build
 ```

### 2) Run the topology simulation

```
./ns3 run "topology-csv  --anim=animation.xml --testTraffic=1 --simTime=60"
```

After the run completes, animation.xml will be created in the directory where you executed the command (usually ns-3 root).

### 3) Open animation in NetAnim

In the NetAnim GUI: File → Open → select animation.xml → Play.

## Command Line Options

Provided via `ns3::CommandLine`:

- `--nodes` (default: `scratch/nodes.csv`) — path to nodes CSV
- `--links` (default: `scratch/links.csv`) — path to links CSV
- `--anim` (default: `animation.xml`) — output NetAnim file
- `--scale` — meters → anim units scale (default: 0.06)
- `--testTraffic` (0/1) — enable small test traffic (ClientRequestApp)
- `--simTime` — simulation duration in seconds
