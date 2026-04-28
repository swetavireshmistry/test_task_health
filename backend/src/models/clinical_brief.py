from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from src.db.database import Base
import datetime

class ClinicalBrief(Base):
    __tablename__ = "clinical_briefs"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    
    # Store the structured Q&A data
    cc = Column(JSONB, nullable=False)
    hpi = Column(JSONB, nullable=False)
    ros = Column(JSONB, nullable=False)
    summary = Column(JSONB, nullable=True) # Storing as JSONB in case we want to structure it later, or just Text
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
