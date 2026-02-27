from fastapi import FastAPI, Request, HTTPException, status
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from app.routers import media
from app.kafka_consumer import consume
import asyncio

app = FastAPI()

templates = Jinja2Templates(directory="app/templates")

app.include_router(media.router)
# No special change needed if router defines the path

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(consume())

# New Exception Handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code == status.HTTP_401_UNAUTHORIZED:
        if "text/html" in request.headers.get("accept", ""):
            return templates.TemplateResponse(
                "not_authorized.html",
                {"request": request},
                status_code=status.HTTP_401_UNAUTHORIZED
            )
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": exc.detail}
        )
    # For other HTTPExceptions, use default FastAPI handling or a generic one
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "title": "Media Service"})
