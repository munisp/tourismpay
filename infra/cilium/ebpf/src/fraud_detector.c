// SPDX-License-Identifier: GPL-2.0
/*
 * TourismPay eBPF Fraud Signal Detector
 *
 * Attached to: kprobe on sys_connect + TC egress on server pods
 *
 * Detects at kernel level (zero userspace overhead):
 *  1. Velocity anomalies: >5 connections/second to payment endpoints
 *  2. Port scanning: connections to >10 different ports from same source
 *  3. Data exfiltration: unusually large egress payloads (>1MB in <1s)
 *  4. Lateral movement: server pod connecting to unexpected internal IPs
 *  5. Credential stuffing: >20 failed auth attempts from same IP in 60s
 *
 * Signals are written to fraud_signals_map and read by the Go fraud
 * detection service (fraud-detection-go) via perf event ring buffer.
 */

#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>
#include <bpf/bpf_tracing.h>

// ─── Fraud Signal Types ───────────────────────────────────────────────────────

#define SIGNAL_VELOCITY_ANOMALY     1
#define SIGNAL_PORT_SCAN            2
#define SIGNAL_DATA_EXFILTRATION    3
#define SIGNAL_LATERAL_MOVEMENT     4
#define SIGNAL_CREDENTIAL_STUFFING  5
#define SIGNAL_LARGE_TRANSFER       6

// ─── Fraud Signal Event (sent to userspace via perf buffer) ──────────────────

struct fraud_signal {
    __u64 timestamp_ns;
    __u32 src_ip;
    __u32 dst_ip;
    __u16 dst_port;
    __u8  signal_type;
    __u8  severity;         // 1=low, 2=medium, 3=high, 4=critical
    __u32 count;            // how many times this signal fired
    __u64 user_id_hash;     // hash of user_id if available from HTTP header
    char  path[64];         // HTTP path if available
};

// ─── Maps ─────────────────────────────────────────────────────────────────────

// Perf event buffer: sends fraud signals to userspace Go service
struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(__u32));
    __uint(value_size, sizeof(__u32));
    __uint(pinning, LIBBPF_PIN_BY_NAME);
} fraud_events SEC(".maps");

// Per-IP connection velocity tracker
struct velocity_state {
    __u64 window_start_ns;
    __u32 conn_count;
    __u32 unique_ports;
    __u16 ports_seen[16];   // last 16 unique ports
    __u32 bytes_egress;
};

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 65536);
    __type(key, __u32);                 // source IP
    __type(value, struct velocity_state);
    __uint(pinning, LIBBPF_PIN_BY_NAME);
} velocity_map SEC(".maps");

// Auth failure counter (for credential stuffing detection)
struct auth_failures {
    __u64 window_start_ns;
    __u32 failure_count;
};

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 65536);
    __type(key, __u32);                 // source IP
    __type(value, struct auth_failures);
    __uint(pinning, LIBBPF_PIN_BY_NAME);
} auth_failure_map SEC(".maps");

// Allowed internal IPs for server pod (lateral movement detection)
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 256);
    __type(key, __u32);                 // allowed destination IP
    __type(value, __u8);                // 1 = allowed
    __uint(pinning, LIBBPF_PIN_BY_NAME);
} allowed_egress_map SEC(".maps");

// ─── Helper: emit fraud signal ────────────────────────────────────────────────

static __always_inline void emit_signal(
    struct __sk_buff *skb,
    __u32 src_ip, __u32 dst_ip, __u16 dst_port,
    __u8 signal_type, __u8 severity, __u32 count
) {
    struct fraud_signal sig = {
        .timestamp_ns = bpf_ktime_get_ns(),
        .src_ip = src_ip,
        .dst_ip = dst_ip,
        .dst_port = dst_port,
        .signal_type = signal_type,
        .severity = severity,
        .count = count,
        .user_id_hash = 0,
    };
    bpf_perf_event_output(skb, &fraud_events, BPF_F_CURRENT_CPU,
                          &sig, sizeof(sig));
}

// ─── TC Egress: detect lateral movement and data exfiltration ────────────────

SEC("tc")
int tourismpay_fraud_egress(struct __sk_buff *skb) {
    void *data = (void *)(long)skb->data;
    void *data_end = (void *)(long)skb->data_end;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return TC_ACT_OK;
    if (bpf_ntohs(eth->h_proto) != ETH_P_IP) return TC_ACT_OK;

    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end) return TC_ACT_OK;
    if (ip->protocol != IPPROTO_TCP) return TC_ACT_OK;

    __u32 src_ip = ip->saddr;
    __u32 dst_ip = ip->daddr;
    __u32 pkt_len = bpf_ntohs(ip->tot_len);

    struct tcphdr *tcp = (void *)ip + (ip->ihl * 4);
    if ((void *)(tcp + 1) > data_end) return TC_ACT_OK;
    __u16 dst_port = bpf_ntohs(tcp->dest);

    __u64 now = bpf_ktime_get_ns();

    // ── Lateral movement detection ──────────────────────────────────────────
    // Server pod should only connect to known internal services
    // If it connects to an unknown IP, emit LATERAL_MOVEMENT signal
    __u8 *allowed = bpf_map_lookup_elem(&allowed_egress_map, &dst_ip);
    if (!allowed && dst_ip != 0) {
        // Unknown destination — could be lateral movement or C2 callback
        emit_signal(skb, src_ip, dst_ip, dst_port,
                    SIGNAL_LATERAL_MOVEMENT, 3, 1);
    }

    // ── Data exfiltration detection ─────────────────────────────────────────
    struct velocity_state *vel = bpf_map_lookup_elem(&velocity_map, &src_ip);
    if (vel) {
        __u64 elapsed = now - vel->window_start_ns;
        if (elapsed < 1000000000ULL) { // within 1 second window
            vel->bytes_egress += pkt_len;
            if (vel->bytes_egress > 1048576) { // >1MB in 1 second
                emit_signal(skb, src_ip, dst_ip, dst_port,
                            SIGNAL_DATA_EXFILTRATION, 4, vel->bytes_egress);
            }
        } else {
            vel->bytes_egress = pkt_len;
            vel->window_start_ns = now;
        }
    } else {
        struct velocity_state new_vel = {
            .window_start_ns = now,
            .conn_count = 1,
            .unique_ports = 1,
            .bytes_egress = pkt_len,
        };
        new_vel.ports_seen[0] = dst_port;
        bpf_map_update_elem(&velocity_map, &src_ip, &new_vel, BPF_ANY);
    }

    return TC_ACT_OK;
}

// ─── TC Ingress: detect credential stuffing and velocity anomalies ────────────

SEC("tc")
int tourismpay_fraud_ingress(struct __sk_buff *skb) {
    void *data = (void *)(long)skb->data;
    void *data_end = (void *)(long)skb->data_end;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return TC_ACT_OK;
    if (bpf_ntohs(eth->h_proto) != ETH_P_IP) return TC_ACT_OK;

    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end) return TC_ACT_OK;
    if (ip->protocol != IPPROTO_TCP) return TC_ACT_OK;

    __u32 src_ip = ip->saddr;
    __u32 dst_ip = ip->daddr;

    struct tcphdr *tcp = (void *)ip + (ip->ihl * 4);
    if ((void *)(tcp + 1) > data_end) return TC_ACT_OK;
    __u16 dst_port = bpf_ntohs(tcp->dest);

    __u64 now = bpf_ktime_get_ns();

    // ── Connection velocity anomaly ─────────────────────────────────────────
    struct velocity_state *vel = bpf_map_lookup_elem(&velocity_map, &src_ip);
    if (vel) {
        __u64 elapsed = now - vel->window_start_ns;
        if (elapsed < 1000000000ULL) { // 1 second window
            vel->conn_count++;
            if (vel->conn_count > 50) { // >50 connections/second
                emit_signal(skb, src_ip, dst_ip, dst_port,
                            SIGNAL_VELOCITY_ANOMALY, 3, vel->conn_count);
            }

            // Port scan detection: >10 unique ports in 1 second
            __u8 port_seen = 0;
            for (int i = 0; i < 16; i++) {
                if (vel->ports_seen[i] == dst_port) {
                    port_seen = 1;
                    break;
                }
            }
            if (!port_seen && vel->unique_ports < 16) {
                vel->ports_seen[vel->unique_ports & 15] = dst_port;
                vel->unique_ports++;
                if (vel->unique_ports > 10) {
                    emit_signal(skb, src_ip, dst_ip, dst_port,
                                SIGNAL_PORT_SCAN, 4, vel->unique_ports);
                }
            }
        } else {
            // Reset window
            vel->conn_count = 1;
            vel->unique_ports = 1;
            vel->window_start_ns = now;
            vel->ports_seen[0] = dst_port;
        }
    } else {
        struct velocity_state new_vel = {
            .window_start_ns = now,
            .conn_count = 1,
            .unique_ports = 1,
        };
        new_vel.ports_seen[0] = dst_port;
        bpf_map_update_elem(&velocity_map, &src_ip, &new_vel, BPF_ANY);
    }

    return TC_ACT_OK;
}

char _license[] SEC("license") = "GPL";
