from typing import Annotated, TypedDict, Optional
from typing_extensions import NotRequired
from langgraph.graph.message import add_messages
from langchain_core.messages import AnyMessage

class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    brief: Optional[dict]
    patient_id: Optional[int]
    appointment_id: Optional[int]
    patient_created: NotRequired[bool]
    appointment_created: NotRequired[bool]
    submit_brief_called: NotRequired[bool]