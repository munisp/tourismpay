export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
// Wallet transactions above this USD-equivalent amount require biometric re-authentication
export const HIGH_VALUE_TX_THRESHOLD_USD = 1000;
// Impersonation: cookie that stores the original admin's session while impersonating
export const IMPERSONATION_COOKIE_NAME = "app_impersonation_session";
// Impersonation session duration: 2 hours
export const IMPERSONATION_SESSION_MS = 2 * 60 * 60 * 1000;
