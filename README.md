# Hotel Operations AI — Elite Business Operations Agent

> **"Every Guest Request. Every Department. One AI-Powered Team."**

Hotel Operations AI is an autonomous, multi-agent operations coordination platform built for modern luxury hotels. Instead of isolated chatbots or disconnected departmental ticketing queues, it unifies **Reception**, **Housekeeping**, **Maintenance**, and **Management** into a single collaborative ecosystem powered by Google Gemini and connected through **Switch** (by SandboxAQ).

---

## 1. Executive Summary

Hotel operations suffer from fragmentation: guest inquiries received via telephone, WhatsApp, or concierge desks frequently contain multi-layered issues that cross organizational boundaries. When a guest mentions an air conditioning failure alongside a request for extra towels and a late checkout inquiry, traditional software either loses secondary requests or creates chaotic manual phone tag.

**Hotel Operations AI solves this by introducing:**
1. **Intelligent Decomposition Engine:** Analyzes informal, multi-problem guest communications and breaks them into independent, department-owned tasks with target SLAs and explicit dependency ordering.
2. **Missing-Room Safeguard:** Strictly refuses to invent or hallucinate default room numbers when omitted by the guest, prompting the Reception Agent to request immediate clarification.
3. **Specialized Multi-Agent Team:** 5 independent agents (Central Operations AI, Reception Agent, Housekeeping Agent, Maintenance Agent, Management Agent) with distinct domain protocols and defined autonomy clearance.
4. **Genuine Switch Integration:** Multi-agent collaboration room connecting AI teammates and human staff through SandboxAQ's Switch protocol, with real HTTP webhook dispatch and verifiable delivery states.
5. **Human-in-the-Loop Completion Gate (Principle #8):** Physical tasks cannot be marked `Resolved` by AI; an authorized employee must confirm execution with their badge/name and completion notes.
6. **Durable File-Backed Persistence:** Persistent JSON database (`/data/hotel_operations_db.json`) preserving task states, immutable audit trails, and Switch event logs across browser refreshes.

---

## 2. Core Architecture

The platform is built as a production-grade full-stack TypeScript application running on Express and React 19 with Vite.

```
                      +-----------------------------------+
                      |         Guest Request             |
                      |  (Spoken / WhatsApp / Concierge)  |
                      +-----------------+-----------------+
                                        |
                                        v
                      +-----------------------------------+
                      |   Intelligent Request Parser      |
                      |   (Gemini 2.5 Flash / Fallback)   |
                      +-----------------+-----------------+
                                        |
                 [Has Suite Number?] ---+--- [Missing Suite Number?]
                         |                              |
                         v                              v
            +------------------------+      +------------------------+
            |  Autonomous Task       |      | Reception Safeguard    |
            |  Decomposition Matrix  |      | Clarification Trigger  |
            +------------+-----------+      +------------------------+
                         |
      +------------------+------------------+------------------+
      |                  |                  |                  |
      v                  v                  v                  v
+-----------+      +-----------+      +-----------+      +-----------+
| Reception |      |Housekeep. |      |Maintenance|      |Management |
|   Agent   |      |   Agent   |      |   Agent   |      |   Agent   |
+-----+-----+      +-----+-----+      +-----+-----+      +-----+-----+
      |                  |                  |                  |
      +------------------+------------------+------------------+
                                 |
                                 v
               +-----------------------------------+
               |      SandboxAQ Switch Room        |
               | (Real Webhook / Local Agent Mesh) |
               +-----------------+-----------------+
                                 |
                                 v
               +-----------------------------------+
               | Human-in-the-Loop Physical Gate   |
               | (Staff Badge + In-Suite Sign-off) |
               +-----------------+-----------------+
                                 |
                                 v
               +-----------------------------------+
               |   Verified Resolution & Ledger    |
               +-----------------------------------+
```

---

## 3. The 7 Application Sections

The UI is designed according to Linear and Stripe-tier SaaS standards, completely avoiding decorative gradients, uninformative pill badges, or simulated metrics:

| Section | Route Key | Purpose |
|---|---|---|
| **1. Executive Overview** | `overview` | High-level property health, active cases counter, verified SLA compliance percentage, department workload distribution, and live risk radar. |
| **2. Guest Requests** | `requests` | Intelligent request decomposition intake, missing-room safeguard alert banner with Reception prompt, interactive sample scenario buttons, and auditable requests ledger. |
| **3. Operations Task Center** | `tasks` | Linear-style task grid with live 10-second SLA countdowns, department filtering, task detail drawer, and the Human Completion Verification sign-off modal. |
| **4. Switch Operations Room** | `switch` | Multi-agent collaboration workspace displaying real-time agent dialogues, delivery status badges (`DELIVERED`, `LOCAL_MESH`), source filtering (`LIVE_AGENT` vs `DEMO_SEED`), and live event dispatching. |
| **5. AI Agent Management** | `agents` | Detailed inspection cards for each of the 5 agents, showcasing active case loads, response velocity, autonomy level (`Full Delegated Authority`, `Supervisor Review Required`, `Executive Clearance Only`), and interactive domain protocol triggers. |
| **6. Management Intelligence** | `intelligence` | Real-time analytics computed strictly from server state, separating verified human-completed metrics from active estimates. |
| **7. Settings & Integrations** | `settings` | Live Gemini engine status, Switch room webhook configuration with real HTTP probe ping button, honest status indicator (`CONNECTED`, `DISCONNECTED`, `NOT_CONFIGURED`), and database reset controls. |

---

## 4. Switch Integration Protocol

SandboxAQ's Switch enables autonomous agents to collaborate within shared team spaces ("Switch Rooms"). Hotel Operations AI implements both a local high-performance agent mesh and a real HTTP webhook dispatcher.

### Webhook Dispatch Envelope
When an event occurs (e.g. `TASK_CREATED`, `SLA_ACTIVE`, `ESCALATED`, or `HUMAN_VERIFIED`), the server dispatches a structured JSON payload to the configured Switch room webhook:

```json
{
  "roomId": "hotel-operations-room",
  "channel": "#hotel-ops-central",
  "sender": {
    "name": "Maintenance Agent",
    "role": "Engineering"
  },
  "eventType": "TASK_CREATED",
  "content": "New Operational Task created: [CAS-8091] Suite 412 - Inspect chilled-water HVAC unit",
  "roomNumber": "412",
  "taskId": "task-101",
  "timestamp": "2026-11-04T16:00:00.000Z"
}
```

### Honest Connection Status States
The platform enforces transparency and **never falsely claims an external connection exists**:
- `NOT_CONFIGURED`: Default state when no external room webhook URL is provided. Operates on local agent mesh.
- `DISCONNECTED`: A webhook URL is configured but network connectivity failed or returned a non-2xx status code.
- `CONNECTED`: Verified only after an actual HTTP POST request to the Switch room succeeds with HTTP 200 OK.

---

## 5. Departmental AI Agents & Autonomy

| Agent Name | Avatar | Department | Autonomy Clearance | Specialty & Domain Protocols |
|---|---|---|---|---|
| **Central Operations AI** | `CO` | Management | Full Delegated Authority | Autonomous orchestration, cross-department routing, SLA enforcement (`SLA_ENFORCER_V2`, `DEPENDENCY_RESOLVER`). |
| **Reception Agent** | `RX` | Reception | Full Delegated Authority | Front office, VIP check-in, room key lock sync, folio dispute mediation (`RFID_MORTISE_SYNC`, `FOLIO_DISPUTE_GUARD`). |
| **Housekeeping Agent** | `HK` | Housekeeping | Supervisor Review Required | Room cleanliness, turndown scheduling, linen replenishment (`TURNDOWN_LOAD_BALANCER`, `LINEN_BUFFER_MONITOR`). |
| **Maintenance Agent** | `MT` | Maintenance | Full Delegated Authority | Chilled-water HVAC, digital plumbing diagnostics, electrical failover (`HVAC_CHILLED_WATER_GUARD`, `PLUMBING_ISOLATION_NET`). |
| **Management Agent** | `GM` | Management | Executive Clearance Only | VIP service recovery, high-impact escalations, duty manager coordination (`SERVICE_RECOVERY_PROTOCOL`). |

---

## 6. Operating Principle #8: Human-in-the-Loop Sign-off

Artificial intelligence in hospitality must never replace human verification of physical reality:
- When a task reaches completion in the physical world (e.g. an AC compressor is repaired or towels are placed in a bathroom), it transitions to `Awaiting Human Confirmation`.
- The task **remains active on the ledger** until an authorized human employee submits:
  1. Staff Member Name / ID Badge.
  2. In-Suite Verification Checklist confirmation.
  3. Physical resolution notes.
- Only then is the task moved to `Resolved`, timestamped, and recorded in the permanent audit trail.

---

## 7. API Reference

The backend exposes the following REST endpoints on `http://localhost:3000`:

### Core Operations
- `GET /api/health` — Returns system diagnostics, API key status, persistence engine stats, and Switch connection state.
- `GET /api/tasks` — Retrieves all tasks.
- `POST /api/tasks` — Creates new decomposed tasks and optionally forwards them to the Switch room.
- `PATCH /api/tasks/:id` — Updates task status, priority, or records human completion verification with audit trail.
- `GET /api/requests` — Retrieves historical guest requests.
- `POST /api/requests` — Logs a new guest inquiry.
- `GET /api/messages` — Retrieves Switch ops room messages.
- `POST /api/messages` — Posts a message and dispatches it to the Switch room.
- `GET /api/agents` — Returns agent profiles with dynamic active task counts.
- `GET /api/alerts` — Returns operational risk radar alerts.
- `POST /api/reset-demo` — Restores database to clean demonstration seed.

### Switch Integration
- `GET /api/switch/config` — Returns current Switch configuration and connection status.
- `POST /api/switch/config` — Updates Switch room webhook URL, room ID, channel, and bearer credentials.
- `POST /api/switch/test` — Dispatches a live HTTP probe ping to verify real Switch room connectivity.
- `POST /api/switch/dispatch` — Broadcasts custom Switch protocol event envelopes.

### AI Intelligence (Gemini 2.5 Flash)
- `POST /api/gemini/parse-request` — Decomposes complex guest text into tasks and enforces the missing-room safeguard.
- `POST /api/gemini/operational-decision` — Central Operations AI managerial decision engine.
- `POST /api/gemini/switch-dialogue` — Generates multi-agent collaborative alignment dialogues.

---

## 8. Development & Quickstart

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation
```bash
# Clone the repository
git clone https://github.com/mfshaik99/hotel-operations-ai.git
cd hotel-operations-ai

# Install dependencies
npm install

# Start development server
npm run dev
```

The application runs full-stack at `http://localhost:3000` with the Express API and Vite React frontend mounted concurrently.

### Production Build
```bash
npm run build
npm start
```

---

## 9. Hackathon Presentation Walkthrough

When presenting this application to judges or stakeholders:
1. **Intake Multi-Department Request:** Open **Guest Requests** and click the *"Multi-Department Suite Request (AC + Towels + Late Checkout)"* scenario. Watch Central AI instantly break the request into 3 distinct tasks across Maintenance, Housekeeping, and Reception with dependency tracking.
2. **Demonstrate Missing-Room Safeguard:** Click the *"Emergency Service Failure with Missing Room Number"* preset. Observe how Central AI flags `detectedRoom: null` and refuses to guess, prompting the Reception Agent to ask the guest for suite confirmation.
3. **Inspect the Operations Task Center:** View live SLA countdowns updating in real time. Show the immutable audit trail in the Task Detail Drawer.
4. **Trigger Human Verification:** Click *"Sign Off"* on an active task. Note that AI cannot self-complete physical work—enter a staff badge ID and confirm resolution.
5. **Switch Operations Room:** Open the Switch room to see autonomous multi-agent coordination with honest provenance badges (`LIVE_AGENT`, `SWITCH_PROTOCOL`, `DEMO_SEED`).
6. **Test Switch Integration:** Navigate to **Settings**, enter a Switch Room Webhook URL, and click *"Send Switch Probe Ping"* to demonstrate the honest `CONNECTED` vs `DISCONNECTED` verification engine.
