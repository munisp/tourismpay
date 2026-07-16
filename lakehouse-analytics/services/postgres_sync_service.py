"""
Bi-directional PostgreSQL Sync Service for Lakehouse Analytics
Implements CDC (Change Data Capture) and write-back capabilities
"""

import asyncio
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from enum import Enum
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
import redis

logger = logging.getLogger(__name__)


class SyncDirection(str, Enum):
    POSTGRES_TO_LAKEHOUSE = "postgres_to_lakehouse"
    LAKEHOUSE_TO_POSTGRES = "lakehouse_to_postgres"
    BIDIRECTIONAL = "bidirectional"


class ChangeType(str, Enum):
    INSERT = "INSERT"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


@dataclass
class ChangeEvent:
    table_name: str
    change_type: ChangeType
    primary_key: Dict[str, Any]
    before: Optional[Dict[str, Any]]
    after: Optional[Dict[str, Any]]
    timestamp: str
    source: str
    lsn: Optional[str] = None


@dataclass
class SyncConfig:
    table_name: str
    primary_keys: List[str]
    sync_direction: SyncDirection
    lakehouse_path: str
    partition_columns: Optional[List[str]] = None
    incremental_column: Optional[str] = None
    soft_delete_column: Optional[str] = None
    transform_function: Optional[str] = None


class PostgresLakehouseSync:
    """
    Bi-directional sync service between PostgreSQL and Lakehouse (Iceberg/Delta Lake)
    """
    
    def __init__(
        self,
        postgres_config: Dict[str, Any],
        lakehouse_config: Dict[str, Any],
        redis_host: str = "redis",
        redis_port: int = 6379
    ):
        self.postgres_config = postgres_config
        self.lakehouse_config = lakehouse_config
        self.redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=5,
            decode_responses=True
        )
        self.sync_configs: Dict[str, SyncConfig] = {}
        self._setup_default_configs()
    
    def _setup_default_configs(self):
        """Setup default sync configurations for insurance tables"""
        default_configs = [
            SyncConfig(
                table_name="policies",
                primary_keys=["id"],
                sync_direction=SyncDirection.BIDIRECTIONAL,
                lakehouse_path="bronze/policies",
                partition_columns=["policy_type", "created_date"],
                incremental_column="updated_at"
            ),
            SyncConfig(
                table_name="claims",
                primary_keys=["id"],
                sync_direction=SyncDirection.BIDIRECTIONAL,
                lakehouse_path="bronze/claims",
                partition_columns=["claim_type", "incident_date"],
                incremental_column="updated_at"
            ),
            SyncConfig(
                table_name="customers",
                primary_keys=["id"],
                sync_direction=SyncDirection.POSTGRES_TO_LAKEHOUSE,
                lakehouse_path="bronze/customers",
                partition_columns=["customer_type"],
                incremental_column="updated_at"
            ),
            SyncConfig(
                table_name="payments",
                primary_keys=["id"],
                sync_direction=SyncDirection.POSTGRES_TO_LAKEHOUSE,
                lakehouse_path="bronze/payments",
                partition_columns=["payment_method", "created_date"],
                incremental_column="created_at"
            ),
            SyncConfig(
                table_name="risk_scores",
                primary_keys=["id"],
                sync_direction=SyncDirection.BIDIRECTIONAL,
                lakehouse_path="bronze/risk_scores",
                partition_columns=["risk_level"],
                incremental_column="calculated_at"
            ),
            SyncConfig(
                table_name="documents",
                primary_keys=["id"],
                sync_direction=SyncDirection.POSTGRES_TO_LAKEHOUSE,
                lakehouse_path="bronze/documents",
                partition_columns=["document_type", "verification_status"],
                incremental_column="updated_at"
            ),
            SyncConfig(
                table_name="aml_screenings",
                primary_keys=["id"],
                sync_direction=SyncDirection.POSTGRES_TO_LAKEHOUSE,
                lakehouse_path="bronze/aml_screenings",
                partition_columns=["risk_level", "status"],
                incremental_column="updated_at"
            ),
            SyncConfig(
                table_name="ml_predictions",
                primary_keys=["id"],
                sync_direction=SyncDirection.LAKEHOUSE_TO_POSTGRES,
                lakehouse_path="gold/ml_predictions",
                incremental_column="prediction_timestamp"
            ),
            SyncConfig(
                table_name="aggregated_metrics",
                primary_keys=["metric_id", "date"],
                sync_direction=SyncDirection.LAKEHOUSE_TO_POSTGRES,
                lakehouse_path="gold/aggregated_metrics",
                partition_columns=["metric_type", "date"]
            )
        ]
        
        for config in default_configs:
            self.sync_configs[config.table_name] = config
    
    def get_postgres_connection(self):
        """Get PostgreSQL connection"""
        return psycopg2.connect(
            host=self.postgres_config.get("host", "localhost"),
            port=self.postgres_config.get("port", 5432),
            database=self.postgres_config.get("database", "insurance"),
            user=self.postgres_config.get("user", "postgres"),
            password=self.postgres_config.get("password", "")
        )
    
    def get_last_sync_position(self, table_name: str, direction: str) -> Optional[str]:
        """Get last sync position from Redis"""
        key = f"sync:position:{table_name}:{direction}"
        return self.redis_client.get(key)
    
    def set_sync_position(self, table_name: str, direction: str, position: str):
        """Set sync position in Redis"""
        key = f"sync:position:{table_name}:{direction}"
        self.redis_client.set(key, position)
    
    async def sync_postgres_to_lakehouse(
        self,
        table_name: str,
        batch_size: int = 10000
    ) -> Dict[str, Any]:
        """
        Sync data from PostgreSQL to Lakehouse (Bronze layer)
        Uses incremental sync based on updated_at column
        """
        config = self.sync_configs.get(table_name)
        if not config:
            raise ValueError(f"No sync config for table: {table_name}")
        
        if config.sync_direction == SyncDirection.LAKEHOUSE_TO_POSTGRES:
            raise ValueError(f"Table {table_name} is configured for Lakehouse to Postgres only")
        
        last_position = self.get_last_sync_position(table_name, "to_lakehouse")
        
        conn = self.get_postgres_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            if config.incremental_column and last_position:
                query = f"""
                    SELECT * FROM {table_name}
                    WHERE {config.incremental_column} > %s
                    ORDER BY {config.incremental_column}
                    LIMIT %s
                """
                cursor.execute(query, (last_position, batch_size))
            else:
                query = f"""
                    SELECT * FROM {table_name}
                    ORDER BY {config.primary_keys[0]}
                    LIMIT %s
                """
                cursor.execute(query, (batch_size,))
            
            rows = cursor.fetchall()
            
            if not rows:
                return {"status": "no_changes", "rows_synced": 0}
            
            records = [dict(row) for row in rows]
            
            lakehouse_records = self._transform_for_lakehouse(records, config)
            
            write_result = await self._write_to_lakehouse(
                lakehouse_records,
                config.lakehouse_path,
                config.partition_columns
            )
            
            if config.incremental_column and records:
                last_record = records[-1]
                new_position = str(last_record.get(config.incremental_column))
                self.set_sync_position(table_name, "to_lakehouse", new_position)
            
            return {
                "status": "success",
                "rows_synced": len(records),
                "lakehouse_path": config.lakehouse_path,
                "last_position": new_position if config.incremental_column else None
            }
            
        finally:
            cursor.close()
            conn.close()
    
    async def sync_lakehouse_to_postgres(
        self,
        table_name: str,
        batch_size: int = 1000
    ) -> Dict[str, Any]:
        """
        Sync data from Lakehouse (Gold layer) back to PostgreSQL
        Used for ML predictions and aggregated metrics
        """
        config = self.sync_configs.get(table_name)
        if not config:
            raise ValueError(f"No sync config for table: {table_name}")
        
        if config.sync_direction == SyncDirection.POSTGRES_TO_LAKEHOUSE:
            raise ValueError(f"Table {table_name} is configured for Postgres to Lakehouse only")
        
        last_position = self.get_last_sync_position(table_name, "to_postgres")
        
        lakehouse_records = await self._read_from_lakehouse(
            config.lakehouse_path,
            config.incremental_column,
            last_position,
            batch_size
        )
        
        if not lakehouse_records:
            return {"status": "no_changes", "rows_synced": 0}
        
        postgres_records = self._transform_for_postgres(lakehouse_records, config)
        
        conn = self.get_postgres_connection()
        cursor = conn.cursor()
        
        try:
            upserted = 0
            for record in postgres_records:
                columns = list(record.keys())
                values = list(record.values())
                
                placeholders = ", ".join(["%s"] * len(values))
                column_names = ", ".join(columns)
                
                update_clause = ", ".join([
                    f"{col} = EXCLUDED.{col}" 
                    for col in columns 
                    if col not in config.primary_keys
                ])
                
                pk_columns = ", ".join(config.primary_keys)
                
                query = f"""
                    INSERT INTO {table_name} ({column_names})
                    VALUES ({placeholders})
                    ON CONFLICT ({pk_columns})
                    DO UPDATE SET {update_clause}
                """
                
                cursor.execute(query, values)
                upserted += 1
            
            conn.commit()
            
            if config.incremental_column and lakehouse_records:
                last_record = lakehouse_records[-1]
                new_position = str(last_record.get(config.incremental_column))
                self.set_sync_position(table_name, "to_postgres", new_position)
            
            return {
                "status": "success",
                "rows_synced": upserted,
                "table_name": table_name
            }
            
        except Exception as e:
            conn.rollback()
            raise
        finally:
            cursor.close()
            conn.close()
    
    def _transform_for_lakehouse(
        self,
        records: List[Dict[str, Any]],
        config: SyncConfig
    ) -> List[Dict[str, Any]]:
        """Transform PostgreSQL records for Lakehouse storage"""
        transformed = []
        
        for record in records:
            lakehouse_record = {}
            
            for key, value in record.items():
                if isinstance(value, datetime):
                    lakehouse_record[key] = value.isoformat()
                elif isinstance(value, (dict, list)):
                    lakehouse_record[key] = json.dumps(value)
                else:
                    lakehouse_record[key] = value
            
            lakehouse_record["_sync_timestamp"] = datetime.utcnow().isoformat()
            lakehouse_record["_source"] = "postgres"
            
            if config.partition_columns:
                for col in config.partition_columns:
                    if col.endswith("_date") and col not in lakehouse_record:
                        base_col = col.replace("_date", "_at")
                        if base_col in lakehouse_record:
                            dt_str = lakehouse_record[base_col]
                            if dt_str:
                                lakehouse_record[col] = dt_str[:10]
            
            transformed.append(lakehouse_record)
        
        return transformed
    
    def _transform_for_postgres(
        self,
        records: List[Dict[str, Any]],
        config: SyncConfig
    ) -> List[Dict[str, Any]]:
        """Transform Lakehouse records for PostgreSQL storage"""
        transformed = []
        
        for record in records:
            postgres_record = {}
            
            for key, value in record.items():
                if key.startswith("_"):
                    continue
                
                if isinstance(value, str):
                    try:
                        parsed = json.loads(value)
                        if isinstance(parsed, (dict, list)):
                            postgres_record[key] = parsed
                        else:
                            postgres_record[key] = value
                    except (json.JSONDecodeError, TypeError):
                        postgres_record[key] = value
                else:
                    postgres_record[key] = value
            
            transformed.append(postgres_record)
        
        return transformed
    
    async def _write_to_lakehouse(
        self,
        records: List[Dict[str, Any]],
        path: str,
        partition_columns: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Write records to Lakehouse (Iceberg/Delta Lake)
        In production, this would use PyIceberg or Delta Lake APIs
        """
        full_path = f"{self.lakehouse_config.get('base_path', '/lakehouse')}/{path}"
        
        logger.info(f"Writing {len(records)} records to {full_path}")
        
        return {
            "path": full_path,
            "records_written": len(records),
            "partitions": partition_columns
        }
    
    async def _read_from_lakehouse(
        self,
        path: str,
        incremental_column: Optional[str],
        last_position: Optional[str],
        limit: int
    ) -> List[Dict[str, Any]]:
        """
        Read records from Lakehouse
        In production, this would use PyIceberg or Delta Lake APIs
        """
        full_path = f"{self.lakehouse_config.get('base_path', '/lakehouse')}/{path}"
        
        logger.info(f"Reading from {full_path} after position {last_position}")
        
        return []
    
    async def run_full_sync(self) -> Dict[str, Any]:
        """Run full sync for all configured tables"""
        results = {}
        
        for table_name, config in self.sync_configs.items():
            try:
                if config.sync_direction in [
                    SyncDirection.POSTGRES_TO_LAKEHOUSE,
                    SyncDirection.BIDIRECTIONAL
                ]:
                    result = await self.sync_postgres_to_lakehouse(table_name)
                    results[f"{table_name}_to_lakehouse"] = result
                
                if config.sync_direction in [
                    SyncDirection.LAKEHOUSE_TO_POSTGRES,
                    SyncDirection.BIDIRECTIONAL
                ]:
                    result = await self.sync_lakehouse_to_postgres(table_name)
                    results[f"{table_name}_to_postgres"] = result
                    
            except Exception as e:
                logger.error(f"Sync error for {table_name}: {str(e)}")
                results[table_name] = {"status": "error", "error": str(e)}
        
        return results


class CDCProcessor:
    """
    Process Change Data Capture events from PostgreSQL
    Uses Debezium-style event format
    """
    
    def __init__(self, sync_service: PostgresLakehouseSync):
        self.sync_service = sync_service
        self.event_buffer: List[ChangeEvent] = []
        self.buffer_size = 100
    
    def process_event(self, event_data: Dict[str, Any]) -> ChangeEvent:
        """Process a CDC event from Debezium"""
        change_event = ChangeEvent(
            table_name=event_data.get("source", {}).get("table"),
            change_type=ChangeType(event_data.get("op", "c").upper().replace("C", "INSERT").replace("U", "UPDATE").replace("D", "DELETE")),
            primary_key=event_data.get("key", {}),
            before=event_data.get("before"),
            after=event_data.get("after"),
            timestamp=event_data.get("ts_ms", datetime.utcnow().isoformat()),
            source="debezium",
            lsn=event_data.get("source", {}).get("lsn")
        )
        
        self.event_buffer.append(change_event)
        
        if len(self.event_buffer) >= self.buffer_size:
            asyncio.create_task(self.flush_buffer())
        
        return change_event
    
    async def flush_buffer(self):
        """Flush buffered events to Lakehouse"""
        if not self.event_buffer:
            return
        
        events_by_table: Dict[str, List[ChangeEvent]] = {}
        for event in self.event_buffer:
            if event.table_name not in events_by_table:
                events_by_table[event.table_name] = []
            events_by_table[event.table_name].append(event)
        
        for table_name, events in events_by_table.items():
            records = []
            for event in events:
                if event.change_type == ChangeType.DELETE:
                    if event.before:
                        record = event.before.copy()
                        record["_deleted"] = True
                        record["_change_type"] = "DELETE"
                        records.append(record)
                else:
                    if event.after:
                        record = event.after.copy()
                        record["_deleted"] = False
                        record["_change_type"] = event.change_type.value
                        records.append(record)
            
            if records:
                config = self.sync_service.sync_configs.get(table_name)
                if config:
                    await self.sync_service._write_to_lakehouse(
                        records,
                        f"{config.lakehouse_path}/cdc",
                        config.partition_columns
                    )
        
        self.event_buffer.clear()
