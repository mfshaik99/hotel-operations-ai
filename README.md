# Hotel Operations AI — Elite Business Operations Agent

> **"Every Guest Request. Every Department. One AI-Powered Team."**

Hotel Operations AI is an autonomous, multi-agent operations coordination platform built for modern luxury hotels. Instead of isolated chatbots or disconnected departmental ticketing queues, it unifies **Reception**, **Housekeeping**, **Maintenance**, and **Management** into a single collaborative ecosystem powered by Google Gemini and connected through **Switch** (by SandboxAQ) with real-time human-agent collaboration.

---

## 1. Executive Summary

Hotel operations suffer from fragmentation: guest inquiries received via telephone, WhatsApp, or concierge desks frequently contain multi-layered issues that cross organizational boundaries. When a guest mentions an air conditioning failure alongside a request for extra towels and a late checkout inquiry, traditional software either loses secondary requests or creates chaotic manual phone tag.

**Hotel Operations AI solves this by introducing:**
1. **Interactive Real-Time Team Collaboration Room:** A genuine shared collaboration workspace where human hotel teammates (Front Desk, Duty Manager, Engineers, Housekeeping Leads) and specialized AI Agents communicate, delegate tasks, and solve operational problems in real time over WebSockets and Server-Sent Events.
2. **Intelligent Decomposition Engine:** Analyzes informal, multi-problem guest communications and breaks them into independent, department-owned tasks with target SLAs and explicit dependency ordering.
3. **Missing-Room Safeguard:** Strictly refuses to invent or hallucinate default room numbers when omitted by the guest, prompting the Reception Agent to request immediate clarification.
4. **Specialized Multi-Agent Team:** 5 independent agents (Central Operations AI, Reception Agent, Housekeeping Agent, Maintenance Agent, Management Agent) with distinct domain protocols and defined autonomy clearance.
5. **Room 204 End-to-End Operational Workflow:** Demonstrates a real guest request (AC not working + extra towels) decomposing into tasks, dispatching to technicians, updating progress in chat, and awaiting human sign-off.
6. **10-Stage Reliable Task Lifecycle:** Tracks cases from `REQUEST_RECEIVED` through `COMPLETION_PENDING_CONFIRMATION` to authorized `RESOLVED`.
7. **Human-in-the-Loop Completion Gate (Principle #8):** Physical tasks cannot be marked `Resolved` by AI; an authorized employee must confirm execution with their badge/name and completion notes.
8. **Genuine Switch Integration:** Multi-agent collaboration room connecting AI teammates and human staff through SandboxAQ's Switch protocol, with real HTTP webhook dispatch and verifiable delivery states.
9. **Durable File-Backed Persistence:** Atomic JSON database (`/data/hotel_operations_db.json`) preserving task states, immutable audit trails, and team chat logs across browser refreshes.

---

## 2. Core Architecture

The platform is built as a production-grade full-stack TypeScript application running on Express and React 19 with Vite, WebSockets, and Server-Sent Events.

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
               | Real-Time Team Collaboration Room |
               | (WebSockets + SSE + Switch Mesh)  |
               | [Human Staff <---> AI Agents]     |
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

## 3. Real-Time Team Collaboration Room

The collaboration room provides an authentic operations space where human staff and AI teammates converse:

### Active Roster
- **Human Teammates:**
  - *Elena Rostova* (Front Desk Lead)
  - *Marcus Vance* (Executive Duty Manager)
  - *Carlos Mendez* (Chief Plant Engineer)
  - *Maria Santos* (Head of Housekeeping)
- **Specialized AI Agents:**
  - *Central Operations AI* (Orchestrator & GM Brain)
  - *Reception Agent* (Front Office Intelligence)
  - *Housekeeping Agent* (Linen & Cleanliness Dispatch)
  - *Maintenance Agent* (Physical Plant & HVAC Diagnostics)
  - *Management Agent* (Executive Escalations & Recovery)

### Teammate Features
- **Sender Switcher:** Choose who to post as (Elena, Marcus, Carlos, Maria, or Staff Member).
- **Autonomous Intent Detection:** When staff post operational requests (e.g. *"Room 204 needs extra towels and the AC is not working"*), Central Operations AI immediately decomposes the request into real tasks, allocates SLAs, and dispatches the relevant agents.
- **Departmental Channels:** `#operations-general`, `#reception-frontdesk`, `#engineering-maintenance`, `#housekeeping-turnover`, `#management-escalations`.
- **Contextual Task Chips:** Embedded task pills (e.g. `[CAS-8201] Suite 204`) link directly to the task inspector and allow one-click human completion verification.
- **Typing Indicators:** Real-time feedback when AI agents or teammates are analyzing requests.
- **Delivery States:** Transparent message states (`DELIVERED`, `ACKNOWLEDGED`).

---

## 4. The 10-Stage Task Lifecycle

Tasks strictly progress through an auditable lifecycle:

1. `REQUEST_RECEIVED` — Guest inquiry or teammate report logged.
2. `ANALYZING` — Central Operations AI analyzes intent and evaluates missing information.
3. `TASK_CREATED` — Individual operational task recorded with case reference.
4. `ASSIGNED` — Allocated to designated departmental agent.
5. `DELIVERY_PENDING` — Webhook or internal mesh dispatch queued.
6. `DELIVERED` — Delivery confirmed at the department queue.
7. `ACCEPTED` — Assigned agent acknowledges and dispatches physical staff.
8. `IN_PROGRESS` — Staff en route or active on-site with SLA timer running.
9. `COMPLETION_PENDING_CONFIRMATION` — Physical work completed; holds here pending human verification.
10. `RESOLVED` — Authorized human staff enters badge ID and signs off on resolution.

---

## 5. Security & Data Integrity

- **Secret Redaction:** Gemini API keys and Switch bearer tokens are redacted (`••••••••`) from all client-facing API responses.
- **SSRF Protection:** Switch room webhook URLs are validated against private IP blocks (127.0.0.1, 10.x, 192.168.x, 172.16-31.x) and cloud metadata services (169.254.169.254).
- **Atomic File Writes:** Database writes write to a temporary file (`.tmp`) before atomic rename, preventing file corruption under concurrent operations.
- **Mandatory Staff Sign-Off:** Task verification requires explicit `staffName` and `badgeId` parameters.

---

## 6. The 8 Application Sections

The UI is designed according to Linear and Stripe-tier SaaS standards:

| Section | Route Key | Purpose |
|---|---|---|
| **1. Executive Overview** | `overview` | High-level property health, active cases counter, verified SLA compliance percentage, department workload distribution, and live risk radar. |
| **2. Guest Requests** | `requests` | Intelligent request decomposition intake, missing-room safeguard alert banner with Reception prompt, interactive sample scenario buttons, and auditable requests ledger. |
| **3. Operations Task Center** | `tasks` | Linear-style task grid with live 10-second SLA countdowns, department filtering, task detail drawer, and the Human Completion Verification sign-off modal. |
| **4. Team Chat** | `team-chat` | **The Star Feature:** Real-time team collaboration room connecting human staff and AI agents with live WebSockets, autonomous coordination, and the Room 204 live workflow demo. |
| **5. Switch Operations Room** | `switch` | Multi-agent collaboration workspace displaying real-time agent dialogues, delivery status badges (`DELIVERED`, `LOCAL_MESH`), source filtering (`LIVE_AGENT` vs `DEMO_SEED`), and live event dispatching. |
| **6. AI Agent Management** | `agents` | Detailed inspection cards for each of the 5 agents, showcasing active case loads, response velocity, autonomy level (`Full Delegated Authority`, `Supervisor Review Required`, `Executive Clearance Only`), and interactive domain protocol triggers. |
| **7. Management Intelligence** | `intelligence` | Real-time analytics computed strictly from server state, separating verified human-completed metrics from active estimates. |
| **8. Settings & Integrations** | `settings` | Live Gemini engine status, Switch room webhook configuration with real HTTP probe ping button, honest status indicator (`CONNECTED`, `DISCONNECTED`, `NOT_CONFIGURED`), and database reset controls. |

---

## 7. Switch Integration Protocol

SandboxAQ's Switch enables autonomous agents to collaborate within shared team spaces ("Switch Rooms"). Hotel Operations AI implements both a local high-performance agent mesh and a real HTTP webhook dispatcher.

### Webhook Dispatch Envelope
When an event occurs (e.g. `TASK_CREATED`, `SLA_ACTIVE`, `ESCALATED`, or `HUMAN_VERIFIED`), the server dispatches a structured JSON payload to the configured Switch room webhook:

```json
{
  "protocol": "switch.v1",
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
The platform enforces transparency and **never falsely claims an external Switch connection exists**:
- `NOT_CONFIGURED`: Default state when no external room webhook URL is provided. Operates on local agent mesh.
- `DISCONNECTED`: A webhook URL is configured but network connectivity failed or returned a non-2xx status code.
- `CONNECTION_FAILED`: Network timeout, DNS failure, or connection refused during probe.
- `UNVERIFIED_GENERIC_WEBHOOK`: The target URL returned HTTP 200, but did not supply the required SandboxAQ Switch protocol headers (`X-Switch-Room-Status` or Switch v1 JSON envelope). The platform explicitly refuses to certify this as connected.
- `CONNECTED`: Verified only when an authentic SandboxAQ Switch protocol handshake is confirmed via headers or protocol envelope.

---

## 8. Security & Operating Principle Verification

The platform enforces strict security and non-bypassable business rules:

| Security Rule | Mechanism | Enforcement |
| :--- | :--- | :--- |
| **Bi-Directional WebSockets** | Native `ws://` / `wss://` on `/ws` | Real-time chat duplex with SSE resilient fallback |
| **Teammate Authentication** | Staff PIN & Badge verification | `POST /api/auth/staff-login` rejects spoofing (401) |
| **Principle #8 Enforcement** | Anti-Bypass Guard | `PATCH /api/tasks/:id` rejects `{ status: 'Resolved' }` with 403 Forbidden |
| **Human Sign-off Endpoint** | `POST /api/tasks/:id/verify` | Requires active staff token, checklist verification, and physical inspection notes |
| **Demo Scenario Labeling** | Explicit metadata tags | All Room 204 simulated messages display `[DEMO SCENARIO (ROOM 204)]` |
| **Switch Protocol Handshake** | Strict header validation | Generic webhooks classified as `UNVERIFIED_GENERIC_WEBHOOK` |
| **Durable Atomic Writes** | Safe write with exit check | All mutating endpoints return HTTP 500 on disk write failure |

### Staff Directory & Security PINs (For Reviewers & Judges)
- **Elena Rostova** (Front Desk Lead) — Badge: `REC-104` | PIN: `1042`
- **Marcus Vance** (Duty Manager) — Badge: `DM-9001` | PIN: `9001`
- **Carlos Mendez** (Lead HVAC Engineer) — Badge: `ENG-402` | PIN: `4021`
- **Maria Santos** (Housekeeping Supervisor) — Badge: `HK-3105` | PIN: `3105`

---

## 9. Development & Automated Test Suite

### Installation
```bash
# Clone the repository
git clone https://github.com/mfshaik99/hotel-operations-ai.git
cd hotel-operations-ai

# Install dependencies
npm install

# Start development server (Port 3000)
npm run dev
```

### Running Automated Security & Operations Tests
```bash
# Runs the full security and verification test suite via Node:test
npx tsx --test tests/operations_security.test.ts
```

All 6 automated tests verify:
1. Rejection of unauthenticated human messages (401).
2. Proper staff PIN authentication.
3. Rejection of invalid staff PINs.
4. Blocking of human completion bypass via PATCH (403 Forbidden).
5. Legitimate human completion verification with checklist and staff token.
6. Safeguards requiring clarification when room numbers are omitted.

### Production Build
```bash
npm run build
npm start
```

---

## 10. Hackathon Presentation Walkthrough

When presenting this application to judges or stakeholders:
1. **Open the Team Collaboration Room:** Go to **Team Chat** to show the live operations room where authenticated human teammates and AI agents collaborate over WebSockets.
2. **Execute the Room 204 Demonstration:** Click *"Run Room 204 Demonstration"*. Notice the prominent amber `[DEMO SCENARIO (ROOM 204)]` badges identifying the simulation scenario, as Central Operations AI decomposes the request into `#CAS-8201` and `#CAS-8202` and agents acknowledge.
3. **Verify Physical Completion (Principle #8):** Click *"Sign Off"* on a task chip in the chat feed. Demonstrate that general updates cannot resolve a physical task without staff PIN authentication, in-suite checklist confirmation, and authorized sign-off.
4. **Interactive Natural Language Inquiry:** Post a message as Front Desk: *"What is the status of Suite 412?"* and watch Central Operations AI query live state via Gemini AI and reply in real time.
5. **Demonstrate Missing-Room Safeguard:** In **Guest Requests**, click the *"Emergency Service Failure with Missing Room Number"* preset. Observe how Central AI flags `detectedRoom: null` and refuses to guess, prompting the Reception Agent to ask the guest for suite confirmation.
6. **Test Switch Integration:** In **Settings**, test a webhook endpoint and inspect how the system distinguishes authentic Switch protocol handshakes from unverified generic webhooks.
