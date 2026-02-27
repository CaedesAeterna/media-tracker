from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import httpx
import os
import asyncio
import json
from aiokafka import AIOKafkaConsumer
from collections import deque
from app.events_pb2 import MediaUpdate
from google.protobuf.json_format import MessageToDict

app = FastAPI()
templates = Jinja2Templates(directory="app/templates")

# Service URLs (Internal K8s DNS)
USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://user-service.app.svc.cluster.local:80")
MEDIA_SERVICE_URL = os.getenv("MEDIA_SERVICE_URL", "http://media-service.app.svc.cluster.local:80")
KAFKA_BROKER = os.getenv("KAFKA_BROKER", "my-cluster-kafka-bootstrap.kafka.svc.cluster.local:9092")

# Global State for "Live Feed"
recent_events = deque(maxlen=10)

async def consume_events():
    consumer = AIOKafkaConsumer(
        "media-updates",
        bootstrap_servers=KAFKA_BROKER,
        group_id="dashboard-service-group", # Distinct group for fan-out
        auto_offset_reset="latest" # Only care about new stuff for live feed
    )
    
    # Retry Loop for Connection
    while True:
        try:
            await consumer.start()
            print("Dashboard Kafka Consumer Started")
            break
        except Exception as e:
            print(f"[Dashboard] Kafka Connection Failed: {e}. Retrying in 5 seconds...")
            await asyncio.sleep(5)

    try:
        async for msg in consumer:
            try:
                # Deserialize Protobuf
                event = MediaUpdate()
                event.ParseFromString(msg.value)
                
                # Convert to Dict for Template compatibility
                # preserving_proto_field_name=True ensures snake_case keys (e.g. media_title)
                data = MessageToDict(event, preserving_proto_field_name=True)
                
                if data.get("event_type") in ["new_release"]:
                    print(f"[Dashboard] Received Event: {data}")
                    recent_events.appendleft(data) # Add to top
            except Exception as e:
                print(f"[Dashboard] Error processing message: {e}")
    except Exception as e:
        print(f"[Dashboard] Kafka Consumer Loop Failed: {e}")
    finally:
        await consumer.stop()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(consume_events())

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    username = request.cookies.get("username")
    if not username:
        return templates.TemplateResponse("dashboard.html", {"request": request, "error": "Please login first"})

    user_data = None
    media_data = []

    async with httpx.AsyncClient() as client:
        # Aggregation Pattern: Call both services
        # Circuit Breaker Logic (Simplified): If call fails, return default/empty data instead of crashing.
        
        # 1. Call User Service (JSON API)
        try:
            user_resp = await client.get(f"{USER_SERVICE_URL}/api/data?username={username}", timeout=5.0)
            if user_resp.status_code == 200:
                user_data = user_resp.json()
            else:
                print(f"[Dashboard] User Service returned {user_resp.status_code}: {user_resp.text}")
                user_data = {"error": f"Service returned {user_resp.status_code}"}
        except httpx.RequestError as e:
            print(f"[Dashboard] User Service Network Error: {e}")
            user_data = {"error": "User Service unreachable (Network)"}
        except Exception as e:
            print(f"[Dashboard] User Service Error: {e}")
            user_data = {"error": "User Service unavailable"}

        # 2. Call Media Service (JSON API)
        try:
            media_resp = await client.get(f"{MEDIA_SERVICE_URL}/api/recent", timeout=2.0)
            if media_resp.status_code == 200:
                media_data = media_resp.json()
        except Exception as e:
            print(f"[Dashboard] Media Service Unreachable: {e}")
            
    return templates.TemplateResponse("dashboard.html", {
        "request": request, 
        "username": username,
        "user_data": user_data,
        "media_data": media_data,
        "recent_events": list(recent_events)
    })
