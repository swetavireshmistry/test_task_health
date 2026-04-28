from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from src.db.database import Base

class ClinicalConfig(Base):
    __tablename__ = "clinical_configs"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, nullable=False) # 'hpi' or 'ros'
    scope = Column(String, nullable=False)    # 'all' or 'disease_specific'
    disease_name = Column(String, nullable=True)
    questions = Column(JSONB, nullable=False) # List of strings
