import json
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path
import seaborn as sns

def load_jsonl(file_path):
    data = []
    with open(file_path, 'r') as f:
        for line in f:
            if line.strip():
                data.append(json.loads(line))
    return data

def process_data(data):
    df = pd.json_normalize(data)
    
    relevant_cols = [
        'strategy', 'compression', 'compression_level', 'file',
        'metrics.transfer_size_bytes', 'metrics.decoded_body_size_bytes',
        'metrics.pdf_processing_duration_ms', 'metrics.client_decompress_ms',
        'metrics.network_transfer_ms', 'metrics.client_compression_ratio',
        'metrics.central_compress_energy_mJ', 'metrics.edge_processing_energy_mJ',
        'metrics.client_processing_energy_mJ', 'metrics.total_energy_mJ'
    ]
    df = df[relevant_cols]
    
    df.rename(columns={
        'metrics.transfer_size_bytes': 'compressed_size_bytes',
        'metrics.decoded_body_size_bytes': 'original_size_bytes',
        'metrics.pdf_processing_duration_ms': 'pdf_processing_ms',
        'metrics.client_decompress_ms': 'client_decompress_ms',
        'metrics.network_transfer_ms': 'network_transfer_ms',
        'metrics.client_compression_ratio': 'compression_ratio',
        'metrics.central_compress_energy_mJ': 'central_compress_energy_mJ',
        'metrics.edge_processing_energy_mJ': 'edge_processing_energy_mJ',
        'metrics.client_processing_energy_mJ': 'client_processing_energy_mJ',
        'metrics.total_energy_mJ': 'total_energy_mJ'
    }, inplace=True)
    
    df['calculated_ratio'] = df['original_size_bytes'] / df['compressed_size_bytes']
    df['compression_ratio'] = df['compression_ratio'].fillna(df['calculated_ratio'])
    
    group_keys = ['strategy', 'compression', 'compression_level', 'file']
    numeric_cols = df.select_dtypes(include=np.number).columns
    df_avg = df.groupby(group_keys, as_index=False)[numeric_cols].mean()
    
    return df_avg

def plot_comparisons(df, output_dir='plots_compression'):
    Path(output_dir).mkdir(exist_ok=True)
    
    # Global file order for consistent x-axis labeling
    all_files = sorted(df['file'].unique(), key=lambda x: int(x.replace('book', '').replace('.pdf', '')))
    
    strategies = sorted(df['strategy'].unique())
    levels = sorted(df['compression_level'].unique())
    
    colors = sns.color_palette("pastel", len(df['compression'].unique()))
    alg_to_color = dict(zip(sorted(df['compression'].unique()), colors))
    
    for strategy in strategies:
        for level in levels:
            df_subset = df[(df['strategy'] == strategy) & (df['compression_level'] == level)]
            if df_subset.empty:
                continue
            
            algorithms = sorted(df_subset['compression'].unique())
            n_alg = len(algorithms)
            
            fig, axs = plt.subplots(3, 2, figsize=(18, 14), constrained_layout=True)
            fig.suptitle(f'Strategy {int(strategy)} — Compression Level {int(level)}', fontsize=18, fontweight='bold')
            
            bar_width = 0.8 / n_alg
            
            plots = [
                ('compression_ratio', 'Compression Ratio (higher is better)', 'Ratio', None),
                ('compressed_size_bytes', 'Compressed Size (lower is better)', 'Size (MB)', lambda x: x / 1024 / 1024),
                ('pdf_processing_ms', 'PDF Processing Duration', 'Time (ms)', None),
                ('client_decompress_ms', 'Client Decompression Time', 'Time (ms)', None),
                ('network_transfer_ms', 'Network Transfer Time', 'Time (ms)', None),
                ('total_energy_mJ', 'Total Energy Consumption (lower is better)', 'Energy (mJ)', None),
            ]
            
            ax_list = [axs[0,0], axs[0,1], axs[1,0], axs[1,1], axs[2,0], axs[2,1]]
            
            for ax, (metric, title, ylabel, transform) in zip(ax_list, plots):
                # Get all unique files present in this strategy/level (across all algorithms)
                present_files = sorted(df_subset['file'].unique(), 
                                       key=lambda x: int(x.replace('book', '').replace('.pdf', '')))
                x_indices = np.arange(len(present_files))
                
                for i, alg in enumerate(algorithms):
                    df_alg = df_subset[df_subset['compression'] == alg].sort_values('file')
                    # Merge to ensure we have values (or NaN) for all present_files
                    df_alg_full = pd.DataFrame({'file': present_files}).merge(df_alg, on='file', how='left')
                    values = df_alg_full[metric].values
                    
                    if transform is not None:
                        values = np.array([transform(v) if pd.notna(v) else np.nan for v in values])
                    
                    offset = (i - (n_alg - 1) / 2) * bar_width
                    ax.bar(x_indices + offset, values, width=bar_width,
                           label=alg, color=alg_to_color[alg], edgecolor='black', alpha=0.85)
                
                ax.set_title(title, fontsize=14)
                ax.set_ylabel(ylabel)
                ax.set_xticks(x_indices)
                ax.set_xticklabels(present_files, rotation=45, ha='right')
                ax.grid(True, axis='y', alpha=0.3)
                
                if ax == axs[0,0]:
                    ax.legend(title='Algorithm', fontsize=12, title_fontsize=12, loc='upper left')
            
            plot_file = f'{output_dir}/strategy_{int(strategy)}_level_{int(level)}.png'
            plt.savefig(plot_file, dpi=300, bbox_inches='tight')
            plt.close()
            print(f'Saved plot: {plot_file}')

if __name__ == '__main__':
    file_path = 'data.jsonl'  # Update if needed
    data = load_jsonl(file_path)
    df_avg = process_data(data)
    
    print("Averaged data sample:")
    print(df_avg[['strategy', 'compression', 'compression_level', 'file', 
                  'compression_ratio', 'total_energy_mJ', 'compressed_size_bytes']])
    
    plot_comparisons(df_avg)