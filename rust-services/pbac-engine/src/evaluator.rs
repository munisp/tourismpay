use crate::{AccessRequest, Condition, ConditionOp, Policy, PolicyEffect, SubjectMatcher};

pub fn evaluate(req: &AccessRequest, policies: &[Policy]) -> (bool, String, Option<String>) {
    let mut sorted: Vec<&Policy> = policies.iter().collect();
    sorted.sort_by(|a, b| b.priority.cmp(&a.priority));

    for policy in &sorted {
        if !matches_subject(&policy.subjects, &req.subject.roles, &req.subject.id) {
            continue;
        }
        if !matches_resource(&policy.resources, &req.resource) {
            continue;
        }
        if !matches_action(&policy.actions, &req.action) {
            continue;
        }
        if !evaluate_conditions(&policy.conditions, req) {
            continue;
        }

        let allowed = policy.effect == PolicyEffect::Allow;
        return (
            allowed,
            format!(
                "Policy '{}' (priority {}) {} access",
                policy.name, policy.priority,
                if allowed { "granted" } else { "denied" }
            ),
            Some(policy.id.clone()),
        );
    }

    (false, "No matching policy found; default deny".into(), None)
}

fn matches_subject(matchers: &[SubjectMatcher], roles: &[String], subject_id: &str) -> bool {
    matchers.iter().any(|m| {
        match m.subject_type.as_str() {
            "role" => {
                m.value == "*" || roles.iter().any(|r| r == &m.value)
            }
            "user" => m.value == subject_id || m.value == "*",
            _ => m.value == "*",
        }
    })
}

fn matches_resource(patterns: &[String], resource: &str) -> bool {
    patterns.iter().any(|p| {
        if p == "*" {
            return true;
        }
        if p.ends_with(":*") {
            let prefix = &p[..p.len() - 1];
            return resource.starts_with(prefix) || resource == &p[..p.len() - 2];
        }
        p == resource
    })
}

fn matches_action(patterns: &[String], action: &str) -> bool {
    patterns.iter().any(|p| p == "*" || p == action)
}

fn evaluate_conditions(conditions: &[Condition], req: &AccessRequest) -> bool {
    if conditions.is_empty() {
        return true;
    }
    let ctx = req.context.as_ref().cloned().unwrap_or(serde_json::json!({}));

    conditions.iter().all(|c| evaluate_single_condition(c, &ctx))
}

fn evaluate_single_condition(condition: &Condition, ctx: &serde_json::Value) -> bool {
    let field_value = ctx.get(&condition.field);

    match &condition.operator {
        ConditionOp::Equals => {
            field_value.map_or(false, |v| v == &condition.value)
        }
        ConditionOp::NotEquals => {
            field_value.map_or(true, |v| v != &condition.value)
        }
        ConditionOp::GreaterThan => {
            match (field_value.and_then(|v| v.as_f64()), condition.value.as_f64()) {
                (Some(a), Some(b)) => a > b,
                _ => false,
            }
        }
        ConditionOp::LessThan => {
            match (field_value.and_then(|v| v.as_f64()), condition.value.as_f64()) {
                (Some(a), Some(b)) => a < b,
                _ => false,
            }
        }
        ConditionOp::In => {
            if let Some(arr) = condition.value.as_array() {
                field_value.map_or(false, |v| arr.contains(v))
            } else {
                false
            }
        }
        ConditionOp::NotIn => {
            if let Some(arr) = condition.value.as_array() {
                field_value.map_or(true, |v| !arr.contains(v))
            } else {
                true
            }
        }
        ConditionOp::Contains => {
            match (field_value.and_then(|v| v.as_str()), condition.value.as_str()) {
                (Some(hay), Some(needle)) => hay.contains(needle),
                _ => false,
            }
        }
        ConditionOp::StartsWith => {
            match (field_value.and_then(|v| v.as_str()), condition.value.as_str()) {
                (Some(hay), Some(prefix)) => hay.starts_with(prefix),
                _ => false,
            }
        }
        ConditionOp::IpRange => {
            // Simplified IP range check (CIDR)
            match (field_value.and_then(|v| v.as_str()), condition.value.as_str()) {
                (Some(ip), Some(cidr)) => ip_in_cidr(ip, cidr),
                _ => false,
            }
        }
        ConditionOp::TimeRange => {
            // Check if current hour is within range
            let now_hour = chrono::Utc::now().hour();
            if let Some(arr) = condition.value.as_array() {
                arr.iter().filter_map(|v| v.as_u64()).any(|h| h as u32 == now_hour)
            } else {
                false
            }
        }
        ConditionOp::GeoFence => {
            // Check if geo_region is in allowed list
            if let Some(arr) = condition.value.as_array() {
                field_value.map_or(false, |v| arr.contains(v))
            } else {
                false
            }
        }
    }
}

fn ip_in_cidr(ip: &str, cidr: &str) -> bool {
    let parts: Vec<&str> = cidr.split('/').collect();
    if parts.len() != 2 {
        return ip == cidr;
    }
    let cidr_ip = parts[0];
    let prefix_len: u32 = parts[1].parse().unwrap_or(32);

    match (parse_ipv4(ip), parse_ipv4(cidr_ip)) {
        (Some(ip_num), Some(cidr_num)) => {
            if prefix_len >= 32 {
                return ip_num == cidr_num;
            }
            let mask = !((1u32 << (32 - prefix_len)) - 1);
            (ip_num & mask) == (cidr_num & mask)
        }
        _ => false,
    }
}

fn parse_ipv4(ip: &str) -> Option<u32> {
    let octets: Vec<u8> = ip.split('.').filter_map(|o| o.parse().ok()).collect();
    if octets.len() != 4 {
        return None;
    }
    Some(
        (octets[0] as u32) << 24
            | (octets[1] as u32) << 16
            | (octets[2] as u32) << 8
            | (octets[3] as u32),
    )
}

use chrono::Timelike;
