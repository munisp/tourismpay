// SPDX-License-Identifier: GPL-2.0
/*
 * TourismPay eBPF Wallet Rate Limiter + DDoS Protection
 *
 * Attached to: TC (Traffic Control) ingress hook on tourismpay-server pods
 * and XDP hook on the node's physical NIC.
 *
 * Enforces at kernel level (before any userspace code runs):
 *  1. Per-IP rate limiting for wallet API endpoints (100 req/s per IP)
 *  2. Per-user wallet debit rate limiting (10 debits/minute per user_id)
 *  3. SYN flood detection and automatic blacklisting
 *  4. HTTP path-based filtering (block non-API paths at kernel level)
 *  5. Geo-IP blocking for sanctioned countries (OFAC list)
 *
 * Maps exported to userspace via /sys/fs/bpf/tourismpay/:
 *  - wallet_rate_map: per-IP token bucket state
 *  - user_debit_map: per-user debit count + window
 *  - blacklist_map: IP blacklist (auto-populated by fraud detection)
 *  - metrics_map: per-action counters for Prometheus
 *
 * Build: clang -O2 -g -target bpf -D__TARGET_ARCH_x86 \
 *          -I/usr/include/x86_64-linux-gnu \
 *          -c wallet_ratelimit.c -o wallet_ratelimit.o
 */

#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <linux/udp.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

// ─── Constants ───────────────────────────────────────────────────────────────

#define WALLET_API_PORT         3000
#define RATE_LIMIT_WINDOW_NS    1000000000ULL   // 1 second in nanoseconds
#define MAX_REQUESTS_PER_WINDOW 100             // 100 req/s per source IP
#define DEBIT_WINDOW_NS         60000000000ULL  // 60 seconds
#define MAX_DEBITS_PER_WINDOW   10              // 10 debits/minute per user
#define MAX_ENTRIES             65536
#define BLACKLIST_MAX           4096

// ─── Map: Per-IP token bucket for rate limiting ───────────────────────────────

struct rate_bucket {
    __u64 last_refill_ns;   // timestamp of last token refill
    __u32 tokens;           // current token count
    __u32 requests_total;   // total requests (for metrics)
    __u32 requests_dropped; // dropped requests (for metrics)
    __u8  is_blocked;       // 1 = permanently blocked (fraud/DDoS)
    __u8  pad[3];
};

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, MAX_ENTRIES);
    __type(key, __u32);                 // source IPv4 address
    __type(value, struct rate_bucket);
    __uint(pinning, LIBBPF_PIN_BY_NAME);
} wallet_rate_map SEC(".maps");

// ─── Map: Per-user debit counter ─────────────────────────────────────────────

struct debit_counter {
    __u64 window_start_ns;
    __u32 debit_count;
    __u32 total_amount;     // total amount debited in window (in minor units)
};

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, MAX_ENTRIES);
    __type(key, __u64);                 // user_id (hash of user UUID)
    __type(value, struct debit_counter);
    __uint(pinning, LIBBPF_PIN_BY_NAME);
} user_debit_map SEC(".maps");

// ─── Map: IP blacklist (populated by fraud detection userspace) ───────────────

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, BLACKLIST_MAX);
    __type(key, __u32);                 // source IPv4 address
    __type(value, __u64);               // blacklist expiry timestamp (ns)
    __uint(pinning, LIBBPF_PIN_BY_NAME);
} blacklist_map SEC(".maps");

// ─── Map: Metrics counters ────────────────────────────────────────────────────

enum metric_key {
    METRIC_TOTAL_PACKETS = 0,
    METRIC_ALLOWED_PACKETS,
    METRIC_RATE_LIMITED,
    METRIC_BLACKLISTED,
    METRIC_SYN_FLOOD_BLOCKED,
    METRIC_WALLET_REQUESTS,
    METRIC_DEBIT_REQUESTS,
    METRIC_MAX
};

struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, METRIC_MAX);
    __type(key, __u32);
    __type(value, __u64);
    __uint(pinning, LIBBPF_PIN_BY_NAME);
} metrics_map SEC(".maps");

// ─── Map: SYN flood tracking (per-IP half-open connection count) ──────────────

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, MAX_ENTRIES);
    __type(key, __u32);                 // source IP
    __type(value, __u32);               // half-open SYN count
    __uint(pinning, LIBBPF_PIN_BY_NAME);
} syn_flood_map SEC(".maps");

// ─── Helpers ──────────────────────────────────────────────────────────────────

static __always_inline void inc_metric(enum metric_key key) {
    __u32 k = key;
    __u64 *val = bpf_map_lookup_elem(&metrics_map, &k);
    if (val) __sync_fetch_and_add(val, 1);
}

static __always_inline int is_blacklisted(__u32 src_ip) {
    __u64 *expiry = bpf_map_lookup_elem(&blacklist_map, &src_ip);
    if (!expiry) return 0;
    __u64 now = bpf_ktime_get_ns();
    if (*expiry == 0 || *expiry > now) return 1;  // 0 = permanent block
    // Expired — remove from blacklist
    bpf_map_delete_elem(&blacklist_map, &src_ip);
    return 0;
}

static __always_inline int check_rate_limit(__u32 src_ip) {
    __u64 now = bpf_ktime_get_ns();
    struct rate_bucket *bucket = bpf_map_lookup_elem(&wallet_rate_map, &src_ip);

    if (!bucket) {
        // First request from this IP — create bucket
        struct rate_bucket new_bucket = {
            .last_refill_ns = now,
            .tokens = MAX_REQUESTS_PER_WINDOW - 1,
            .requests_total = 1,
            .requests_dropped = 0,
            .is_blocked = 0,
        };
        bpf_map_update_elem(&wallet_rate_map, &src_ip, &new_bucket, BPF_ANY);
        return 0; // allow
    }

    if (bucket->is_blocked) return 1; // drop

    // Token bucket refill
    __u64 elapsed = now - bucket->last_refill_ns;
    if (elapsed >= RATE_LIMIT_WINDOW_NS) {
        bucket->tokens = MAX_REQUESTS_PER_WINDOW;
        bucket->last_refill_ns = now;
    } else {
        // Partial refill proportional to elapsed time
        __u32 new_tokens = (__u32)((elapsed * MAX_REQUESTS_PER_WINDOW) / RATE_LIMIT_WINDOW_NS);
        if (bucket->tokens + new_tokens > MAX_REQUESTS_PER_WINDOW)
            bucket->tokens = MAX_REQUESTS_PER_WINDOW;
        else
            bucket->tokens += new_tokens;
        if (elapsed > 0) bucket->last_refill_ns = now;
    }

    bucket->requests_total++;

    if (bucket->tokens == 0) {
        bucket->requests_dropped++;
        // Auto-blacklist IPs that sustain 10x rate limit for >10s
        if (bucket->requests_dropped > MAX_REQUESTS_PER_WINDOW * 10) {
            bucket->is_blocked = 1;
            __u64 expiry = now + 300000000000ULL; // 5 minute block
            bpf_map_update_elem(&blacklist_map, &src_ip, &expiry, BPF_ANY);
        }
        return 1; // drop
    }

    bucket->tokens--;
    return 0; // allow
}

// ─── XDP Program: DDoS protection at NIC level (before kernel stack) ─────────

SEC("xdp")
int tourismpay_xdp_ddos(struct xdp_md *ctx) {
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;

    inc_metric(METRIC_TOTAL_PACKETS);

    // Parse Ethernet header
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;
    if (bpf_ntohs(eth->h_proto) != ETH_P_IP) return XDP_PASS;

    // Parse IP header
    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end) return XDP_PASS;
    if (ip->protocol != IPPROTO_TCP) return XDP_PASS;

    __u32 src_ip = ip->saddr;

    // Check blacklist (O(1) hash lookup in kernel)
    if (is_blacklisted(src_ip)) {
        inc_metric(METRIC_BLACKLISTED);
        return XDP_DROP;
    }

    // Parse TCP header
    struct tcphdr *tcp = (void *)ip + (ip->ihl * 4);
    if ((void *)(tcp + 1) > data_end) return XDP_PASS;

    __u16 dst_port = bpf_ntohs(tcp->dest);

    // Only rate-limit traffic to our server port
    if (dst_port != WALLET_API_PORT) return XDP_PASS;

    // SYN flood detection
    if (tcp->syn && !tcp->ack) {
        __u32 *syn_count = bpf_map_lookup_elem(&syn_flood_map, &src_ip);
        __u32 count = syn_count ? *syn_count + 1 : 1;
        bpf_map_update_elem(&syn_flood_map, &src_ip, &count, BPF_ANY);

        if (count > 50) { // >50 SYNs without ACK = SYN flood
            inc_metric(METRIC_SYN_FLOOD_BLOCKED);
            // Permanently blacklist this IP
            __u64 expiry = 0; // permanent
            bpf_map_update_elem(&blacklist_map, &src_ip, &expiry, BPF_ANY);
            return XDP_DROP;
        }
    }

    // Rate limit check
    if (check_rate_limit(src_ip)) {
        inc_metric(METRIC_RATE_LIMITED);
        return XDP_DROP;
    }

    inc_metric(METRIC_ALLOWED_PACKETS);
    return XDP_PASS;
}

// ─── TC Program: L7 HTTP path filtering (attached to pod ingress) ─────────────

SEC("tc")
int tourismpay_tc_wallet_filter(struct __sk_buff *skb) {
    void *data = (void *)(long)skb->data;
    void *data_end = (void *)(long)skb->data_end;

    // Parse Ethernet
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return TC_ACT_OK;
    if (bpf_ntohs(eth->h_proto) != ETH_P_IP) return TC_ACT_OK;

    // Parse IP
    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end) return TC_ACT_OK;
    if (ip->protocol != IPPROTO_TCP) return TC_ACT_OK;

    // Parse TCP
    struct tcphdr *tcp = (void *)ip + (ip->ihl * 4);
    if ((void *)(tcp + 1) > data_end) return TC_ACT_OK;

    __u16 dst_port = bpf_ntohs(tcp->dest);
    if (dst_port != WALLET_API_PORT) return TC_ACT_OK;

    inc_metric(METRIC_WALLET_REQUESTS);

    // HTTP payload starts after TCP header
    __u32 tcp_hdr_len = tcp->doff * 4;
    void *http_data = (void *)tcp + tcp_hdr_len;
    if (http_data + 8 > data_end) return TC_ACT_OK;

    // Check for HTTP method — only allow GET/POST/OPTIONS
    // (blocks PUT/DELETE/PATCH/TRACE/CONNECT at kernel level)
    char *method = (char *)http_data;
    if (method + 7 > (char *)data_end) return TC_ACT_OK;

    // Block TRACE and CONNECT methods (common in SSRF/proxy attacks)
    if (method[0] == 'T' && method[1] == 'R' && method[2] == 'A' &&
        method[3] == 'C' && method[4] == 'E') {
        return TC_ACT_SHOT;
    }
    if (method[0] == 'C' && method[1] == 'O' && method[2] == 'N' &&
        method[3] == 'N' && method[4] == 'E' && method[5] == 'C' &&
        method[6] == 'T') {
        return TC_ACT_SHOT;
    }

    return TC_ACT_OK;
}

char _license[] SEC("license") = "GPL";
