from fastapi import HTTPException, status, Request, Depends
from app.database import redis_client
import json

async def get_current_user(request: Request):
    session_id = request.cookies.get("session_id")
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    session_key = f"session:{session_id}"
    session_data_str = await redis_client.get(session_key)
    
    if not session_data_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session"
        )
        
    session_data = json.loads(session_data_str)
    # Optionally, refresh session TTL in Redis here
    await redis_client.expire(session_key, 86400) # Extend by 24 hours
    
    return session_data # This contains user_id, username etc.
