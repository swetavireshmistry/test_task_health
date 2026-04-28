from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from src.llm_section.graph.graph import app_graph
from langchain_core.messages import HumanMessage
import uuid
import json

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    thread_id: str = None
    patient_id: int = None

@router.post("/chat")
async def chat(request: ChatRequest):
    if not request.thread_id:
        request.thread_id = str(uuid.uuid4())
    
    config = {"configurable": {"thread_id": request.thread_id}}
    input_data = {"messages": [HumanMessage(content=request.message)]}
    
    async def event_generator():
        try:
            # Yield initial metadata
            yield f"data: {json.dumps({'thread_id': request.thread_id})}\n\n"
            
            async for event in app_graph.astream_events(input_data, config, version="v2"):
                kind = event["event"]
                
                # Stream tokens from the chat model
                if kind == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if content:
                        yield f"data: {json.dumps({'chunk': content})}\n\n"
                
                # Optionally stream node transitions or final outputs
                elif kind == "on_chain_end" and event["name"] == "LangGraph":
                    output = event["data"]["output"]
                    if "brief" in output and output["brief"]:
                        yield f"data: {json.dumps({'brief': output['brief']})}\n\n"
            
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
