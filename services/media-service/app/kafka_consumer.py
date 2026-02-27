import asyncio
import os
import json
from aiokafka import AIOKafkaConsumer
from app.database import db

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "my-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092")
TOPIC = "user-registered"

async def consume():
    consumer = AIOKafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_BROKER,
        group_id="media-service-group"
    )
    try:
        await consumer.start()
        print(f"Kafka Consumer started on topic {TOPIC}")
        try:
            async for msg in consumer:
                try:
                    data = json.loads(msg.value.decode('utf-8'))
                    event_type = data.get("event")
                    
                    if event_type == "user_updated":
                        old_user = data.get("old_username")
                        new_user = data.get("new_username")
                        
                        if old_user and new_user:
                            print(f"[Consumer] Updating media ownership: {old_user} -> {new_user}")
                            result = await db.media.update_many(
                                {"creator": old_user},
                                {"$set": {"creator": new_user}}
                            )
                            print(f"[Consumer] Updated {result.modified_count} media items.")
                    else:
                        # Legacy handling or other events
                        print(f"[Consumer] Processing generic/legacy event: {data}")
                        
                except Exception as e:
                    print(f"[Consumer] Error processing message: {e}")
                    
        finally:
            await consumer.stop()
    except Exception as e:
        print(f"Kafka connection failed: {e}")
