from langgraph.graph import StateGraph, START, END
from src.llm_section.state.state import AgentState
from src.llm_section.node.nodes import chat_node, tool_node
from langgraph.checkpoint.memory import MemorySaver

def route_after_chat(state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    
    if last_message.tool_calls:
        return "tools"
    return END

def build_graph():
    workflow = StateGraph(AgentState)
    
    workflow.add_node("agent", chat_node)
    workflow.add_node("tools", tool_node)
    
    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges("agent", route_after_chat, {"tools": "tools", END: END})
    workflow.add_edge("tools", "agent")
    
    checkpointer = MemorySaver()
    return workflow.compile(checkpointer=checkpointer)

app_graph = build_graph()