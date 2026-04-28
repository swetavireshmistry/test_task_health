import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()


def get_llm():
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL"),
        temperature=0.3,
        api_key=os.getenv("OPENAI_API_KEY"),
        streaming=True,
    )
