#!/usr/bin/env python3
"""Generate performance charts and report from load test results."""

import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

with open("/tmp/load_test_results.json") as f:
    data = json.load(f)

summary = data["summary"]
phases = data["phases"]
per_journey = data["per_journey"]

# ─── Chart 1: Phase Performance (TPS + p95 latency) ─────────────────────────
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
fig.suptitle("TourismPay Load Test — Phase Performance", fontsize=14, fontweight='bold')

phase_names = list(phases.keys())
tps_values = [phases[p]["tps"] for p in phase_names]
p50_values = [phases[p]["p50"] for p in phase_names]
p95_values = [phases[p]["p95"] for p in phase_names]
p99_values = [phases[p]["p99"] for p in phase_names]
err_values = [phases[p]["error_rate"] for p in phase_names]

x = np.arange(len(phase_names))
width = 0.35

bars = ax1.bar(x, tps_values, width, color=['#2196F3', '#4CAF50', '#FF9800', '#9C27B0'], alpha=0.85)
ax1.set_xlabel("Test Phase")
ax1.set_ylabel("Throughput (TPS)")
ax1.set_title("Throughput by Phase")
ax1.set_xticks(x)
ax1.set_xticklabels(phase_names, rotation=15)
ax1.set_ylim(0, max(tps_values) * 1.3)
for bar, val in zip(bars, tps_values):
    ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.2,
             f'{val:.1f}', ha='center', va='bottom', fontsize=10, fontweight='bold')

ax2.plot(phase_names, p50_values, 'o-', color='#4CAF50', linewidth=2, markersize=8, label='p50')
ax2.plot(phase_names, p95_values, 's-', color='#FF9800', linewidth=2, markersize=8, label='p95')
ax2.plot(phase_names, p99_values, '^-', color='#F44336', linewidth=2, markersize=8, label='p99')
ax2.set_xlabel("Test Phase")
ax2.set_ylabel("Latency (ms)")
ax2.set_title("Latency Percentiles by Phase")
ax2.legend()
ax2.grid(True, alpha=0.3)
ax2.set_ylim(0, max(p99_values) * 1.3)

plt.tight_layout()
plt.savefig("/tmp/phase_performance.png", dpi=150, bbox_inches='tight')
plt.close()
print("Saved: /tmp/phase_performance.png")

# ─── Chart 2: Per-Journey Health Heatmap ─────────────────────────────────────
fig, ax = plt.subplots(figsize=(16, 12))
fig.suptitle("TourismPay — Per-Journey Health Matrix (65 Journeys)", fontsize=14, fontweight='bold')

journey_ids = sorted(per_journey.keys())
journey_names = [per_journey[jid]["name"] for jid in journey_ids]
success_rates = [per_journey[jid]["success_rate_pct"] for jid in journey_ids]
p95_latencies = [per_journey[jid]["p95_ms"] for jid in journey_ids]
error_rates = [per_journey[jid]["error_rate_pct"] for jid in journey_ids]
req_counts = [per_journey[jid]["total_requests"] for jid in journey_ids]

# Color by success rate
colors = ['#4CAF50' if s >= 90 else '#FF9800' if s >= 50 else '#F44336' for s in success_rates]

y_pos = np.arange(len(journey_ids))
bars = ax.barh(y_pos, success_rates, color=colors, alpha=0.8, height=0.7)

ax.set_yticks(y_pos)
ax.set_yticklabels([f"{jid}: {name[:30]}" for jid, name in zip(journey_ids, journey_names)],
                   fontsize=7.5)
ax.set_xlabel("Server Reachability (%)")
ax.set_xlim(0, 115)
ax.axvline(x=90, color='green', linestyle='--', alpha=0.5, label='90% threshold')
ax.axvline(x=100, color='blue', linestyle=':', alpha=0.3)

# Add value labels
for bar, rate, p95, reqs in zip(bars, success_rates, p95_latencies, req_counts):
    ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height()/2,
            f'{rate:.0f}% | p95={p95:.0f}ms | n={reqs}',
            va='center', fontsize=6.5)

green_patch = mpatches.Patch(color='#4CAF50', label='Healthy (≥90%)')
orange_patch = mpatches.Patch(color='#FF9800', label='Partial (50-90%)')
red_patch = mpatches.Patch(color='#F44336', label='Failing (<50%)')
ax.legend(handles=[green_patch, orange_patch, red_patch], loc='lower right')
ax.grid(True, axis='x', alpha=0.3)

plt.tight_layout()
plt.savefig("/tmp/journey_health.png", dpi=150, bbox_inches='tight')
plt.close()
print("Saved: /tmp/journey_health.png")

# ─── Chart 3: Latency Distribution ───────────────────────────────────────────
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
fig.suptitle("TourismPay — Latency Distribution", fontsize=14, fontweight='bold')

# p50 distribution across journeys
p50s = [per_journey[jid]["p50_ms"] for jid in journey_ids if per_journey[jid]["p50_ms"] > 0]
p95s = [per_journey[jid]["p95_ms"] for jid in journey_ids if per_journey[jid]["p95_ms"] > 0]

ax1.hist(p50s, bins=20, color='#2196F3', alpha=0.7, edgecolor='white')
ax1.axvline(np.median(p50s), color='red', linestyle='--', linewidth=2,
            label=f'Median: {np.median(p50s):.0f}ms')
ax1.set_xlabel("p50 Latency (ms)")
ax1.set_ylabel("Journey Count")
ax1.set_title("p50 Latency Distribution Across Journeys")
ax1.legend()
ax1.grid(True, alpha=0.3)

ax2.hist(p95s, bins=20, color='#FF9800', alpha=0.7, edgecolor='white')
ax2.axvline(np.median(p95s), color='red', linestyle='--', linewidth=2,
            label=f'Median: {np.median(p95s):.0f}ms')
ax2.set_xlabel("p95 Latency (ms)")
ax2.set_ylabel("Journey Count")
ax2.set_title("p95 Latency Distribution Across Journeys")
ax2.legend()
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig("/tmp/latency_distribution.png", dpi=150, bbox_inches='tight')
plt.close()
print("Saved: /tmp/latency_distribution.png")

# ─── Chart 4: Journey Group Comparison ───────────────────────────────────────
fig, ax = plt.subplots(figsize=(12, 6))
fig.suptitle("TourismPay — Journey Group Performance Comparison", fontsize=14, fontweight='bold')

groups = {
    "J01-J20\n(New V2)": [jid for jid in journey_ids if jid.startswith("J")],
    "T01-T13\n(Tourist)": [jid for jid in journey_ids if jid.startswith("T")],
    "G01-G11\n(Global)": [jid for jid in journey_ids if jid.startswith("G")],
    "M01\n(Merchant)": [jid for jid in journey_ids if jid.startswith("M")],
    "P01-P20\n(Platform)": [jid for jid in journey_ids if jid.startswith("P")],
}

group_names = list(groups.keys())
group_avg_success = []
group_avg_p95 = []
group_avg_tps = []

for gname, gids in groups.items():
    if not gids:
        group_avg_success.append(0)
        group_avg_p95.append(0)
        group_avg_tps.append(0)
        continue
    avg_s = np.mean([per_journey[jid]["success_rate_pct"] for jid in gids if jid in per_journey])
    avg_p95 = np.mean([per_journey[jid]["p95_ms"] for jid in gids if jid in per_journey])
    total_reqs = sum(per_journey[jid]["total_requests"] for jid in gids if jid in per_journey)
    group_avg_success.append(avg_s)
    group_avg_p95.append(avg_p95)
    group_avg_tps.append(total_reqs / 55.0)  # approximate duration

x = np.arange(len(group_names))
width = 0.25

ax.bar(x - width, group_avg_success, width, label='Avg Reachability %', color='#4CAF50', alpha=0.8)
ax2_twin = ax.twinx()
ax2_twin.bar(x, group_avg_p95, width, label='Avg p95 Latency (ms)', color='#FF9800', alpha=0.8)
ax2_twin.bar(x + width, group_avg_tps, width, label='TPS', color='#2196F3', alpha=0.8)

ax.set_xlabel("Journey Group")
ax.set_ylabel("Reachability (%)", color='#4CAF50')
ax2_twin.set_ylabel("Latency (ms) / TPS", color='#FF9800')
ax.set_xticks(x)
ax.set_xticklabels(group_names)
ax.set_ylim(0, 120)
ax2_twin.set_ylim(0, max(group_avg_p95 + group_avg_tps) * 1.3 if group_avg_p95 else 100)

lines1, labels1 = ax.get_legend_handles_labels()
lines2, labels2 = ax2_twin.get_legend_handles_labels()
ax.legend(lines1 + lines2, labels1 + labels2, loc='upper right')
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig("/tmp/group_comparison.png", dpi=150, bbox_inches='tight')
plt.close()
print("Saved: /tmp/group_comparison.png")

print("\nAll charts generated successfully.")
print(f"\nSummary:")
print(f"  Total requests: {summary['total_requests']:,}")
print(f"  Duration: {summary['total_duration_s']:.1f}s")
print(f"  Peak TPS: {summary['overall_tps']:.1f}")
print(f"  Server reachability: {summary['server_reachability_pct']:.1f}%")
print(f"  p50: {summary['p50_ms']:.0f}ms | p95: {summary['p95_ms']:.0f}ms | p99: {summary['p99_ms']:.0f}ms")
print(f"  Healthy journeys: {summary['healthy_journeys']}/65")
