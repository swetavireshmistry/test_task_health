from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from src.db.database import get_db
from src.models import Appointment, Patient

router = APIRouter()

@router.get("/")
async def get_appointments(patient_id: int = None, db: AsyncSession = Depends(get_db)):
    query = select(Appointment).options(selectinload(Appointment.patient))
    if patient_id:
        query = query.where(Appointment.patient_id == patient_id)
    
    result = await db.execute(query)
    appointments = result.scalars().all()
    
    return [
        {
            "id": app.id,
            "patient_name": app.patient.name if app.patient else "Unknown",
            "date": app.appointment_date.isoformat(),
            "time": app.appointment_time.isoformat(),
            "status": app.status.value,
            "patient_id": app.patient_id
        }
        for app in appointments
    ]

@router.get("/{appointment_id}/brief")
async def get_clinical_brief(appointment_id: int, db: AsyncSession = Depends(get_db)):
    from src.models.clinical_brief import ClinicalBrief
    query = select(ClinicalBrief).where(ClinicalBrief.appointment_id == appointment_id).order_by(ClinicalBrief.created_at.desc())
    result = await db.execute(query)
    brief = result.scalars().first()
    
    if not brief:
        # Try to find by patient_id if not found by appointment_id (fallback)
        app_query = select(Appointment).where(Appointment.id == appointment_id)
        app_result = await db.execute(app_query)
        app = app_result.scalar_one_or_none()
        if app:
            query = select(ClinicalBrief).where(ClinicalBrief.patient_id == app.patient_id).order_by(ClinicalBrief.created_at.desc())
            result = await db.execute(query)
            brief = result.scalars().first()
            
    if not brief:
        raise HTTPException(status_code=404, detail="Clinical brief not found for this appointment.")
    
    return {
        "cc": brief.cc,
        "hpi": brief.hpi,
        "ros": brief.ros,
        "summary": brief.summary,
        "created_at": brief.created_at.isoformat()
    }

@router.get("/{appointment_id}/export")
async def export_appointment_report(appointment_id: int, db: AsyncSession = Depends(get_db)):
    from src.models.clinical_brief import ClinicalBrief
    from fastapi.responses import Response
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    import io

    # 1. Fetch Data
    query = select(Appointment).where(Appointment.id == appointment_id).options(selectinload(Appointment.patient))
    result = await db.execute(query)
    app = result.scalar_one_or_none()
    
    if not app:
        raise HTTPException(status_code=404, detail="Appointment not found")

    brief_query = select(ClinicalBrief).where(ClinicalBrief.appointment_id == appointment_id).order_by(ClinicalBrief.created_at.desc())
    brief_result = await db.execute(brief_query)
    brief = brief_result.scalars().first()

    if not brief:
        raise HTTPException(status_code=404, detail="Clinical brief not found")

    # 2. Generate PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18)
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor("#2563eb"),
        spaceAfter=20,
        alignment=1 # Center
    )
    section_style = ParagraphStyle(
        'SectionStyle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor("#1e40af"),
        spaceBefore=15,
        spaceAfter=10,
        borderPadding=5,
        borderWidth=0,
        leftIndent=0
    )
    label_style = ParagraphStyle(
        'LabelStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.grey,
        spaceBefore=5
    )

    content = []
    
    # Header
    content.append(Paragraph("Clinical Intake Report", title_style))
    content.append(Paragraph(f"Reference ID: #{str(app.id).zfill(6)}", styles['Normal']))
    content.append(Paragraph(f"Date: {app.appointment_date.strftime('%B %d, %Y')} | Time: {app.appointment_time.strftime('%I:%M %p')}", styles['Normal']))
    content.append(Spacer(1, 20))

    # Patient Section
    content.append(Paragraph("Patient Information", section_style))
    patient_data = [
        ["Name:", app.patient.name if app.patient else "N/A"],
        ["Patient ID:", str(app.patient_id)],
        ["Gender:", app.patient.gender if app.patient else "N/A"],
        ["Age:", str(app.patient.age) if app.patient else "N/A"]
    ]
    t = Table(patient_data, colWidths=[100, 300])
    t.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    content.append(t)
    content.append(Spacer(1, 20))

    # Summary
    if brief.summary:
        content.append(Paragraph("Executive Summary", section_style))
        content.append(Paragraph(brief.summary, styles['BodyText']))
        content.append(Spacer(1, 15))

    # Clinical Details
    for section_title, data in [("Chief Complaint", brief.cc), ("History of Present Illness", brief.hpi), ("Review of Systems", brief.ros)]:
        if data:
            content.append(Paragraph(section_title, section_style))
            for item in data:
                q = item.get('question', '')
                a = item.get('answer', '')
                content.append(Paragraph(f"<b>Q:</b> {q}", styles['Normal']))
                content.append(Paragraph(f"<b>A:</b> {a}", styles['Normal']))
                content.append(Spacer(1, 8))
            content.append(Spacer(1, 10))

    # Footer
    content.append(Spacer(1, 40))
    content.append(Paragraph("-" * 100, styles['Normal']))
    content.append(Paragraph("Generated by Medi AI Assistant", label_style))

    doc.build(content)
    
    pdf_value = buffer.getvalue()
    buffer.close()

    filename = f"Report_Appt_{appointment_id}.pdf"
    
    return Response(
        content=pdf_value,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
