import json
import argparse
from datetime import datetime
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, MultipleLocator
import os

def load_data(file_path):
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Parse timestamps and convert values to float
    parsed = []
    for point in data:
        ts = datetime.fromisoformat(point["timestamp"].replace("Z", "+00:00"))
        eco = float(point.get("ecoIndex", 0))
        cpu = float(point.get("avgCPU", 0))
        parsed.append({"time": ts, "ecoIndex": eco, "avgCPU": cpu})
    
    # Sort by time just in case
    parsed.sort(key=lambda x: x["time"])
    
    # Compute relative time in minutes
    if parsed:
        start_time = parsed[0]["time"]
        for p in parsed:
            relative_seconds = (p["time"] - start_time).total_seconds()
            p["relative_time"] = relative_seconds / 60  # in decimal minutes
    
    return parsed

def minutes_to_minsec(x, pos):
    """Format decimal minutes to MM:SS"""
    mins = int(x)
    secs = int((x - mins) * 60)
    return f"{mins:02d}:{secs:02d}"

def plot_comparison(central_data, edge_data, output_dir="plots"):
    os.makedirs(output_dir, exist_ok=True)

    times_c = [p["relative_time"] for p in central_data]
    times_e = [p["relative_time"] for p in edge_data]

    eco_c = [p["ecoIndex"] for p in central_data]
    eco_e = [p["ecoIndex"] for p in edge_data]

    cpu_c = [p["avgCPU"] for p in central_data]
    cpu_e = [p["avgCPU"] for p in edge_data]

    # Custom matplotlib style
    import matplotlib as mpl
    mpl.rcParams.update({
        "figure.facecolor": "white",
        "axes.titlesize": 14,
        "axes.labelsize": 12,
        "legend.fontsize": 11,
        "xtick.labelsize": 10,
        "ytick.labelsize": 10
    })

    central_color = "#1f77b4"  # blue
    edge_color = "#2ca02c"     # green variant

    # Compute baselines (mean values)
    mean_eco_c = sum(eco_c) / len(eco_c) if eco_c else 0
    mean_eco_e = sum(eco_e) / len(eco_e) if eco_e else 0
    mean_cpu_c = sum(cpu_c) / len(cpu_c) if cpu_c else 0
    mean_cpu_e = sum(cpu_e) / len(cpu_e) if cpu_e else 0

    # Combined figure with 2 subplots
    fig, axs = plt.subplots(2, 1, figsize=(14, 10), sharex=True)

    # Eco Index Plot
    axs[0].plot(times_c, eco_c, label='Central Mode', color=central_color, linewidth=2)
    axs[0].plot(times_e, eco_e, label='Edge Mode', color=edge_color, linewidth=2)
    # Add baselines
    if times_c:
        axs[0].axhline(mean_eco_c, color=central_color, linestyle='--', alpha=0.5, label='Central Mean')
    if times_e:
        axs[0].axhline(mean_eco_e, color=edge_color, linestyle='--', alpha=0.5, label='Edge Mean')
    axs[0].set_title('Eco Index Over Simulation Time', fontsize=16, fontweight='bold', pad=20)
    axs[0].set_ylabel('Eco Index', fontsize=12)
    axs[0].legend(fontsize=12)
    axs[0].grid(True, alpha=0.3)

    # Avg CPU Plot
    axs[1].plot(times_c, cpu_c, label='Central Mode (%)', color=central_color, linewidth=2)
    axs[1].plot(times_e, cpu_e, label='Edge Mode (%)', color=edge_color, linewidth=2)
    # Add baselines
    if times_c:
        axs[1].axhline(mean_cpu_c, color=central_color, linestyle='--', alpha=0.5, label='Central Mean')
    if times_e:
        axs[1].axhline(mean_cpu_e, color=edge_color, linestyle='--', alpha=0.5, label='Edge Mean')
    axs[1].set_title('Average CPU Utilization Over Simulation Time', fontsize=16, fontweight='bold', pad=20)
    axs[1].set_ylabel('Avg CPU (%)', fontsize=12)
    axs[1].set_xlabel('Simulation Time (MM:SS)', fontsize=12)
    axs[1].legend(fontsize=12)
    axs[1].grid(True, alpha=0.3)

    # Format x-axis as MM:SS
    axs[1].xaxis.set_major_formatter(FuncFormatter(minutes_to_minsec))
    axs[1].xaxis.set_major_locator(MultipleLocator(1))  # every minute
    axs[1].xaxis.set_minor_locator(MultipleLocator(0.5))  # every 30 seconds
    plt.xticks(rotation=0)

    # Set x limits to 0-10 minutes if data is within
    max_time = max(times_c + times_e, default=0)
    axs[1].set_xlim(0, max(10, max_time + 0.5))

    plt.tight_layout()
    plt.subplots_adjust(hspace=0.3)

    # Save combined
    combined_path = os.path.join(output_dir, "eco_comparison_combined.png")
    plt.savefig(combined_path, dpi=300, bbox_inches='tight')
    print(f"Saved combined plot: {combined_path}")

    # Save separate plots
    # Eco Index separate
    plt.figure(figsize=(14, 5))
    plt.plot(times_c, eco_c, label='Central Mode', color=central_color, linewidth=2)
    plt.plot(times_e, eco_e, label='Edge Mode', color=edge_color, linewidth=2)
    if times_c:
        plt.axhline(mean_eco_c, color=central_color, linestyle='--', alpha=0.5, label='Central Mean')
    if times_e:
        plt.axhline(mean_eco_e, color=edge_color, linestyle='--', alpha=0.5, label='Edge Mean')
    plt.title('Eco Index Over Simulation Time', fontsize=16, fontweight='bold')
    plt.ylabel('Eco Index', fontsize=12)
    plt.xlabel('Simulation Time (MM:SS)', fontsize=12)
    plt.xlim(0, max(10, max_time + 0.5))
    plt.gca().xaxis.set_major_formatter(FuncFormatter(minutes_to_minsec))
    plt.gca().xaxis.set_major_locator(MultipleLocator(1))
    plt.gca().xaxis.set_minor_locator(MultipleLocator(0.5))
    plt.legend(fontsize=12)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    eco_path = os.path.join(output_dir, "eco_index_comparison.png")
    plt.savefig(eco_path, dpi=300, bbox_inches='tight')
    print(f"Saved eco index plot: {eco_path}")
    plt.close()

    # Avg CPU separate
    plt.figure(figsize=(14, 5))
    plt.plot(times_c, cpu_c, label='Central Mode (%)', color=central_color, linewidth=2)
    plt.plot(times_e, cpu_e, label='Edge Mode (%)', color=edge_color, linewidth=2)
    if times_c:
        plt.axhline(mean_cpu_c, color=central_color, linestyle='--', alpha=0.5, label='Central Mean')
    if times_e:
        plt.axhline(mean_cpu_e, color=edge_color, linestyle='--', alpha=0.5, label='Edge Mean')
    plt.title('Average CPU Utilization Over Simulation Time', fontsize=16, fontweight='bold')
    plt.ylabel('Avg CPU (%)', fontsize=12)
    plt.xlabel('Simulation Time (MM:SS)', fontsize=12)
    plt.xlim(0, max(10, max_time + 0.5))
    plt.gca().xaxis.set_major_formatter(FuncFormatter(minutes_to_minsec))
    plt.gca().xaxis.set_major_locator(MultipleLocator(1))
    plt.gca().xaxis.set_minor_locator(MultipleLocator(0.5))
    plt.legend(fontsize=12)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    cpu_path = os.path.join(output_dir, "avg_cpu_comparison.png")
    plt.savefig(cpu_path, dpi=300, bbox_inches='tight')
    print(f"Saved avg cpu plot: {cpu_path}")
    plt.close()

def main():
    parser = argparse.ArgumentParser(
        description="Compare Eco Index and CPU usage between Central and Edge modes from simulation JSON files."
    )
    parser.add_argument("file1", help="Path to first JSON file (e.g. ecoindex_central_....json)")
    parser.add_argument("file2", help="Path to second JSON file (e.g. ecoindex_edge_....json)")
    parser.add_argument("--output", "-o", default="plots", help="Output directory for plots (default: 'plots')")

    args = parser.parse_args()

    # Detect which file is central and which is edge
    file1_name = os.path.basename(args.file1).lower()
    file2_name = os.path.basename(args.file2).lower()

    if "central" in file1_name and "edge" in file2_name:
        central_file, edge_file = args.file1, args.file2
    elif "edge" in file1_name and "central" in file2_name:
        central_file, edge_file = args.file2, args.file1
    else:
        print("Warning: Could not clearly detect 'central' and 'edge' in filenames.")
        print("Assuming first file is central, second is edge.")
        central_file, edge_file = args.file1, args.file2

    print(f"Loading Central: {os.path.basename(central_file)}")
    print(f"Loading Edge:    {os.path.basename(edge_file)}")

    central_data = load_data(central_file)
    edge_data = load_data(edge_file)

    print(f"Central points: {len(central_data)}")
    print(f"Edge points:    {len(edge_data)}")

    plot_comparison(central_data, edge_data, output_dir=args.output)

    print("\nAll plots generated successfully! 🎉")

if __name__ == "__main__":
    main()