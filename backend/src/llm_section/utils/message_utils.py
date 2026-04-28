from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

def format_messages(messages):
    formatted = []
    for msg in messages:
        if isinstance(msg, HumanMessage):
            formatted.append(f"user: {msg.content}")
        elif isinstance(msg, AIMessage):
            if msg.content:
                formatted.append(f"assistant: {msg.content}")
            if msg.tool_calls:
                for tool_call in msg.tool_calls:
                    formatted.append(f"assistant_tool_call: {tool_call['name']}({tool_call['args']})")
        elif isinstance(msg, ToolMessage):
            formatted.append(f"tool_result ({msg.name}): {msg.content}")
    return "\n".join(formatted)
