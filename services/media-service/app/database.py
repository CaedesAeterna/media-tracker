import os
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis

# MongoDB
MONGO_URL = os.getenv("MONGO_URL", "mongodb://mongo-0.mongo.database.svc.cluster.local:27017,mongo-1.mongo.database.svc.cluster.local:27017,mongo-2.mongo.database.svc.cluster.local:27017/?replicaSet=rs0")
DB_NAME = os.getenv("DB_NAME", "media_db")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Redis
REDIS_HOST = os.getenv("REDIS_HOST", "redis.database.svc.cluster.local")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
