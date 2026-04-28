from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from src.db.database import Base
import datetime

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer)
    gender = Column(String)
    phone = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    appointments = relationship("Appointment", back_populates="patient")
