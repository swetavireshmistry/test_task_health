from sqlalchemy import Column, Integer, ForeignKey, Date, Time, Enum, DateTime
from sqlalchemy.orm import relationship
from src.db.database import Base
import datetime
import enum

class AppointmentStatus(enum.Enum):
    BOOKED = "booked"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    appointment_date = Column(Date)
    appointment_time = Column(Time)
    status = Column(Enum(AppointmentStatus), default=AppointmentStatus.BOOKED)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    patient = relationship("Patient", back_populates="appointments")
