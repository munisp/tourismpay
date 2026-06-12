//! Africa-first GDS Property Registry & Rate Engine (Rust)
//!
//! High-performance property content aggregation for African tourism properties.
//! Handles: property indexing, content normalization, real-time rate caching,
//! rate parity monitoring, and bedbank integration.
//!
//! Middleware: Redis (rate cache), OpenSearch (search), Kafka (events),
//! PostgreSQL (persistence), Permify (access control)

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// African country codes supported by the GDS
pub const AFRICAN_COUNTRIES: &[(&str, &str)] = &[
    ("KE", "Kenya"),
    ("ZA", "South Africa"),
    ("NG", "Nigeria"),
    ("GH", "Ghana"),
    ("TZ", "Tanzania"),
    ("UG", "Uganda"),
    ("RW", "Rwanda"),
    ("ET", "Ethiopia"),
    ("MA", "Morocco"),
    ("EG", "Egypt"),
    ("TN", "Tunisia"),
    ("MU", "Mauritius"),
    ("SN", "Senegal"),
    ("CI", "Ivory Coast"),
    ("CM", "Cameroon"),
    ("ZW", "Zimbabwe"),
    ("BW", "Botswana"),
    ("NA", "Namibia"),
    ("MZ", "Mozambique"),
    ("MG", "Madagascar"),
];

/// Property content as ingested from various sources
#[derive(Debug, Clone)]
pub struct PropertyContent {
    pub property_id: String,
    pub name: String,
    pub description: String,
    pub property_type: PropertyType,
    pub country_code: String,
    pub region: String,
    pub city: String,
    pub latitude: f64,
    pub longitude: f64,
    pub star_rating: u8,
    pub amenities: Vec<String>,
    pub images: Vec<PropertyImage>,
    pub room_types: Vec<RoomTypeContent>,
    pub policies: PropertyPolicies,
    pub chain_affiliation: Option<ChainInfo>,
    pub source: ContentSource,
    pub last_updated: u64,
}

#[derive(Debug, Clone)]
pub enum PropertyType {
    Hotel,
    Lodge,
    SafariCamp,
    Resort,
    BoutiqueHotel,
    Guesthouse,
    Villa,
    Apartment,
    Hostel,
    TentedCamp,
    TreeHouse,
    Houseboat,
    ActivityProvider,
    Restaurant,
    TransportService,
}

#[derive(Debug, Clone)]
pub struct PropertyImage {
    pub url: String,
    pub caption: String,
    pub category: String, // exterior, room, dining, pool, etc.
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone)]
pub struct RoomTypeContent {
    pub code: String,
    pub name: String,
    pub description: String,
    pub max_occupancy: u8,
    pub bed_configuration: String,
    pub size_sqm: f32,
    pub amenities: Vec<String>,
    pub images: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct PropertyPolicies {
    pub check_in_time: String,
    pub check_out_time: String,
    pub cancellation_policy: CancellationPolicy,
    pub child_policy: String,
    pub pet_policy: String,
    pub accepted_payments: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum CancellationPolicy {
    FreeCancellation { deadline_hours: u32 },
    NonRefundable,
    PartialRefund { percentage: u8, deadline_hours: u32 },
}

#[derive(Debug, Clone)]
pub struct ChainInfo {
    pub chain_code: String,
    pub chain_name: String,
    pub brand: Option<String>,
}

#[derive(Debug, Clone)]
pub enum ContentSource {
    Direct,           // Property uploaded directly
    Bedbank(String),  // Hotelbeds, WebBeds, etc.
    PMS(String),      // Opera, Mews, etc.
    OTA(String),      // Booking.com, Expedia affiliate
    TourismBoard(String), // National tourism board feed
    Scraper(String),  // Curated scrape (with permission)
}

/// Real-time rate entry for the rate cache
#[derive(Debug, Clone)]
pub struct RateEntry {
    pub property_id: String,
    pub room_type_code: String,
    pub rate_plan_code: String,
    pub date: String, // YYYY-MM-DD
    pub rate: f64,
    pub currency: String,
    pub meal_plan: MealPlan,
    pub available_rooms: u16,
    pub min_stay: u8,
    pub closed_to_arrival: bool,
    pub stop_sell: bool,
    pub last_updated: u64,
}

#[derive(Debug, Clone)]
pub enum MealPlan {
    RoomOnly,       // RO
    BedBreakfast,   // BB
    HalfBoard,      // HB
    FullBoard,      // FB
    AllInclusive,   // AI
    SelfCatering,   // SC
}

/// Rate parity alert when prices differ across distribution channels
#[derive(Debug, Clone)]
pub struct ParityAlert {
    pub property_id: String,
    pub room_type_code: String,
    pub date: String,
    pub gds_rate: f64,
    pub channel_name: String,
    pub channel_rate: f64,
    pub variance_pct: f64,
    pub severity: ParitySeverity,
    pub detected_at: u64,
}

#[derive(Debug, Clone)]
pub enum ParitySeverity {
    Info,     // < 2% variance
    Warning,  // 2-5% variance
    Critical, // > 5% variance
}

/// The GDS Property Registry — manages African property content and rates
pub struct PropertyRegistry {
    properties: HashMap<String, PropertyContent>,
    rate_cache: HashMap<String, Vec<RateEntry>>, // property_id -> rates
    parity_alerts: Vec<ParityAlert>,
    supported_currencies: Vec<(&'static str, &'static str)>,
}

impl PropertyRegistry {
    pub fn new() -> Self {
        Self {
            properties: HashMap::new(),
            rate_cache: HashMap::new(),
            parity_alerts: Vec::new(),
            supported_currencies: vec![
                ("USD", "US Dollar"),
                ("EUR", "Euro"),
                ("GBP", "British Pound"),
                ("NGN", "Nigerian Naira"),
                ("KES", "Kenyan Shilling"),
                ("ZAR", "South African Rand"),
                ("GHS", "Ghanaian Cedi"),
                ("TZS", "Tanzanian Shilling"),
                ("UGX", "Ugandan Shilling"),
                ("RWF", "Rwandan Franc"),
                ("ETB", "Ethiopian Birr"),
                ("MAD", "Moroccan Dirham"),
                ("EGP", "Egyptian Pound"),
                ("MUR", "Mauritian Rupee"),
                ("XOF", "West African CFA"),
                ("XAF", "Central African CFA"),
            ],
        }
    }

    /// Register a new property in the GDS
    pub fn register_property(&mut self, content: PropertyContent) -> Result<String, RegistryError> {
        // Validate country
        if !AFRICAN_COUNTRIES.iter().any(|(code, _)| *code == content.country_code) {
            return Err(RegistryError::InvalidCountry(content.country_code.clone()));
        }

        // Validate room types
        if content.room_types.is_empty() {
            return Err(RegistryError::NoRoomTypes);
        }

        let id = content.property_id.clone();
        self.properties.insert(id.clone(), content);

        Ok(id)
    }

    /// Update rates for a property (bulk)
    pub fn update_rates(&mut self, property_id: &str, rates: Vec<RateEntry>) -> Result<usize, RegistryError> {
        if !self.properties.contains_key(property_id) {
            return Err(RegistryError::PropertyNotFound(property_id.to_string()));
        }

        let count = rates.len();
        self.rate_cache.insert(property_id.to_string(), rates);

        Ok(count)
    }

    /// Get rates for a property and date range
    pub fn get_rates(&self, property_id: &str, room_type: &str, date_from: &str, date_to: &str) -> Vec<&RateEntry> {
        match self.rate_cache.get(property_id) {
            Some(rates) => rates
                .iter()
                .filter(|r| {
                    r.room_type_code == room_type
                        && r.date >= date_from.to_string()
                        && r.date <= date_to.to_string()
                        && !r.stop_sell
                })
                .collect(),
            None => Vec::new(),
        }
    }

    /// Check rate parity across channels
    pub fn check_parity(&mut self, property_id: &str, room_type: &str, date: &str, channel_name: &str, channel_rate: f64) -> Option<ParityAlert> {
        let gds_rates = self.get_rates(property_id, room_type, date, date);
        if gds_rates.is_empty() {
            return None;
        }

        let gds_rate = gds_rates[0].rate;
        let variance = ((channel_rate - gds_rate) / gds_rate * 100.0).abs();

        let severity = if variance < 2.0 {
            return None; // within tolerance
        } else if variance < 5.0 {
            ParitySeverity::Warning
        } else {
            ParitySeverity::Critical
        };

        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::ZERO).as_secs();

        let alert = ParityAlert {
            property_id: property_id.to_string(),
            room_type_code: room_type.to_string(),
            date: date.to_string(),
            gds_rate,
            channel_name: channel_name.to_string(),
            channel_rate,
            variance_pct: variance,
            severity,
            detected_at: now,
        };

        self.parity_alerts.push(alert.clone());
        Some(alert)
    }

    /// Search properties by criteria
    pub fn search(&self, country: Option<&str>, property_type: Option<&PropertyType>, max_results: usize) -> Vec<&PropertyContent> {
        self.properties
            .values()
            .filter(|p| {
                if let Some(c) = country {
                    if p.country_code != c {
                        return false;
                    }
                }
                true
            })
            .take(max_results)
            .collect()
    }

    /// Get total property count by country
    pub fn count_by_country(&self) -> HashMap<&str, usize> {
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for p in self.properties.values() {
            *counts.entry(p.country_code.as_str()).or_insert(0) += 1;
        }
        counts
    }

    /// Get all active parity alerts
    pub fn get_parity_alerts(&self, severity: Option<&ParitySeverity>) -> &[ParityAlert] {
        &self.parity_alerts
    }

    /// Get registry statistics
    pub fn stats(&self) -> RegistryStats {
        RegistryStats {
            total_properties: self.properties.len(),
            total_countries: self.count_by_country().len(),
            total_rate_entries: self.rate_cache.values().map(|v| v.len()).sum(),
            parity_alerts: self.parity_alerts.len(),
            supported_currencies: self.supported_currencies.len(),
        }
    }
}

#[derive(Debug)]
pub struct RegistryStats {
    pub total_properties: usize,
    pub total_countries: usize,
    pub total_rate_entries: usize,
    pub parity_alerts: usize,
    pub supported_currencies: usize,
}

#[derive(Debug)]
pub enum RegistryError {
    InvalidCountry(String),
    PropertyNotFound(String),
    NoRoomTypes,
    RateConflict(String),
    ContentValidation(String),
}

impl std::fmt::Display for RegistryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidCountry(c) => write!(f, "Invalid African country code: {}", c),
            Self::PropertyNotFound(id) => write!(f, "Property not found: {}", id),
            Self::NoRoomTypes => write!(f, "Property must have at least one room type"),
            Self::RateConflict(msg) => write!(f, "Rate conflict: {}", msg),
            Self::ContentValidation(msg) => write!(f, "Content validation failed: {}", msg),
        }
    }
}

impl std::error::Error for RegistryError {}

/// Bedbank connector for content aggregation
pub struct BedbankConnector {
    pub provider: String,
    pub api_base: String,
    pub api_key: String,
    pub properties_synced: usize,
}

impl BedbankConnector {
    pub fn hotelbeds(api_key: &str) -> Self {
        Self {
            provider: "Hotelbeds".to_string(),
            api_base: "https://api.test.hotelbeds.com/hotel-content-api/1.0".to_string(),
            api_key: api_key.to_string(),
            properties_synced: 0,
        }
    }

    pub fn webbeds(api_key: &str) -> Self {
        Self {
            provider: "WebBeds".to_string(),
            api_base: "https://api.webbeds.com/v2".to_string(),
            api_key: api_key.to_string(),
            properties_synced: 0,
        }
    }

    pub fn bonotel(api_key: &str) -> Self {
        Self {
            provider: "Bonotel".to_string(),
            api_base: "https://api.bonotel.com/v1".to_string(),
            api_key: api_key.to_string(),
            properties_synced: 0,
        }
    }
}

/// Tourism board data feed connector
pub struct TourismBoardFeed {
    pub board_name: String,
    pub country_code: String,
    pub feed_url: String,
    pub format: FeedFormat,
    pub last_sync: Option<u64>,
}

#[derive(Debug, Clone)]
pub enum FeedFormat {
    Json,
    Xml,
    Csv,
    OpenTravel,
}

impl TourismBoardFeed {
    pub fn kenya_tourism() -> Self {
        Self {
            board_name: "Kenya Tourism Board".to_string(),
            country_code: "KE".to_string(),
            feed_url: "https://api.magicalkenya.com/properties/v1".to_string(),
            format: FeedFormat::Json,
            last_sync: None,
        }
    }

    pub fn south_africa_tourism() -> Self {
        Self {
            board_name: "South African Tourism".to_string(),
            country_code: "ZA".to_string(),
            feed_url: "https://api.southafrica.net/accommodation/feed".to_string(),
            format: FeedFormat::Json,
            last_sync: None,
        }
    }

    pub fn tanzania_tourism() -> Self {
        Self {
            board_name: "Tanzania Tourist Board".to_string(),
            country_code: "TZ".to_string(),
            feed_url: "https://tanzaniatourism.go.tz/api/establishments".to_string(),
            format: FeedFormat::Xml,
            last_sync: None,
        }
    }

    pub fn rwanda_development() -> Self {
        Self {
            board_name: "Rwanda Development Board".to_string(),
            country_code: "RW".to_string(),
            feed_url: "https://rdb.rw/tourism/api/properties".to_string(),
            format: FeedFormat::Json,
            last_sync: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_property() {
        let mut registry = PropertyRegistry::new();
        let content = PropertyContent {
            property_id: "prop_test_001".to_string(),
            name: "Serena Safari Lodge".to_string(),
            description: "Luxury safari lodge in Masai Mara".to_string(),
            property_type: PropertyType::Lodge,
            country_code: "KE".to_string(),
            region: "Rift Valley".to_string(),
            city: "Masai Mara".to_string(),
            latitude: -1.5,
            longitude: 35.1,
            star_rating: 5,
            amenities: vec!["pool".to_string(), "spa".to_string(), "game_drive".to_string()],
            images: vec![],
            room_types: vec![RoomTypeContent {
                code: "DLX".to_string(),
                name: "Deluxe Tent".to_string(),
                description: "Luxury tented accommodation".to_string(),
                max_occupancy: 3,
                bed_configuration: "King".to_string(),
                size_sqm: 45.0,
                amenities: vec![],
                images: vec![],
            }],
            policies: PropertyPolicies {
                check_in_time: "14:00".to_string(),
                check_out_time: "10:00".to_string(),
                cancellation_policy: CancellationPolicy::FreeCancellation { deadline_hours: 48 },
                child_policy: "Children 5+ welcome".to_string(),
                pet_policy: "No pets".to_string(),
                accepted_payments: vec!["visa".to_string(), "mpesa".to_string()],
            },
            chain_affiliation: Some(ChainInfo {
                chain_code: "SER".to_string(),
                chain_name: "Serena Hotels".to_string(),
                brand: None,
            }),
            source: ContentSource::Direct,
            last_updated: 1700000000,
        };

        let result = registry.register_property(content);
        assert!(result.is_ok());
        assert_eq!(registry.stats().total_properties, 1);
    }

    #[test]
    fn test_invalid_country() {
        let mut registry = PropertyRegistry::new();
        let content = PropertyContent {
            property_id: "prop_bad".to_string(),
            name: "Test".to_string(),
            description: "".to_string(),
            property_type: PropertyType::Hotel,
            country_code: "US".to_string(), // Not African
            region: "".to_string(),
            city: "".to_string(),
            latitude: 0.0,
            longitude: 0.0,
            star_rating: 3,
            amenities: vec![],
            images: vec![],
            room_types: vec![RoomTypeContent {
                code: "STD".to_string(),
                name: "Standard".to_string(),
                description: "".to_string(),
                max_occupancy: 2,
                bed_configuration: "Twin".to_string(),
                size_sqm: 20.0,
                amenities: vec![],
                images: vec![],
            }],
            policies: PropertyPolicies {
                check_in_time: "14:00".to_string(),
                check_out_time: "11:00".to_string(),
                cancellation_policy: CancellationPolicy::NonRefundable,
                child_policy: "".to_string(),
                pet_policy: "".to_string(),
                accepted_payments: vec![],
            },
            chain_affiliation: None,
            source: ContentSource::Direct,
            last_updated: 0,
        };

        let result = registry.register_property(content);
        assert!(result.is_err());
    }

    #[test]
    fn test_rate_parity() {
        let mut registry = PropertyRegistry::new();

        // Register property first
        let content = PropertyContent {
            property_id: "prop_parity_test".to_string(),
            name: "Test Hotel".to_string(),
            description: "".to_string(),
            property_type: PropertyType::Hotel,
            country_code: "KE".to_string(),
            region: "".to_string(),
            city: "Nairobi".to_string(),
            latitude: -1.28,
            longitude: 36.82,
            star_rating: 4,
            amenities: vec![],
            images: vec![],
            room_types: vec![RoomTypeContent {
                code: "STD".to_string(),
                name: "Standard".to_string(),
                description: "".to_string(),
                max_occupancy: 2,
                bed_configuration: "Double".to_string(),
                size_sqm: 25.0,
                amenities: vec![],
                images: vec![],
            }],
            policies: PropertyPolicies {
                check_in_time: "14:00".to_string(),
                check_out_time: "11:00".to_string(),
                cancellation_policy: CancellationPolicy::FreeCancellation { deadline_hours: 24 },
                child_policy: "".to_string(),
                pet_policy: "".to_string(),
                accepted_payments: vec![],
            },
            chain_affiliation: None,
            source: ContentSource::Direct,
            last_updated: 0,
        };
        registry.register_property(content).unwrap();

        // Set GDS rate
        let rates = vec![RateEntry {
            property_id: "prop_parity_test".to_string(),
            room_type_code: "STD".to_string(),
            rate_plan_code: "BAR".to_string(),
            date: "2025-03-15".to_string(),
            rate: 150.0,
            currency: "USD".to_string(),
            meal_plan: MealPlan::BedBreakfast,
            available_rooms: 5,
            min_stay: 1,
            closed_to_arrival: false,
            stop_sell: false,
            last_updated: 0,
        }];
        registry.update_rates("prop_parity_test", rates).unwrap();

        // Check parity — 10% variance should trigger critical alert
        let alert = registry.check_parity("prop_parity_test", "STD", "2025-03-15", "Expedia", 165.0);
        assert!(alert.is_some());
    }
}
