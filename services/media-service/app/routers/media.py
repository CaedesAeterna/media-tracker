from fastapi import APIRouter, Request, Form, BackgroundTasks, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse
from app.database import db, redis_client
from app.models import MediaItem
from app.kafka_producer import get_producer
from app.auth import get_current_user
from app.events_pb2 import MediaUpdate
from bson import ObjectId
from typing import Optional
import json
import time
from datetime import datetime
from bson.errors import InvalidId

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

MEDIA_CACHE_KEY = "media_list:all"

@router.post("/media/{media_id}/release")
async def release_content(
    media_id: str,
    release_title: str = Form(...),
    season_number: Optional[int] = Form(None),
    episode_number: Optional[int] = Form(None),
    volume_number: Optional[int] = Form(None),
    chapter_number: Optional[int] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    try:
        oid = ObjectId(media_id)
    except InvalidId:
        return HTMLResponse(f"Invalid Media ID format", status_code=400)

    media = await db.media.find_one({"_id": oid})
    if not media:
        return HTMLResponse("Media not found", status_code=404)
    
    # Publish Kafka Event (Protobuf)
    producer = await get_producer()
    
    proto_event = MediaUpdate()
    proto_event.event_type = "new_release"
    proto_event.media_id = media_id
    proto_event.media_title = media["title"]
    proto_event.media_type = media.get("media_type", "unknown")
    proto_event.release_title = release_title
    if season_number is not None: proto_event.season = season_number
    if episode_number is not None: proto_event.episode = episode_number
    if volume_number is not None: proto_event.volume = volume_number
    if chapter_number is not None: proto_event.chapter = chapter_number
    proto_event.timestamp = int(time.time())

    await producer.send_and_wait("media-updates", proto_event.SerializeToString())
    
    # Invalidate Cache
    await redis_client.delete(MEDIA_CACHE_KEY)
    
    return RedirectResponse(url=f"/media", status_code=303)

@router.post("/media/{media_id}/delete")
async def delete_media(media_id: str, current_user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(media_id)
    except InvalidId:
        return HTMLResponse(f"Invalid Media ID", status_code=400)

    result = await db.media.delete_one({"_id": oid})
    if result.deleted_count == 0:
        return HTMLResponse("Media not found", status_code=404)

    # Publish Event (Protobuf)
    producer = await get_producer()
    
    proto_event = MediaUpdate()
    proto_event.event_type = "media_deleted"
    proto_event.media_id = media_id
    proto_event.timestamp = int(time.time())

    await producer.send_and_wait("media-updates", proto_event.SerializeToString())
    
    # Invalidate Cache
    await redis_client.delete(MEDIA_CACHE_KEY)

    return RedirectResponse(url="/media", status_code=303)

@router.get("/api/recent")
async def get_recent_media():
    # Return last 5 added items as JSON
    media_list = []
    cursor = db.media.find({}).sort("_id", -1).limit(5)
    async for document in cursor:
        document["id"] = str(document["_id"])
        del document["_id"]
        # Convert datetime to string for JSON serialization
        if "created_at" in document and isinstance(document["created_at"], datetime):
            document["created_at"] = document["created_at"].isoformat()
        media_list.append(document)
    return media_list

@router.get("/media")
async def list_media(request: Request, q: Optional[str] = None):
    username = request.cookies.get("username")
    
    # 1. Generate Cache Key based on query
    cache_key = f"media_list:{q if q else 'all'}"
    
    # 2. Check Cache
    cached_data = await redis_client.get(cache_key)
    
    media_list = []
    
    if cached_data:
        print(f"[Cache Hit] Serving {cache_key} from Redis")
        media_list = json.loads(cached_data)
    else:
        print(f"[Cache Miss] Querying MongoDB for {cache_key}")
        # 3. Query Database (Cache Miss)
        query = {}
        if q:
            query = {"title": {"$regex": q, "$options": "i"}}
            
        cursor = db.media.find(query)
        async for document in cursor:
            document["id"] = str(document["_id"])
            del document["_id"] # Remove ObjectId for JSON serialization
            # Convert datetime to string for JSON serialization
            if "created_at" in document and isinstance(document["created_at"], datetime):
                document["created_at"] = document["created_at"].isoformat()
            media_list.append(document)
            
        # 4. Save to Cache (Expire in 60 seconds)
        await redis_client.setex(cache_key, 60, json.dumps(media_list))
        
    return templates.TemplateResponse("media_list.html", {
        "request": request, 
        "media_list": media_list, 
        "username": username,
        "search_query": q
    })

@router.post("/media", response_class=HTMLResponse)
async def create_media(
    request: Request,
    title: str = Form(...),
    media_type: str = Form(...),
    description: Optional[str] = Form(None),
    seasons_json: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    try:
        seasons_data = []
        if seasons_json and seasons_json.strip():
            import json
            seasons_data = json.loads(seasons_json)
        
        media_item = MediaItem(
            title=title, 
            media_type=media_type, 
            description=description,
            seasons=seasons_data,
            creator=current_user.get("username")
        )
        await db.media.insert_one(media_item.dict())
        
        # Invalidate Cache
        await redis_client.delete(MEDIA_CACHE_KEY)
        
        return RedirectResponse(url="/media", status_code=303)
    except Exception as e:
        return templates.TemplateResponse("media_form.html", {"request": request, "error": str(e)})

@router.get("/media/new")
async def new_media_form(request: Request, current_user: dict = Depends(get_current_user)):
    return templates.TemplateResponse("media_form.html", {"request": request})

@router.get("/media/{media_id}/edit")
async def edit_media_form(
    media_id: str, 
    request: Request, 
    current_user: dict = Depends(get_current_user)
):
    try:
        oid = ObjectId(media_id)
    except InvalidId:
        return HTMLResponse("Invalid Media ID", status_code=400)

    media = await db.media.find_one({"_id": oid})
    if not media:
        return HTMLResponse("Media not found", status_code=404)
    
    # Ownership Check
    if media.get("creator") != current_user.get("username"):
        return templates.TemplateResponse("not_authorized.html", {"request": request})

    # Convert ObjectId to string and prepare seasons JSON for the form
    media["id"] = str(media["_id"])
    seasons_json = json.dumps(media.get("seasons", []))
    
    return templates.TemplateResponse("media_form.html", {
        "request": request, 
        "media": media,
        "seasons_json": seasons_json
    })

@router.post("/media/{media_id}/update")
async def update_media(
    media_id: str,
    request: Request,
    title: str = Form(...),
    media_type: str = Form(...),
    description: Optional[str] = Form(None),
    seasons_json: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    try:
        oid = ObjectId(media_id)
    except InvalidId:
        return HTMLResponse("Invalid Media ID", status_code=400)

    # 1. Fetch existing
    existing_media = await db.media.find_one({"_id": oid})
    if not existing_media:
        return HTMLResponse("Media not found", status_code=404)

    # 2. Ownership Check
    if existing_media.get("creator") != current_user.get("username"):
        return templates.TemplateResponse("not_authorized.html", {"request": request})

    # 3. Parse Seasons
    seasons_data = []
    if seasons_json and seasons_json.strip():
        import json
        seasons_data = json.loads(seasons_json)

    # 4. Update in MongoDB
    update_data = {
        "title": title,
        "media_type": media_type,
        "description": description,
        "seasons": seasons_data
    }
    
    await db.media.update_one({"_id": oid}, {"$set": update_data})

    # 5. Publish Kafka Event (Media Updated)
    producer = await get_producer()
    proto_event = MediaUpdate()
    proto_event.event_type = "media_updated"
    proto_event.media_id = media_id
    proto_event.media_title = title
    proto_event.media_type = media_type
    proto_event.timestamp = int(time.time())
    
    await producer.send_and_wait("media-updates", proto_event.SerializeToString())

    # 6. Invalidate Cache
    await redis_client.delete(MEDIA_CACHE_KEY)

    return RedirectResponse(url="/media", status_code=303)
