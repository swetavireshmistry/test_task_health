from sqlalchemy import Column, Integer, String, DateTime, Text
from src.db.database import Base
import datetime

class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, index=True)
    call_sid = Column(String, unique=True, index=True)
    from_number = Column(String)
    to_number = Column(String)
    direction = Column(String, default="inbound")
    status = Column(String)
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    transcript = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
