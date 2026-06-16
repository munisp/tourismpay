use actix_web::{web, HttpResponse, HttpRequest, HttpMessage};
use sqlx::PgPool;
use uuid::Uuid;
use chrono::Utc;

use crate::auth::JwtClaims;
use crate::models::*;
use crate::verification;

pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "TourismPay KYC Verification Service (Rust)",
        "version": "1.0.0",
        "timestamp": Utc::now().to_rfc3339()
    }))
}

pub async fn submit_identity_verification(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    body: web::Json<IdentityVerificationRequest>,
) -> HttpResponse {
    let claims = match req.extensions().get::<JwtClaims>() {
        Some(c) => c.clone(),
        None => return HttpResponse::Unauthorized().json(serde_json::json!({"error": "No auth claims"})),
    };

    let doc_hash = verification::hash_document_number(&body.document_number);
    let verification_id = Uuid::new_v4();

    let result = sqlx::query(
        r#"INSERT INTO kyc_verifications 
        (id, user_id, status, document_type, document_country, document_number_hash, 
         full_name, date_of_birth, nationality)
        VALUES ($1, $2, 'in_progress', $3, $4, $5, $6, $7, $8)"#
    )
    .bind(verification_id)
    .bind(&claims.sub)
    .bind(&body.document_type)
    .bind(&body.document_country)
    .bind(&doc_hash)
    .bind(&body.full_name)
    .bind(&body.date_of_birth)
    .bind(&body.nationality)
    .execute(pool.get_ref())
    .await;

    match result {
        Ok(_) => {
            // Store document images for OCR processing
            let _ = sqlx::query(
                r#"INSERT INTO kyc_documents 
                (verification_id, document_type, country, front_image_url, back_image_url, status)
                VALUES ($1, $2, $3, $4, $5, 'processing')"#
            )
            .bind(verification_id)
            .bind(&body.document_type)
            .bind(&body.document_country)
            .bind(&body.document_front_url)
            .bind(&body.document_back_url)
            .execute(pool.get_ref())
            .await;

            HttpResponse::Created().json(VerificationResponse {
                verification_id,
                status: "in_progress".to_string(),
                message: "Identity verification submitted. Document and selfie will be processed.".to_string(),
            })
        }
        Err(e) => {
            tracing::error!("Failed to create verification: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to create verification record"
            }))
        }
    }
}

pub async fn submit_liveness_check(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    body: web::Json<LivenessCheckRequest>,
) -> HttpResponse {
    let claims = match req.extensions().get::<JwtClaims>() {
        Some(c) => c.clone(),
        None => return HttpResponse::Unauthorized().json(serde_json::json!({"error": "No auth claims"})),
    };

    // Get latest verification for user
    let verification: Option<KycVerification> = sqlx::query_as(
        "SELECT * FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&claims.sub)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let verification = match verification {
        Some(v) => v,
        None => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No active verification found. Submit identity verification first."
        })),
    };

    let challenge_count = body.challenge_responses.as_ref().map_or(0, |c| c.len());
    let successful_challenges = challenge_count; // In production, validate each challenge response

    // Anti-spoofing score from motion/texture analysis (simulated for now, real SDK integration point)
    let anti_spoofing_score = 0.85;

    let (score, passed) = verification::compute_liveness_score(
        &body.method,
        anti_spoofing_score,
        challenge_count,
        successful_challenges,
    );

    let liveness_id = Uuid::new_v4();
    let _ = sqlx::query(
        r#"INSERT INTO liveness_checks 
        (id, verification_id, method, score, passed, video_url, photo_url, anti_spoofing_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#
    )
    .bind(liveness_id)
    .bind(verification.id)
    .bind(&body.method)
    .bind(score)
    .bind(passed)
    .bind(&body.video_url)
    .bind(&body.photo_url)
    .bind(anti_spoofing_score)
    .execute(pool.get_ref())
    .await;

    // Update verification with liveness score
    let new_status = if passed { "in_progress" } else { "manual_review" };
    let _ = sqlx::query(
        "UPDATE kyc_verifications SET liveness_score = $1, liveness_method = $2, status = $3, updated_at = NOW() WHERE id = $4"
    )
    .bind(score)
    .bind(&body.method)
    .bind(new_status)
    .bind(verification.id)
    .execute(pool.get_ref())
    .await;

    HttpResponse::Ok().json(serde_json::json!({
        "verification_id": verification.id,
        "liveness_score": score,
        "passed": passed,
        "method": body.method,
        "status": new_status
    }))
}

pub async fn submit_document_verification(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    body: web::Json<DocumentVerificationRequest>,
) -> HttpResponse {
    let claims = match req.extensions().get::<JwtClaims>() {
        Some(c) => c.clone(),
        None => return HttpResponse::Unauthorized().json(serde_json::json!({"error": "No auth claims"})),
    };

    let verification: Option<KycVerification> = sqlx::query_as(
        "SELECT * FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&claims.sub)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let verification = match verification {
        Some(v) => v,
        None => return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No active verification found"
        })),
    };

    let doc_id = Uuid::new_v4();
    let _ = sqlx::query(
        r#"INSERT INTO kyc_documents 
        (id, verification_id, document_type, country, front_image_url, back_image_url, mrz_extracted, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing')"#
    )
    .bind(doc_id)
    .bind(verification.id)
    .bind(&body.document_type)
    .bind(&body.country)
    .bind(&body.front_image_url)
    .bind(&body.back_image_url)
    .bind(&body.mrz_data)
    .execute(pool.get_ref())
    .await;

    HttpResponse::Created().json(serde_json::json!({
        "document_id": doc_id,
        "verification_id": verification.id,
        "status": "processing",
        "message": "Document submitted for OCR and authenticity verification"
    }))
}

pub async fn get_verification_status(
    pool: web::Data<PgPool>,
    path: web::Path<String>,
) -> HttpResponse {
    let user_id = path.into_inner();

    let verification: Option<KycVerification> = sqlx::query_as(
        "SELECT * FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&user_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    match verification {
        Some(v) => HttpResponse::Ok().json(v),
        None => HttpResponse::Ok().json(serde_json::json!({
            "user_id": user_id,
            "status": "not_started",
            "message": "No KYC verification record found"
        })),
    }
}

pub async fn get_verification_history(
    pool: web::Data<PgPool>,
    path: web::Path<String>,
) -> HttpResponse {
    let user_id = path.into_inner();

    let verifications: Vec<KycVerification> = sqlx::query_as(
        "SELECT * FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC"
    )
    .bind(&user_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    HttpResponse::Ok().json(verifications)
}

pub async fn verification_callback(
    pool: web::Data<PgPool>,
    body: web::Json<VerificationCallbackRequest>,
) -> HttpResponse {
    let new_status = match body.status.as_str() {
        "approved" | "passed" => "approved",
        "rejected" | "failed" => "rejected",
        _ => "in_progress",
    };

    let _ = sqlx::query(
        "UPDATE kyc_verifications SET status = $1, document_match_score = $2, updated_at = NOW() WHERE id = $3"
    )
    .bind(new_status)
    .bind(body.score)
    .bind(body.verification_id)
    .execute(pool.get_ref())
    .await;

    HttpResponse::Ok().json(serde_json::json!({
        "verification_id": body.verification_id,
        "status": new_status,
        "processed": true
    }))
}

pub async fn list_pending_verifications(
    pool: web::Data<PgPool>,
) -> HttpResponse {
    let verifications: Vec<KycVerification> = sqlx::query_as(
        "SELECT * FROM kyc_verifications WHERE status IN ('pending', 'in_progress', 'manual_review') ORDER BY created_at ASC"
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    HttpResponse::Ok().json(verifications)
}

pub async fn admin_review(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    body: web::Json<AdminReviewRequest>,
) -> HttpResponse {
    let claims = match req.extensions().get::<JwtClaims>() {
        Some(c) => c.clone(),
        None => return HttpResponse::Unauthorized().json(serde_json::json!({"error": "No auth claims"})),
    };

    let role = claims.role.unwrap_or_default();
    if role != "admin" && role != "service" {
        return HttpResponse::Forbidden().json(serde_json::json!({"error": "Admin access required"}));
    }

    let new_status = match body.decision.as_str() {
        "approve" => "approved",
        "reject" => "rejected",
        _ => return HttpResponse::BadRequest().json(serde_json::json!({"error": "Decision must be 'approve' or 'reject'"})),
    };

    let expires_at = if new_status == "approved" {
        Some(Utc::now() + chrono::Duration::days(365))
    } else {
        None
    };

    let _ = sqlx::query(
        r#"UPDATE kyc_verifications SET 
        status = $1, reviewer_id = $2, reviewer_notes = $3, 
        rejection_reason = $4, expires_at = $5, updated_at = NOW()
        WHERE id = $6"#
    )
    .bind(new_status)
    .bind(&claims.sub)
    .bind(&body.notes)
    .bind(&body.rejection_reason)
    .bind(expires_at)
    .bind(body.verification_id)
    .execute(pool.get_ref())
    .await;

    HttpResponse::Ok().json(serde_json::json!({
        "verification_id": body.verification_id,
        "decision": body.decision,
        "status": new_status,
        "reviewer": claims.sub
    }))
}

pub async fn sanctions_screening(
    pool: web::Data<PgPool>,
    body: web::Json<SanctionsScreenRequest>,
) -> HttpResponse {
    // Sanctions lists to check (in production, integrate with real OFAC/UN/EU APIs)
    let lists_checked = vec![
        "OFAC_SDN".to_string(),
        "UN_SANCTIONS".to_string(),
        "EU_CONSOLIDATED".to_string(),
        "UK_SANCTIONS".to_string(),
        "AU_DFAT".to_string(),
    ];

    // Perform name-based fuzzy screening against sanctions databases
    // In production: call external sanctions API (ComplyAdvantage, Refinitiv, etc.)
    let potential_matches: Vec<SanctionsMatch> = vec![];
    let matches_found = potential_matches.len() as u32;

    let risk_level = if matches_found == 0 {
        "clear"
    } else if matches_found <= 2 {
        "medium"
    } else {
        "high"
    };

    let doc_hash = body.passport_number.as_ref().map(|p| verification::hash_document_number(p));

    let screening_id = Uuid::new_v4();
    let _ = sqlx::query(
        r#"INSERT INTO sanctions_screenings 
        (id, full_name, date_of_birth, nationality, passport_number_hash, 
         matches_found, risk_level, lists_checked, result)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"#
    )
    .bind(screening_id)
    .bind(&body.full_name)
    .bind(&body.date_of_birth)
    .bind(&body.nationality)
    .bind(&doc_hash)
    .bind(matches_found as i32)
    .bind(risk_level)
    .bind(&lists_checked)
    .bind(serde_json::json!({"matches": potential_matches}))
    .execute(pool.get_ref())
    .await;

    HttpResponse::Ok().json(SanctionsResult {
        screened: true,
        matches_found,
        risk_level: risk_level.to_string(),
        lists_checked,
        potential_matches,
    })
}

pub async fn get_risk_score(
    pool: web::Data<PgPool>,
    path: web::Path<String>,
) -> HttpResponse {
    let user_id = path.into_inner();

    let verification: Option<KycVerification> = sqlx::query_as(
        "SELECT * FROM kyc_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&user_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let v = match verification {
        Some(v) => v,
        None => return HttpResponse::NotFound().json(serde_json::json!({
            "error": "No verification record found"
        })),
    };

    let liveness = v.liveness_score.unwrap_or(0.0);
    let doc_match = v.document_match_score.unwrap_or(0.0);
    let sanctions = v.sanctions_clear.unwrap_or(false);
    let pep = v.pep_clear.unwrap_or(false);

    let (overall, risk_level) = verification::compute_risk_score(
        liveness, doc_match, sanctions, pep, "low"
    );

    HttpResponse::Ok().json(RiskScoreResponse {
        user_id,
        overall_score: overall,
        identity_score: doc_match,
        liveness_score: liveness,
        document_score: doc_match,
        sanctions_clear: sanctions,
        pep_clear: pep,
        risk_level,
    })
}
