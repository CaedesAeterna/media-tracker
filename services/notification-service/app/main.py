import asyncio
from fastapi import FastAPI
from app.kafka_consumer import consume

app = FastAPI(title="Notification Service")

@app.on_event("startup")
async def startup_event():
    # Run Kafka consumer in the background
    asyncio.create_task(consume())

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "notification-service"}

@app.get("/")
async def root():
    return {"message": "Notification Service is running"}
