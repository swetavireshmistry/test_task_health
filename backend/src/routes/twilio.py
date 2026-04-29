import asyncio
import datetime
import base64
import json
import os
import audioop
import io
import uuid
import wave
import openai
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, Response
from langchain_core.messages import HumanMessage
from src.llm_section.graph.graph import app_graph
from src.db.database import get_db
from src.models.call_log import CallLog
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, Response, Depends
from twilio.rest import Client as TwilioClient
from fastapi.responses import JSONResponse

router = APIRouter()
client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Twilio constants
TWILIO_SAMPLE_RATE = 8000
SILENCE_THRESHOLD = 500  # PCM amplitude threshold for silence
SILENCE_DURATION = 1.5  # increased from 0.8 to avoid premature capture

@router.post("/incoming")
async def twilio_voice(request: Request, db: AsyncSession = Depends(get_db)):
    """
    TwiML endpoint for inbound calls.
    Instructs Twilio to open a bi-directional Media Stream.
    """
    # Log the incoming call
    form_data = await request.form()
    call_sid = form_data.get("CallSid")
    from_number = form_data.get("From")
    to_number = form_data.get("To")
    
    if call_sid:
        print(f"Incoming call SID: {call_sid} from {from_number}")
        from sqlalchemy import select
        # Check if log already exists (for outbound calls)
        query = select(CallLog).where(CallLog.call_sid == call_sid)
        result = await db.execute(query)
        existing_log = result.scalars().first()
        
        if not existing_log:
            print(f"Creating new CallLog for {call_sid}")
            new_log = CallLog(
                call_sid=call_sid,
                from_number=from_number,
                to_number=to_number,
                status="in-progress",
                direction="inbound"
            )
            db.add(new_log)
        else:
            print(f"Updating existing CallLog for {call_sid}")
            existing_log.status = "in-progress"
            
        await db.commit()

    public_url = os.getenv("PUBLIC_URL")
    if public_url:
        stream_url = f"{public_url.replace('http://', 'ws://').replace('https://', 'wss://')}/api/twilio/stream"
    else:
        host = request.headers.get("host")
        protocol = "wss" if request.headers.get("x-forwarded-proto") == "https" else "ws"
        stream_url = f"{protocol}://{host}/api/twilio/stream"
    
    print(f"Connecting to stream URL: {stream_url}")
    
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Connect>
            <Stream url="{stream_url}">
                <Parameter name="callSid" value="{call_sid}" />
            </Stream>
        </Connect>
    </Response>
    """
    return Response(content=twiml, media_type="application/xml")

@router.get("/logs")
async def get_call_logs(db: AsyncSession = Depends(get_db)):
    """
    Retrieve all call logs from the database.
    """
    from sqlalchemy import select
    query = select(CallLog).order_by(CallLog.start_time.desc())
    result = await db.execute(query)
    logs = result.scalars().all()
    return logs

@router.post("/call")
async def make_call(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Initiate an outbound call.
    """
    data = await request.json()
    to_number = data.get("to_number")
    if not to_number:
        return JSONResponse(status_code=400, content={"error": "Missing to_number"})

    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")
    
    public_url = os.getenv("PUBLIC_URL")
    if not public_url:
        return JSONResponse(status_code=400, content={"error": "PUBLIC_URL not set in .env. Twilio requires a public URL for callbacks."})
    
    callback_url = f"{public_url}/api/twilio/incoming"
    
    if "localhost" in callback_url:
        return JSONResponse(status_code=400, content={"error": f"Invalid callback URL: {callback_url}. Twilio cannot reach localhost."})

    try:
        client = TwilioClient(account_sid, auth_token)
        call = client.calls.create(
            to=to_number,
            from_=from_number,
            url=callback_url
        )
        
        # Log the outgoing call
        new_log = CallLog(
            call_sid=call.sid,
            from_number=from_number,
            to_number=to_number,
            status="queued",
            direction="outbound"
        )
        db.add(new_log)
        await db.commit()
        
        return {"call_sid": call.sid, "status": call.status}
    except Exception as e:
        print(f"Error initiating outbound call: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.websocket("/stream")
async def twilio_stream(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    await websocket.accept()
    print("Twilio Media Stream WebSocket connected")
    
    stream_sid = None
    call_sid = None
    audio_buffer = bytearray()
    silence_counter = 0
    is_processing = False
    
    # Session state
    thread_id = str(uuid.uuid4())
    transcript_list = []
    
    async def speak(text: str):
        nonlocal is_processing, audio_buffer, silence_counter
        if not stream_sid:
            return
        
        # Mark as processing while speaking
        was_processing = is_processing
        is_processing = True
        
        # Clear buffer and reset silence when AI starts speaking
        audio_buffer.clear()
        silence_counter = 0
        
        try:
            print(f"Synthesizing: {text}")
            transcript_list.append(f"AI: {text}")
            async with client.audio.speech.with_streaming_response.create(
                model="gpt-4o-mini-tts",
                voice="nova",
                input=text,
                # ...
                response_format="pcm",
            ) as response:
                async for chunk in response.iter_bytes(chunk_size=4096):
                    # Downsample 24k to 8k and convert to μ-law
                    resampled, _ = audioop.ratecv(chunk, 2, 1, 24000, 8000, None)
                    mulaw_data = audioop.lin2ulaw(resampled, 2)
                    
                    payload = base64.b64encode(mulaw_data).decode("utf-8")
                    await websocket.send_text(json.dumps({
                        "event": "media",
                        "streamSid": stream_sid,
                        "media": {
                            "payload": payload
                        }
                    }))
        except Exception as e:
            print(f"Error in speak: {e}")
        finally:
            # If we were called from outside process_turn (e.g. greeting), 
            # we should restore or handle is_processing carefully.
            # For now, we'll keep it simple: speak's finally won't reset is_processing 
            # if process_turn is managing it, but for standalone calls like greeting, 
            # we need to be careful.
            pass

    async def process_turn():
        nonlocal is_processing, audio_buffer
        if is_processing or not audio_buffer:
            return
        
        # Minimum audio length for Whisper is ~0.1s
        # 0.1s at 8000Hz = 800 bytes of mu-law
        if len(audio_buffer) < 800:
            audio_buffer.clear()
            return

        is_processing = True
        buffer_copy = bytes(audio_buffer)
        audio_buffer.clear()
        
        try:
            # Convert μ-law to WAV for Whisper
            wav_io = io.BytesIO()
            with wave.open(wav_io, "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(TWILIO_SAMPLE_RATE)
                pcm_data = audioop.ulaw2lin(buffer_copy, 2)
                wav_file.writeframes(pcm_data)
            
            wav_io.seek(0)
            wav_io.name = "audio.wav"
            
            transcript_res = await client.audio.transcriptions.create(
                model="gpt-4o-transcribe",
                file=wav_io,
                language="en",
                temperature=0.0,
                prompt="A medical intake phone call. The user is providing personal details and symptoms."
            )
            text = transcript_res.text.strip()
            
            if text:
                print(f"User: {text}")
                transcript_list.append(f"User: {text}")
                config = {"configurable": {"thread_id": thread_id}}
                input_data = {"messages": [HumanMessage(content=text)]}
                
                full_response = ""
                sentence_buffer = ""
                async for event in app_graph.astream_events(input_data, config, version="v2"):
                    if event["event"] == "on_chat_model_stream":
                        token = event["data"]["chunk"].content
                        if token:
                            full_response += token
                            sentence_buffer += token
                            if any(c in token for c in ".!?"):
                                await speak(sentence_buffer.strip())
                                sentence_buffer = ""
                
                if sentence_buffer.strip():
                    await speak(sentence_buffer.strip())
            
        except Exception as e:
            print(f"Error in process_turn: {e}")
        finally:
            is_processing = False
            # Clear buffer again to be safe after finishing response
            audio_buffer.clear()
            silence_counter = 0

    try:
        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            
            if data["event"] == "start":
                stream_sid = data["start"]["streamSid"]
                call_sid = data["start"]["customParameters"].get("callSid")
                print(f"Stream started: {stream_sid} for call: {call_sid}")
                # Initial greeting
                async def greeting():
                    nonlocal is_processing
                    is_processing = True
                    await speak("Hello! I am your health assistant. How can I help you?")
                    is_processing = False
                
                asyncio.create_task(greeting())
                
            elif data["event"] == "media":
                # ... (rest of media handling)
                if is_processing:
                    continue
                    
                payload_b64 = data["media"]["payload"]
                payload = base64.b64decode(payload_b64)
                
                # Check for silence
                pcm = audioop.ulaw2lin(payload, 2)
                rms = audioop.rms(pcm, 2)
                
                if rms < SILENCE_THRESHOLD:
                    silence_counter += len(payload) / TWILIO_SAMPLE_RATE
                    if len(audio_buffer) > 0:
                        # Include silence in the buffer to maintain natural speech rhythm
                        audio_buffer.extend(payload)
                else:
                    silence_counter = 0
                    audio_buffer.extend(payload)
                
                if silence_counter >= SILENCE_DURATION and len(audio_buffer) > 0:
                    asyncio.create_task(process_turn())
                    silence_counter = 0
                    
            elif data["event"] == "stop":
                print("Stream stopped")
                break

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        if call_sid:
            try:
                from sqlalchemy import update
                full_transcript = "\n".join(transcript_list)
                query = update(CallLog).where(CallLog.call_sid == call_sid).values(
                    status="completed",
                    transcript=full_transcript,
                    end_time=datetime.datetime.utcnow()
                )
                await db.execute(query)
                await db.commit()
                print(f"Call {call_sid} marked as completed with transcript")
            except Exception as e:
                print(f"Error updating call status: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
