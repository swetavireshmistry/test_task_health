import re
import logging

from langchain_core.messages import SystemMessage, ToolMessage, HumanMessage, AIMessage
from src.llm_section.state.state import AgentState
from src.llm_section.llm_config.llm_config import get_llm
from src.llm_section.prompts.prompts import get_system_prompt
from src.llm_section.tools.tools import (
    submit_clinical_brief,
    upsert_patient,
    check_availability,
    create_appointment,
    cancel_appointment,
    edit_appointment
)

logger = logging.getLogger(__name__)

_MD_PATTERN = re.compile(
    r'\*{1,3}|_{1,3}|`{1,3}|#{1,6}\s?'  
    r'|\[([^\]]+)\]\([^)]+\)'              
    r'|\([^)]{0,40}\)'                      
    r'|[\[\]\|\>\^]'                      
    r'|(?<![\w])[-–—](?=[\s])',             
)

def _sanitize_for_voice(text: str) -> str:
    """Strip markdown and TTS-breaking characters from an LLM response."""
    if not text:
        return text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = _MD_PATTERN.sub('', text)
    text = re.sub(r'  +', ' ', text).strip()
    return text

llm = get_llm()

tools = [
    submit_clinical_brief,
    upsert_patient,
    check_availability,
    create_appointment,
    cancel_appointment,
    edit_appointment
]
llm_with_tools = llm.bind_tools(tools)


_clinical_config_cache: list | None = None


async def _get_clinical_configs():
    """Return cached ClinicalConfig rows, loading from DB on first call."""
    global _clinical_config_cache
    if _clinical_config_cache is not None:
        return _clinical_config_cache
    return await refresh_clinical_config()


async def refresh_clinical_config():
    """Force-reload ClinicalConfig from the DB and update the module cache."""
    global _clinical_config_cache
    from src.db.database import AsyncSessionLocal
    from src.models import ClinicalConfig
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        res = await session.execute(select(ClinicalConfig))
        _clinical_config_cache = res.scalars().all()
        logger.debug("ClinicalConfig cache refreshed (%d rows)", len(_clinical_config_cache))
    return _clinical_config_cache


def _build_custom_instructions(configs: list) -> str:
    """Convert ClinicalConfig rows into a compact system-prompt appendix."""
    if not configs:
        return ""

    hpi_all = [c for c in configs if c.category == "hpi" and c.scope == "all"]
    ros_all = [c for c in configs if c.category == "ros" and c.scope == "all"]
    disease_specific = [c for c in configs if c.scope == "disease_specific" and c.disease_name]

    lines = ["\n\n### DOCTOR'S CUSTOM GUIDELINES (Priority)"]

    if hpi_all:
        lines.append(
            "- General HPI: " + "; ".join(", ".join(c.questions) for c in hpi_all)
        )
    if ros_all:
        lines.append(
            "- General ROS: " + "; ".join(", ".join(c.questions) for c in ros_all)
        )
    for c in disease_specific:
        lines.append(f"- For {c.disease_name}: " + ", ".join(c.questions))

    return "\n".join(lines)


async def chat_node(state: AgentState):
    try:
        messages = state.get("messages", [])
        patient_id = state.get("patient_id")
        appointment_id = state.get("appointment_id")

        patient_created   = state.get("patient_created",   False)
        appointment_created = state.get("appointment_created", False)
        submit_brief_called = state.get("submit_brief_called", False)



        context_lines: list[str] = []

        configs = await _get_clinical_configs()  
        custom_instructions = _build_custom_instructions(configs)
        if custom_instructions:
            context_lines.append(custom_instructions)

        if patient_id:
            context_lines.append(
                f"Context: patient_id={patient_id} — pass to all appointment and brief tool calls."
            )
        if appointment_id:
            context_lines.append(
                f"Context: appointment_id={appointment_id} — pass to submit_clinical_brief."
            )

 
        if submit_brief_called:
            phase_tracker = (
                "PHASE TRACKER: Phase 6 COMPLETE — SESSION FINISHED.\n"
                "The clinical brief has been submitted. The session is over."
            )
        elif appointment_created:
            phase_tracker = (
                f"PHASE TRACKER: Phase 6 — SUBMIT CLINICAL BRIEF (final step).\n"
                f"patient_created=True, appointment_created=True, submit_brief_called=False.\n"
                f"patient_id={patient_id}, appointment_id={appointment_id}.\n"
                "Action: Call submit_clinical_brief RIGHT NOW using the IDs above. Do not ask any more questions."
            )
        elif patient_created:
            phase_tracker = (
                f"PHASE TRACKER: Phase 2-5 — CLINICAL QUESTIONS + APPOINTMENT BOOKING.\n"
                f"patient_created=True (patient_id={patient_id}), appointment_created=False.\n"
                "Next actions in order: CC → HPI → ROS → check_availability → create_appointment.\n"
                "Scan conversation history before each question — skip any topic already answered."
            )
        else:
            phase_tracker = (
                "PHASE TRACKER: Phase 1 — PATIENT REGISTRATION.\n"
                "patient_created=False. No patient registered yet.\n"
                "Action: Collect name → age → gender → phone (one at a time), then call upsert_patient immediately.\n"
                "Do NOT ask any clinical questions until patient_created becomes True."
            )
        context_lines.append(phase_tracker)

        context_lines.append(get_system_prompt())
        system_content = "\n".join(context_lines)

    
        start_idx = 0
        while start_idx < len(messages) and isinstance(messages[start_idx], ToolMessage):
            start_idx += 1
        all_messages = messages[start_idx:]

        llm_input = [SystemMessage(content=system_content)] + all_messages


        response = await llm_with_tools.ainvoke(llm_input)

 
        if response.content and isinstance(response.content, str):
            response.content = _sanitize_for_voice(response.content)

        brief = state.get("brief")
        if response.tool_calls:
            for tool_call in response.tool_calls:
                if tool_call["name"] == "submit_clinical_brief":
                    if not tool_call["args"].get("patient_id"):
                        tool_call["args"]["patient_id"] = patient_id
                    if not tool_call["args"].get("appointment_id"):
                        tool_call["args"]["appointment_id"] = appointment_id
                    brief = tool_call["args"]

        return {
            "messages": [response],
            "brief": brief,
            "patient_id": patient_id,
            "appointment_id": appointment_id,
            "patient_created": patient_created,
            "appointment_created": appointment_created,
            "submit_brief_called": submit_brief_called,
        }
    except Exception as e:
        logger.error("Error in chat_node: %s", e)
        error_msg = AIMessage(content="I had a little trouble there — could you say that again?")
        return {"messages": [error_msg]}



async def tool_node(state: AgentState):
    try:
        messages = state["messages"]
        last_message = messages[-1]

        import asyncio

        async def execute_tool(tool_call):
            tool_name = tool_call["name"]
            tool_map = {
                "submit_clinical_brief": submit_clinical_brief,
                "upsert_patient": upsert_patient,
                "check_availability": check_availability,
                "create_appointment": create_appointment,
                "cancel_appointment": cancel_appointment,
                "edit_appointment": edit_appointment,
            }

            if tool_name in tool_map:
                try:
                    logger.debug("Calling tool %s with args: %s", tool_name, tool_call["args"])
             
                    result = await tool_map[tool_name].ainvoke(tool_call)
                    logger.debug("Tool %s result: %s", tool_name, result)

                    return ToolMessage(
                        content=str(result),
                        name=tool_name,
                        tool_call_id=tool_call["id"],
                    )
                except Exception as te:
                    logger.error("Error executing tool %s: %s", tool_name, te)
    
                    return ToolMessage(
                        content=f"tool_error: {tool_name} failed. Ask the user to try again.",
                        name=tool_name,
                        tool_call_id=tool_call["id"],
                    )
            return None

        tasks = [execute_tool(tc) for tc in last_message.tool_calls]
        results = await asyncio.gather(*tasks)

        tool_messages = [r for r in results if r is not None]

        patient_id          = state.get("patient_id")
        appointment_id      = state.get("appointment_id")
        patient_created     = state.get("patient_created",     False)
        appointment_created = state.get("appointment_created", False)
        submit_brief_called = state.get("submit_brief_called", False)

        import re
        for msg in tool_messages:

            if msg.content.startswith("tool_error:"):
                continue


            if msg.name == "upsert_patient" and "Success:" in msg.content:
                match = re.search(r"ID: (\d+)", msg.content)
                if match:
                    patient_id = int(match.group(1))
                patient_created = True
                logger.debug("Phase flag: patient_created=True (patient_id=%s)", patient_id)

            elif msg.name == "create_appointment" and "Success:" in msg.content:
                match = re.search(r"ID: (\d+)", msg.content)
                if match:
                    appointment_id = int(match.group(1))
                appointment_created = True
                logger.debug("Phase flag: appointment_created=True (appointment_id=%s)", appointment_id)

            elif msg.name == "submit_clinical_brief" and "successfully submitted" in msg.content:
                submit_brief_called = True
                logger.debug("Phase flag: submit_brief_called=True")

        return {
            "messages": tool_messages,
            "patient_id": patient_id,
            "appointment_id": appointment_id,
            "patient_created": patient_created,
            "appointment_created": appointment_created,
            "submit_brief_called": submit_brief_called,
        }

    except Exception as e:
        logger.error("Error in tool_node: %s", e)
        return {"messages": []}

