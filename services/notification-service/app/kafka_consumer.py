import asyncio
import os
import json
import logging
from aiokafka import AIOKafkaConsumer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("notification-service")

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "my-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092")
TOPICS = ["user-registered", "notification-dispatch"]

async def consume():
    logger.info(f"Starting Kafka Consumer on topics: {TOPICS}, Broker: {KAFKA_BROKER}")
    consumer = AIOKafkaConsumer(
        *TOPICS,
        bootstrap_servers=KAFKA_BROKER,
        group_id="notification-service-group" # Distinct group ID for fan-out
    )
    
    # Retry Loop for Connection
    while True:
        try:
            await consumer.start()
            logger.info(f"Kafka Consumer started successfully.")
            break # Connected!
        except Exception as e:
            logger.error(f"Kafka connection failed: {e}. Retrying in 5 seconds...")
            await asyncio.sleep(5)

    try:
        async for msg in consumer:
            try:
                data = json.loads(msg.value.decode('utf-8'))
                
                if msg.topic == "user-registered":
                    username = data.get("username", "Unknown")
                    email = data.get("email", "unknown@example.com")
                    
                    logger.info("----------------------------------------------------------------")
                    logger.info(f"📨 NOTIFICATION SERVICE: Sending Welcome Email to {username} ({email})")
                    logger.info("   Subject: Welcome to Media Tracker!")
                    logger.info("   Body: Hi there! Thanks for joining. Start tracking your media now.")
                    logger.info("----------------------------------------------------------------")
                    
                elif msg.topic == "notification-dispatch":
                    user_id = data.get("user_id", "Unknown")
                    message_body = data.get("message", "No message content")
                    
                    logger.info("----------------------------------------------------------------")
                    logger.info(f"🔔 NOTIFICATION SERVICE: Alert for User ID {user_id}")
                    logger.info(f"   Message: {message_body}")
                    logger.info("----------------------------------------------------------------")

            except json.JSONDecodeError:
                logger.error(f"Failed to decode message: {msg.value}")
            except Exception as e:
                logger.error(f"Error processing message: {e}")
    except Exception as e:
         logger.error(f"Kafka Consumer Loop Failed: {e}")
    finally:
        await consumer.stop()
        logger.info("Kafka Consumer stopped.")
