#  Clinical Intake AI Health System

A real-time, AI-powered clinical intake and appointment management system designed to streamline patient interactions across **chat and voice channels**. This system automates patient data collection, generates structured clinical summaries, and integrates directly with telephony for broader accessibility.

---

##  Key Features

### AI Patient Intake

* Real-time conversational assistant powered by **LangGraph**
* Collects symptoms, medical history, and patient details in a structured manner
* Maintains context-aware, human-like conversations

### Voice-Enabled Assistant

* **Telephony Integration**: Supports inbound and outbound calls via **Twilio**
* **Web Voice Interface**: Real-time voice conversations using WebSockets
* **Streaming STT/TTS**: Low-latency speech processing using OpenAI models
* **Barge-in Support**: Users can interrupt naturally during conversations (via VAD)

### Clinical Dashboard

* Appointment scheduling and tracking
* AI-generated **clinical briefs** from conversations
* Full **call logs with transcripts**
* Pre-consult summaries for clinicians

### Doctor Configuration

* Customizable intake flows
* Adjustable AI behavior per clinic or specialty

---

##  System Design & Approach

### 1. Stateful Conversation Orchestration (LangGraph)

Clinical intake requires structured yet flexible flows. This system uses **LangGraph** as a finite state machine to ensure:

* **Phase Control**
  Ensures proper sequencing (e.g., Chief Complaint → HPI → ROS)

* **Context Retention**
  Avoids redundant questions and maintains natural conversation flow

---

### 2. Clinical Data Structuring

The system converts unstructured conversations into standardized medical data:

* **CC (Chief Complaint)**
  Patient’s primary concern in their own words

* **HPI (History of Present Illness)**
  Captures onset, duration, severity, triggers, etc.

* **ROS (Review of Systems)**
  Identifies related symptoms and medical history

* **Structured Output**
  Final output is stored as structured JSON (JSONB), ready for clinical review

---

### 3. Real-Time Voice Pipeline

* **WebSocket Streaming** for minimal latency
* **Voice Activity Detection (VAD)** for natural pauses and interruptions
* **Interrupt Handling (Barge-in)** for fluid conversation
* **Telephony Resilience** via Twilio webhooks for reliable call handling

---

### 4. Backend Architecture

* Fully **asynchronous (FastAPI + SQLAlchemy Async)**
* Handles concurrent voice streams efficiently
* Modular prompt design (separates clinical logic from conversational tone)

---

## Tech Stack

### Backend

* **Framework**: FastAPI (Python)
* **AI Orchestration**: LangChain + LangGraph
* **LLM**: OpenAI GPT-4o
* **Voice/Telephony**: Twilio
* **Database**: PostgreSQL (Async SQLAlchemy)
* **Realtime**: WebSockets

### Frontend

* **Framework**: React 19 (Vite)
* **Styling**: Tailwind CSS

---

## Setup Guide

### Backend Setup

1. Navigate to backend:

   ```bash
   cd backend
   ```

2. Create virtual environment:

   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:

   ```env
   OPENAI_API_KEY=your_openai_key
   DATABASE_URL=postgresql+asyncpg://user:pass@localhost/dbname
   LLM_MODEL=gpt-4o
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_PHONE_NUMBER=your_twilio_number
   PUBLIC_URL=https://your-ngrok-url
   ```

5. Start backend server:

   ```bash
   uvicorn main:app --reload
   ```

6. Expose server for Twilio:

   ```bash
   ngrok http 8000
   ```

   Update `PUBLIC_URL` with the generated URL.

---

### Frontend Setup

1. Navigate to frontend:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run development server:

   ```bash
   npm run dev
   ```

---

## 📞 Telephony Workflow (Twilio)

### Inbound Calls

1. Configure Twilio phone number webhook:

   ```
   https://<your-public-url>/api/twilio/incoming
   ```
2. Twilio sends call events → backend
3. Backend connects call to AI voice stream

---

### Outbound Calls

To initiate outbound calls:

1. Use Twilio API to create a call:

   * `url` should point to:

     ```
     https://<your-public-url>/api/twilio/outgoing
     ```

2. Twilio requests this endpoint → returns TwiML

3. TwiML connects call to your WebSocket/stream handler

---
