import array
import asyncio
import base64
import io
import json
import math
import os
import re
import uuid

import openai
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage

from src.llm_section.graph.graph import app_graph


router = APIRouter()
client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

_SENTENCE_END = re.compile(r'(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])$')

def _split_into_sentences(text: str) -> list[str]:
    """Yield complete sentences from an accumulated text buffer."""
    parts = _SENTENCE_END.split(text)
    return [p.strip() for p in parts if p.strip()]



@router.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    await websocket.accept()
    session_thread_id = str(uuid.uuid4())
    processing_task = None

    async def process_voice(audio_bytes: bytes, mime_type: str, thread_id: str):
        try:
            await _send(websocket, {"type": "status", "status": "transcribing"})
            transcript = await _transcribe(audio_bytes, mime_type)

            if not transcript.strip():
                await _send(websocket, {"type": "status", "status": "listening"})
                return

            await _send(websocket, {"type": "transcript", "text": transcript})
            await _send(websocket, {"type": "status", "status": "processing"})

            # Sentence-streaming pipeline 
            # 1. Stream LLM tokens, accumulate into sentences.
            # 2. For each complete sentence, immediately start TTS (streaming).
            # 3. Send audio_chunk frames to the browser as TTS produces them.
            # 4. The browser can start playing sentence N while sentence N+1 is
            #    being synthesized → perceived latency drops to ~1 s.

            await _sentence_stream_pipeline(websocket, transcript, thread_id)

            await _send(websocket, {"type": "audio_end"})
            await _send(websocket, {"type": "status", "status": "listening"})

        except asyncio.CancelledError:
            try:
                await _send(websocket, {"type": "interrupt"})
            except Exception:
                pass
        except Exception as e:
            import traceback
            print("ERROR IN PROCESS_VOICE:")
            print(f"Mime Type: {mime_type}")
            print(f"Thread ID: {thread_id}")
            print(f"Error: {str(e)}")
            traceback.print_exc()
            try:
                await _send(websocket, {"type": "status", "status": "listening"})
            except Exception:
                pass

    try:
        while True:
            try:
                raw = await websocket.receive_text()
                message = json.loads(raw)
            except ValueError:
                print("Received non-JSON message")
                continue
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WebSocket receive error: {e}")
                break

            if message.get("type") == "audio_data":
                thread_id = message.get("thread_id") or session_thread_id
                audio_bytes = base64.b64decode(message["data"])
                mime_type = message.get("mime_type", "audio/webm")

                processing_task = asyncio.create_task(
                    process_voice(audio_bytes, mime_type, thread_id)
                )

            elif message.get("type") == "ping":
                await _send(websocket, {"type": "pong"})

    except Exception as e:
        print(f"Error in voice websocket main loop: {e}")
    finally:
        if processing_task:
            processing_task.cancel()
        print(f"Voice WebSocket session ended for {session_thread_id}")



async def _send(websocket: WebSocket, payload: dict):
    await websocket.send_text(json.dumps(payload))


_WHISPER_HALLUCINATIONS = frozenset({
    "maintenance", "context", "thank you for watching", "please subscribe",
    "subtitles by", "subtitles", "transcribed by", "translated by",
})

def _is_hallucination(text: str) -> bool:
    return text.strip().lower().rstrip(".,!? ") in _WHISPER_HALLUCINATIONS

_MIN_AUDIO_DB = -38.0

def _wav_is_silent(audio_bytes: bytes) -> bool:
    pcm = audio_bytes[44:]
    if len(pcm) < 2:
        return True
    samples = array.array("h")
    samples.frombytes(pcm[: len(pcm) - len(pcm) % 2])
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))
    db = 20 * math.log10(rms / 32768) if rms > 0 else -100.0
    return db < _MIN_AUDIO_DB


_MIME_TO_EXT = {
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/x-m4a": "m4a",
}

async def _transcribe(audio_bytes: bytes, mime_type: str) -> str:
    ext = _MIME_TO_EXT.get(mime_type, "wav")

    if ext == "wav" and _wav_is_silent(audio_bytes):
        print("[Transcription] Skipped — audio energy below threshold")
        return ""

    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = f"audio.{ext}"
    try:

        result = await client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=audio_file,
            language="en",
            temperature=0,
            prompt="Transcribe exactly what is spoken. Do not add or infer."
        )
        text = result.text.strip()

        if _is_hallucination(text):

            return ""

        return text

    except Exception as e:
        print(f"[Transcription Error] Mime: {mime_type}, Ext: {ext}, Error: {e}")
        raise



async def _sentence_stream_pipeline(
    websocket: WebSocket,
    user_message: str,
    thread_id: str,
):
    """
    Collects the full LLM response, then sends it to the UI and runs TTS
    sentence-by-sentence in order.

    Timeline per turn:
        t=0       LLM starts generating (silently)
        t≈N s     LLM finishes → response_text sent to UI
        t≈N+0.4s  TTS sentence 1 starts → audio_chunk sent to browser
        t≈N+0.8s  TTS sentence 2 starts while browser plays sentence 1
    """
    config = {"configurable": {"thread_id": thread_id}}
    input_data = {"messages": [HumanMessage(content=user_message)]}

    full_response = ""
    buffer = ""
    try:
        async with asyncio.timeout(45): 
            async for event in app_graph.astream_events(input_data, config, version="v2"):
                if event["event"] == "on_chat_model_stream":
                    token = event["data"]["chunk"].content
                    if token:
                        full_response += token
                        buffer += token
                        
                        if any(c in token for c in ".!?"):
                            
                            sentences = _split_into_sentences(buffer)
                            if len(sentences) > 1 or (buffer.strip() and buffer.strip()[-1] in ".!?"):
                                to_process = sentences[:-1] if len(sentences) > 1 else sentences
                                for s in to_process:
                                    if s: await _tts_sentence(websocket, s)
                                
                                buffer = sentences[-1] if len(sentences) > 1 else ""

    except asyncio.TimeoutError:
        print(f"[Timeout] LLM stream exceeded 45 s for thread {thread_id}")

    # Final cleanup for any remaining text in buffer
    if buffer.strip():
        await _tts_sentence(websocket, buffer.strip())

    if not full_response:
        return

    await _send(websocket, {"type": "response_text", "text": full_response})


async def _tts_sentence(websocket: WebSocket, sentence: str):
    """
    Converts one sentence to speech using OpenAI TTS streaming and sends
    the audio bytes to the browser as they arrive (chunked, not buffered).

    Sending multiple small chunks lets the browser's audio queue start
    playing the first chunk while the rest are still downloading.
    """
    try:
        async with asyncio.timeout(10):  # per-sentence TTS timeout
            async with client.audio.speech.with_streaming_response.create(
                model="tts-1",
                voice="alloy",
                input=sentence,
                response_format="wav",
            ) as response:
                audio_bytes = bytearray()
                async for chunk in response.iter_bytes(chunk_size=4096):
                    audio_bytes.extend(chunk)

                # Send the complete WAV for this sentence as one chunk.
                # Each sentence produces a self-contained WAV the browser can decode.
                if audio_bytes:
                    await _send(websocket, {
                        "type": "audio_chunk",
                        "data": base64.b64encode(bytes(audio_bytes)).decode(),
                    })
    except asyncio.TimeoutError:
        print(f"[TTS Timeout] Sentence exceeded 10 s: {sentence[:60]!r}")
    except asyncio.CancelledError:
        raise
    except Exception as e:
        print(f"[TTS Error] {e} — sentence: {sentence[:60]!r}")
