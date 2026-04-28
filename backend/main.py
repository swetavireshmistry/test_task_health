from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from src.routes.chat import router as chat_router
from src.routes.appointments import router as appointment_router
from src.routes.config import router as config_router
from src.routes.voice import router as voice_router

load_dotenv()

from src.db.database import engine, Base
import src.models # Register models with Base

app = FastAPI(title="Clinical Intake API")

@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        # Create tables if they don't exist
        await conn.run_sync(Base.metadata.create_all)

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/api")
app.include_router(appointment_router, prefix="/api/appointments")
app.include_router(config_router, prefix="/api/config")
app.include_router(voice_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Clinical Intake API is running"}
