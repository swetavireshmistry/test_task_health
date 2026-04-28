from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from src.db.database import get_db
from src.models.clinical_config import ClinicalConfig
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

class ClinicalConfigSchema(BaseModel):
    id: Optional[int] = None
    category: str
    scope: str
    disease_name: Optional[str] = None
    questions: List[str]

    class Config:
        from_attributes = True

@router.get("/clinical", response_model=List[ClinicalConfigSchema])
async def get_clinical_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ClinicalConfig))
    return result.scalars().all()

@router.post("/clinical", response_model=ClinicalConfigSchema)
async def save_clinical_config(config_data: ClinicalConfigSchema, db: AsyncSession = Depends(get_db)):
    if config_data.id:
        result = await db.execute(select(ClinicalConfig).where(ClinicalConfig.id == config_data.id))
        config = result.scalar_one_or_none()
        if not config:
            raise HTTPException(status_code=404, detail="Config not found")
        
        config.category = config_data.category
        config.scope = config_data.scope
        config.disease_name = config_data.disease_name
        config.questions = config_data.questions
    else:
        config = ClinicalConfig(
            category=config_data.category,
            scope=config_data.scope,
            disease_name=config_data.disease_name,
            questions=config_data.questions
        )
        db.add(config)
    
    await db.commit()
    await db.refresh(config)
    return config

@router.delete("/clinical/{config_id}")
async def delete_clinical_config(config_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(ClinicalConfig).where(ClinicalConfig.id == config_id))
    await db.commit()
    return {"message": "Config deleted successfully"}
