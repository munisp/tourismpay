use fluvio::{Fluvio, RecordKey, TopicProducer, Offset};
use fluvio::metadata::topic::TopicSpec;
use fluvio_smartmodule::{smartmodule, Result, Record, RecordData};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FraudDetectionEvent {
    pub event_id: String,
    pub timestamp: DateTime<Utc>,
    pub transaction_id: String,
    pub customer_id: String,
    pub amount: f64,
    pub currency: String,
    pub risk_score: f64,
    pub fraud_indicators: Vec<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealTimeAnalyticsEvent {
    pub event_id: String,
    pub timestamp: DateTime<Utc>,
    pub metric_name: String,
    pub metric_value: f64,
    pub dimensions: HashMap<String, String>,
    pub aggregation_window: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeospatialEvent {
    pub event_id: String,
    pub timestamp: DateTime<Utc>,
    pub latitude: f64,
    pub longitude: f64,
    pub event_type: String,
    pub properties: HashMap<String, String>,
}

pub struct FluvioStreamingService {
    fluvio: Arc<Fluvio>,
    producers: Arc<RwLock<HashMap<String, TopicProducer>>>,
}

impl FluvioStreamingService {
    pub async fn new() -> Result<Self> {
        let fluvio = Fluvio::connect().await?;
        
        Ok(Self {
            fluvio: Arc::new(fluvio),
            producers: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    pub async fn create_topic(&self, topic_name: &str, partitions: i32, replication: i32) -> Result<()> {
        let admin = self.fluvio.admin().await;
        
        let topic_spec = TopicSpec::new_computed(partitions, replication, None);
        
        admin.create(topic_name.to_string(), false, topic_spec).await?;
        
        println!("Created Fluvio topic: {}", topic_name);
        Ok(())
    }

    pub async fn get_producer(&self, topic: &str) -> Result<TopicProducer> {
        let mut producers = self.producers.write().await;
        
        if let Some(producer) = producers.get(topic) {
            return Ok(producer.clone());
        }

        let producer = self.fluvio.topic_producer(topic).await?;
        producers.insert(topic.to_string(), producer.clone());
        
        Ok(producer)
    }

    pub async fn publish_fraud_detection_event(&self, event: FraudDetectionEvent) -> Result<()> {
        let producer = self.get_producer("fraud-detection-realtime").await?;
        
        let event_json = serde_json::to_string(&event)?;
        
        producer.send(RecordKey::NULL, event_json).await?;
        
        println!("Published fraud detection event: {}", event.event_id);
        Ok(())
    }

    pub async fn publish_analytics_event(&self, event: RealTimeAnalyticsEvent) -> Result<()> {
        let producer = self.get_producer("analytics-realtime").await?;
        
        let event_json = serde_json::to_string(&event)?;
        
        producer.send(RecordKey::NULL, event_json).await?;
        
        Ok(())
    }

    pub async fn publish_geospatial_event(&self, event: GeospatialEvent) -> Result<()> {
        let producer = self.get_producer("geospatial-events").await?;
        
        let event_json = serde_json::to_string(&event)?;
        
        producer.send(RecordKey::NULL, event_json).await?;
        
        Ok(())
    }

    pub async fn consume_with_smartmodule<F>(&self, topic: &str, smartmodule: &str, handler: F) -> Result<()>
    where
        F: Fn(String) -> Result<()> + Send + Sync + 'static,
    {
        let consumer = self.fluvio
            .consumer_with_config(
                fluvio::consumer::ConsumerConfigExtBuilder::default()
                    .topic(topic)
                    .smartmodule(Some(smartmodule.to_string()))
                    .build()?,
            )
            .await?;

        let mut stream = consumer.stream(Offset::end()).await?;

        while let Some(Ok(record)) = stream.next().await {
            let value = String::from_utf8_lossy(record.value()).to_string();
            handler(value)?;
        }

        Ok(())
    }

    pub async fn setup_fraud_detection_pipeline(&self) -> Result<()> {
        self.create_topic("fraud-detection-realtime", 10, 3).await?;
        self.create_topic("fraud-detection-high-risk", 5, 3).await?;
        self.create_topic("fraud-detection-alerts", 3, 3).await?;
        
        println!("Fraud detection pipeline setup complete");
        Ok(())
    }

    pub async fn setup_analytics_pipeline(&self) -> Result<()> {
        self.create_topic("analytics-realtime", 20, 3).await?;
        self.create_topic("analytics-aggregated", 10, 3).await?;
        self.create_topic("analytics-insights", 5, 3).await?;
        
        println!("Analytics pipeline setup complete");
        Ok(())
    }

    pub async fn setup_geospatial_pipeline(&self) -> Result<()> {
        self.create_topic("geospatial-events", 15, 3).await?;
        self.create_topic("geospatial-clusters", 5, 3).await?;
        self.create_topic("geospatial-risk-zones", 3, 3).await?;
        
        println!("Geospatial pipeline setup complete");
        Ok(())
    }
}

#[smartmodule(filter)]
pub fn fraud_filter(record: &Record) -> Result<bool> {
    let event: FraudDetectionEvent = serde_json::from_slice(record.value())?;
    
    Ok(event.risk_score > 0.7)
}

#[smartmodule(map)]
pub fn fraud_enrichment(record: &Record) -> Result<(Option<RecordData>, RecordData)> {
    let mut event: FraudDetectionEvent = serde_json::from_slice(record.value())?;
    
    if event.risk_score > 0.9 {
        event.fraud_indicators.push("CRITICAL_RISK".to_string());
    } else if event.risk_score > 0.7 {
        event.fraud_indicators.push("HIGH_RISK".to_string());
    }
    
    event.metadata.insert("enriched_at".to_string(), Utc::now().to_rfc3339());
    event.metadata.insert("enrichment_version".to_string(), "1.0".to_string());
    
    let enriched_json = serde_json::to_vec(&event)?;
    
    Ok((None, RecordData::from(enriched_json)))
}

#[smartmodule(aggregate)]
pub fn analytics_aggregation(accumulator: RecordData, record: &Record) -> Result<RecordData> {
    #[derive(Deserialize, Serialize)]
    struct Accumulator {
        count: u64,
        sum: f64,
        min: f64,
        max: f64,
    }
    
    let mut acc: Accumulator = if accumulator.is_empty() {
        Accumulator {
            count: 0,
            sum: 0.0,
            min: f64::MAX,
            max: f64::MIN,
        }
    } else {
        serde_json::from_slice(&accumulator)?
    };
    
    let event: RealTimeAnalyticsEvent = serde_json::from_slice(record.value())?;
    
    acc.count += 1;
    acc.sum += event.metric_value;
    acc.min = acc.min.min(event.metric_value);
    acc.max = acc.max.max(event.metric_value);
    
    let acc_json = serde_json::to_vec(&acc)?;
    
    Ok(RecordData::from(acc_json))
}

#[smartmodule(filter_map)]
pub fn geospatial_clustering(record: &Record) -> Result<Option<(Option<RecordData>, RecordData)>> {
    let event: GeospatialEvent = serde_json::from_slice(record.value())?;
    
    let nigeria_bounds = (
        (4.0, 14.0),
        (3.0, 15.0)
    );
    
    if event.latitude >= nigeria_bounds.0.0 && event.latitude <= nigeria_bounds.0.1 &&
       event.longitude >= nigeria_bounds.1.0 && event.longitude <= nigeria_bounds.1.1 {
        
        let cluster_id = calculate_cluster_id(event.latitude, event.longitude);
        
        let mut clustered_event = event.clone();
        clustered_event.properties.insert("cluster_id".to_string(), cluster_id);
        clustered_event.properties.insert("country".to_string(), "NG".to_string());
        
        let clustered_json = serde_json::to_vec(&clustered_event)?;
        
        Ok(Some((None, RecordData::from(clustered_json))))
    } else {
        Ok(None)
    }
}

fn calculate_cluster_id(lat: f64, lon: f64) -> String {
    let cluster_size = 0.5;
    let lat_cluster = (lat / cluster_size).floor() as i32;
    let lon_cluster = (lon / cluster_size).floor() as i32;
    
    format!("cluster_{}_{}", lat_cluster, lon_cluster)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fraud_detection_event() {
        let service = FluvioStreamingService::new().await.unwrap();
        
        let event = FraudDetectionEvent {
            event_id: "test-123".to_string(),
            timestamp: Utc::now(),
            transaction_id: "txn-456".to_string(),
            customer_id: "cust-789".to_string(),
            amount: 10000.0,
            currency: "NGN".to_string(),
            risk_score: 0.85,
            fraud_indicators: vec!["VELOCITY_CHECK_FAILED".to_string()],
            metadata: HashMap::new(),
        };
        
        service.publish_fraud_detection_event(event).await.unwrap();
    }
}
