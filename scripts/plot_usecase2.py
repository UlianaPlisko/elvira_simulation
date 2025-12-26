import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import sys
import os

# Function to read JSONL file
def read_jsonl(file_path):
    data = []
    with open(file_path, 'r') as f:
        for line in f:
            if line.strip():  # Ignore empty lines
                try:
                    entry = json.loads(line)
                    metrics = entry['metrics']
                    # Flatten the entry
                    flat_entry = {
                        'strategy': entry['strategy'],
                        'compression': entry['compression'],
                        'file': entry['file'],
                        'total_energy_mJ': metrics['total_energy_mJ'],
                        'network_energy_mJ': metrics['network_energy_mJ'],
                        'central_compress_energy_mJ': metrics['central_compress_energy_mJ'],
                        'edge_processing_energy_mJ': metrics['edge_processing_energy_mJ'],
                        'client_processing_energy_mJ': metrics['client_processing_energy_mJ'],
                        'file_size_MB': metrics['decoded_body_size_bytes'] / 1e6,  # Size in MB
                        'compression_ratio': metrics['client_compression_ratio'],
                        'pdf_processing_duration_ms': metrics['pdf_processing_duration_ms']
                    }
                    data.append(flat_entry)
                except json.JSONDecodeError:
                    print(f"Error parsing line: {line}")
    return pd.DataFrame(data)

# Main function to plot the results
def plot_results(df):
    sns.set_theme(style="whitegrid")  # Nice theme for plots
    eco_palette = 'pastel' 
    # Create 'plots' folder if it doesn't exist
    os.makedirs('plots', exist_ok=True)

    # 1. Bar plot for total_energy_mJ by files and strategies
    plt.figure(figsize=(12, 6))
    # To add error bars, group and compute mean/std if multiple runs
    sns.barplot(data=df, x='file', y='total_energy_mJ', hue='strategy', palette=eco_palette, errorbar=None)
    plt.title('Comparison of Total Energy by Strategies and Book Sizes')
    plt.xlabel('Book (Size)')
    plt.ylabel('Total Energy (mJ)')
    plt.legend(title='Strategy')
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(os.path.join('plots', 'plot_total_energy.png'))
    plt.show()

    # 2. Stacked bar plot for energy breakdown
    # Create a combined key for X-axis: Strategy + Book
    df['strategy_book'] = 'Strategy' + df['strategy'].astype(str) + '-' + df['file']
    energy_components = df.melt(id_vars=['strategy_book'], 
                                value_vars=['central_compress_energy_mJ', 'edge_processing_energy_mJ', 
                                            'client_processing_energy_mJ', 'network_energy_mJ'],
                                var_name='energy_type', value_name='energy_mJ')
    plt.figure(figsize=(14, 7))
    sns.barplot(data=energy_components, x='strategy_book', y='energy_mJ', hue='energy_type', 
                palette=eco_palette, dodge=False)  # dodge=False for stacking
    plt.title('Energy Breakdown by Components (Stacked)')
    plt.xlabel('Strategy + Book')
    plt.ylabel('Energy (mJ)')
    plt.legend(title='Energy Type')
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.savefig(os.path.join('plots', 'plot_stacked_energy.png'))
    plt.show()

    # 3. Line plot for dependency on file size
    plt.figure(figsize=(10, 5))
    sns.lineplot(data=df, x='file_size_MB', y='total_energy_mJ', hue='strategy', marker='o', palette=eco_palette)
    plt.title('Total Energy Dependency on File Size by Strategies')
    plt.xlabel('File Size (MB)')
    plt.ylabel('Total Energy (mJ)')
    plt.legend(title='Strategy')
    plt.tight_layout()
    plt.savefig(os.path.join('plots', 'plot_energy_vs_size.png'))
    plt.show()

    # 4. Subplots for comparing gzip vs brotli
    if 'brotli' in df['compression'].unique() or 'gzip' in df['compression'].unique():
        fig, axes = plt.subplots(1, 2, figsize=(16, 6), sharey=True)
        # Gzip subplot
        gzip_df = df[df['compression'] == 'gzip']
        sns.barplot(data=gzip_df, x='file', y='total_energy_mJ', hue='strategy', ax=axes[0], palette=eco_palette, errorbar='sd')
        axes[0].set_title('GZIP: Total Energy by Strategies')
        axes[0].set_xlabel('Book')
        axes[0].set_ylabel('Energy (mJ)')
        axes[0].legend(title='Strategy')
        axes[0].tick_params(axis='x', rotation=45)

        # Brotli subplot (if data exists, else empty)
        brotli_df = df[df['compression'] == 'brotli']
        sns.barplot(data=brotli_df, x='file', y='total_energy_mJ', hue='strategy', ax=axes[1], palette=eco_palette, errorbar='sd')
        axes[1].set_title('Brotli: Total Energy by Strategies')
        axes[1].set_xlabel('Book')
        axes[1].set_ylabel('Energy (mJ)')
        axes[1].legend(title='Strategy')
        axes[1].tick_params(axis='x', rotation=45)

        plt.tight_layout()
        plt.savefig(os.path.join('plots', 'plot_compare_algorithms.png'))
        plt.show()

    # Additional plots
    # Boxplot for processing time (the line in the center is the median; it's standard for boxplots)
    plt.figure(figsize=(8, 5))
    sns.boxplot(data=df, x='strategy', y='pdf_processing_duration_ms', palette=eco_palette, showmeans=False,  # No mean marker
                medianprops={'visible': False})  # Make median line clearer (black and thicker)
    plt.title('Processing Time (ms) by Strategies')
    plt.xlabel('Strategy')
    plt.ylabel('PDF Processing Duration (ms)')
    plt.tight_layout()
    plt.savefig(os.path.join('plots', 'plot_processing_time_boxplot.png'))
    plt.show()

    # Scatter plot for compression_ratio vs total_energy_mJ
    plt.figure(figsize=(10, 5))
    sns.scatterplot(data=df, x='compression_ratio', y='total_energy_mJ', hue='strategy', style='compression', palette=eco_palette, s=100)
    plt.title('Compression Ratio vs Total Energy')
    plt.xlabel('Compression Ratio')
    plt.ylabel('Total Energy (mJ)')
    plt.legend(title='Strategy / Compression')
    plt.tight_layout()
    plt.savefig(os.path.join('plots', 'plot_compression_vs_energy.png'))
    plt.show()

# Main code
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python script.py <path_to_jsonl>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        sys.exit(1)
    
    df = read_jsonl(file_path)
    print("Data loaded:")
    print(df.head())  # For verification
    
    plot_results(df)