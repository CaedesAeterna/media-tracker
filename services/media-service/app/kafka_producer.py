from aiokafka import AIOKafkaProducer
import json
import os
import asyncio

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "my-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092")

producer = None

async def get_producer():
    global producer
    if producer is None:
        producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BROKER
            # value_serializer removed to support raw bytes (Protobuf)
        )
        # Retry Loop for Connection
        while True:
            try:
                await producer.start()
                break
            except Exception as e:
                print(f"Kafka Producer connection failed: {e}. Retrying in 5 seconds...")
                await asyncio.sleep(5)
                
    return producer

async def close_producer():
    global producer
    if producer:
        await producer.stop()
        producer = None
