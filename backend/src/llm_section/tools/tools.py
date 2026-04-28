from langchain_core.tools import tool
from src.llm_section.schema.schema import ClinicalBrief, QAEntry
from src.db.database import AsyncSessionLocal
from src.models.patient import Patient
from src.models.appointment import Appointment, AppointmentStatus
from src.models.clinical_brief import ClinicalBrief as ClinicalBriefModel
from sqlalchemy import select, and_
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

@tool(args_schema=ClinicalBrief)
async def submit_clinical_brief(cc: list[QAEntry], hpi: list[QAEntry], ros: list[QAEntry], summary: str, patient_id: int = None, appointment_id: int = None) -> str:
    """Submit the completed clinical brief (CC, HPI, ROS, and a professional Summary) once all information is gathered.
    The 'summary' should be a concise clinical overview for the doctor.
    Each Q&A entry should contain the 'question' asked by AI and 'answer' provided by user.
    """
    try:
        def to_dict(q):
            if isinstance(q, dict): return q
            if hasattr(q, "model_dump"): return q.model_dump()
            if hasattr(q, "dict"): return q.dict()
            return q

        async with AsyncSessionLocal() as session:
            # Convert QAEntry objects to dictionaries for JSONB storage
            brief_data = {
                "cc": [to_dict(q) for q in cc],
                "hpi": [to_dict(q) for q in hpi],
                "ros": [to_dict(q) for q in ros],
                "summary": summary,
                "patient_id": patient_id,
                "appointment_id": appointment_id
            }
            
            new_brief = ClinicalBriefModel(
                cc=brief_data["cc"],
                hpi=brief_data["hpi"],
                ros=brief_data["ros"],
                summary=brief_data["summary"],
                patient_id=patient_id,
                appointment_id=appointment_id
            )
            session.add(new_brief)
            await session.commit()
            logger.info(f"Successfully saved clinical brief for patient_id={patient_id}")
            
            return f"Clinical brief for patient {patient_id} successfully submitted. Intake complete."
    except Exception as e:
        logger.error(f"Error in submit_clinical_brief: {e}")
        return f"Error submitting clinical brief: {str(e)}"


@tool
async def upsert_patient(name: str, age: int = None, gender: str = None, phone: str = None, patient_id: int = None) -> str:
    """Add a new patient or edit an existing one. Provide patient_id to edit."""
    try:
        async with AsyncSessionLocal() as session:
            if patient_id:
                res = await session.execute(select(Patient).where(Patient.id == patient_id))
                patient = res.scalar_one_or_none()
                if not patient:
                    return f"Error: Patient with ID {patient_id} not found in our records."
                patient.name = name
                if age: patient.age = age
                if gender: patient.gender = gender
                if phone: patient.phone = phone
            else:
                # Check for duplicates by phone
                if phone:
                    duplicate_query = select(Patient).where(Patient.phone == phone)
                    res = await session.execute(duplicate_query)
                    patient = res.scalar_one_or_none()
                else:
                    patient = None
                
                if patient:
                    # Update existing patient
                    patient.name = name
                    if age: patient.age = age
                    if gender: patient.gender = gender
                    if phone: patient.phone = phone
                    patient_id = patient.id
                else:
                    # Create new patient
                    patient = Patient(name=name, age=age, gender=gender, phone=phone)
                    session.add(patient)
            
            await session.commit()
            await session.refresh(patient)
            return f"Success: Patient {patient.name} record {'updated' if patient_id else 'created'} (ID: {patient.id})."
    except Exception as e:
        logger.error(f"Error in upsert_patient: {e}")
        return f"Database Error: Could not save patient details. Details: {str(e)}"

@tool
async def check_availability(appointment_date: str, appointment_time: str) -> str:
    """Check if a specific date and time is available for an appointment. Format: YYYY-MM-DD, HH:MM"""
    try:
        d = datetime.strptime(appointment_date, "%Y-%m-%d").date()
        t = datetime.strptime(appointment_time, "%H:%M").time()
    except ValueError:
        return "Input Error: Invalid date or time format. Please use YYYY-MM-DD for date and HH:MM for time."

    try:
        async with AsyncSessionLocal() as session:
            res = await session.execute(
                select(Appointment).where(
                    and_(
                        Appointment.appointment_date == d,
                        Appointment.appointment_time == t,
                        Appointment.status == AppointmentStatus.BOOKED
                    )
                )
            )
            existing = res.scalar_one_or_none()
            if existing:
                return f"Notice: The slot {appointment_date} at {appointment_time} is already booked. Please choose another time."
            return f"Available: The slot {appointment_date} at {appointment_time} is free to book."
    except Exception as e:
        logger.error(f"Error in check_availability: {e}")
        return f"Database Error: Unable to check availability. Details: {str(e)}"

@tool
async def create_appointment(patient_id: int, appointment_date: str, appointment_time: str) -> str:
    """Create a new appointment for a patient. Format: YYYY-MM-DD, HH:MM"""
    try:
        d = datetime.strptime(appointment_date, "%Y-%m-%d").date()
        t = datetime.strptime(appointment_time, "%H:%M").time()
    except ValueError:
        return "Input Error: Invalid date or time format. Please use YYYY-MM-DD and HH:MM."

    try:
        async with AsyncSessionLocal() as session:
            # Check if patient exists
            res = await session.execute(select(Patient).where(Patient.id == patient_id))
            if not res.scalar_one_or_none():
                return f"Error: Patient with ID {patient_id} does not exist. Please register the patient first."

            new_app = Appointment(
                patient_id=patient_id,
                appointment_date=d,
                appointment_time=t,
                status=AppointmentStatus.BOOKED
            )
            session.add(new_app)
            await session.commit()
            await session.refresh(new_app)
            return f"Success: Appointment confirmed (ID: {new_app.id}) for patient ID {patient_id} on {appointment_date} at {appointment_time}."
    except Exception as e:
        logger.error(f"Error in create_appointment: {e}")
        return f"Database Error: Could not book the appointment. Details: {str(e)}"

@tool
async def cancel_appointment(appointment_id: int) -> str:
    """Cancel an existing appointment by its ID."""
    try:
        async with AsyncSessionLocal() as session:
            res = await session.execute(select(Appointment).where(Appointment.id == appointment_id))
            app = res.scalar_one_or_none()
            if not app:
                return f"Error: Appointment with ID {appointment_id} not found."
            
            app.status = AppointmentStatus.CANCELLED
            await session.commit()
            return f"Success: Appointment {appointment_id} has been cancelled successfully."
    except Exception as e:
        logger.error(f"Error in cancel_appointment: {e}")
        return f"Database Error: Could not cancel appointment. Details: {str(e)}"

@tool
async def edit_appointment(appointment_id: int, appointment_date: str = None, appointment_time: str = None, status: str = None) -> str:
    """Edit an existing appointment. status can be 'booked', 'completed', or 'cancelled'."""
    try:
        async with AsyncSessionLocal() as session:
            res = await session.execute(select(Appointment).where(Appointment.id == appointment_id))
            app = res.scalar_one_or_none()
            if not app:
                return f"Error: Appointment with ID {appointment_id} not found."
            
            if appointment_date:
                app.appointment_date = datetime.strptime(appointment_date, "%Y-%m-%d").date()
            if appointment_time:
                app.appointment_time = datetime.strptime(appointment_time, "%H:%M").time()
            if status:
                try:
                    app.status = AppointmentStatus(status.lower())
                except ValueError:
                    return f"Input Error: Invalid status '{status}'. Use 'booked', 'completed', or 'cancelled'."
            
            await session.commit()
            return f"Success: Appointment {appointment_id} updated successfully."
    except Exception as e:
        logger.error(f"Error in edit_appointment: {e}")
        return f"Database Error: Could not update appointment. Details: {str(e)}"
