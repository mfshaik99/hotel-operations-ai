# HotelOS AI — Full-Service Hotel Operations Blueprint

## Product goal

HotelOS AI is a human-supervised, multi-agent operating layer for a complete hotel. It coordinates guest-facing services and back-of-house departments through one operational workspace. It is not intended to replace the hotel's property-management system (PMS), point-of-sale (POS), payment processor, access-control system, or staff judgment. Those systems remain systems of record and are integrated through explicit, permissioned adapters.

## Agent roster

| Agent | Department | Primary responsibility |
|---|---|---|
| Central Operations AI | Management | Intake triage, task decomposition, routing, dependencies, SLA monitoring and escalation |
| Reception Agent | Reception | Reservations, arrivals, check-in/out, room assignment and guest folios |
| Guest Concierge Agent | Guest Experience | Guest questions, special requests, complaints and concierge coordination |
| Housekeeping Agent | Housekeeping | Room cleaning, inspections, linen, amenities and room-readiness handoffs |
| Room Service Agent | Room Service | In-room dining intake, order routing, delivery status and guest updates |
| Restaurant Agent | Food & Beverage | Table requests, restaurant reservations, kitchen coordination and service status |
| Maintenance Agent | Maintenance | HVAC, plumbing, electrical, lift and room-equipment work orders |
| Inventory & Procurement Agent | Inventory & Procurement | Stock monitoring, replenishment requests, vendor follow-up and purchase approvals |
| Staff Management Agent | Staff Management | Shift coverage, workload balancing, attendance exceptions and staff dispatch |
| Finance Agent | Finance | Folio checks, invoice review, payment reconciliation and exception reporting |
| Revenue & Pricing Agent | Revenue | Occupancy analysis, demand forecasts and rate recommendations |
| Management Agent | Management | Executive oversight, service recovery, risk review and approval gates |

The canonical frontend roster lives in `src/data/hotelBlueprint.ts`. Agent definitions describe configured capabilities; they do not imply that a live external agent or Switch connection is already running.

## Cross-department workflow

Example: a guest in room 305 reports that the air conditioner is not cooling, asks for two towels, and orders dinner.

1. Central Operations AI records the intake and checks that the room identifier is present.
2. The request is decomposed into separate Maintenance, Housekeeping and Room Service tasks.
3. Each task receives an owner, priority, SLA target, room reference and audit history.
4. The agents coordinate dependencies and status updates in the shared team room.
5. Human staff accept and perform physical work; the app records progress.
6. A staff member confirms completion. AI agents cannot attest that physical work has happened.
7. The guest-facing status is updated only from recorded task events.

## Operating principles

- **Human verification:** physical work, guest identity checks, room access, cash handling and safety-critical actions require authorized staff confirmation.
- **Approval gates:** refunds, compensation, rate changes, purchases, payroll changes and other financial or personnel-impacting actions require the relevant human approval.
- **Least privilege:** each staff role and agent receives only the permissions needed for its department.
- **Auditability:** record the actor, action, timestamp, source, affected record and approval evidence for operational changes.
- **Truthful runtime state:** distinguish demo data, local agent simulation, connected Switch agents and confirmed external-system events.
- **Safe integrations:** connect PMS, POS, payment, messaging and smart-room systems through validated adapters; never store credentials in frontend code or commit secrets.
- **Privacy:** minimize guest data in agent prompts and chat; redact payment credentials and sensitive identifiers.

## Delivery roadmap

### Milestone 1 — Full-service domain foundation
- Add the full department taxonomy and canonical specialist agent roster.
- Display all specialist agents in the agent management workspace.
- Document cross-department workflows, approval boundaries and truthful runtime states.

### Milestone 2 — Operational modules
- Reservations and guest profiles.
- Room inventory and room-status board.
- Housekeeping schedules, inspections and linen.
- Room service and restaurant order queues.
- Maintenance work orders and preventive maintenance.
- Staff shifts, inventory, procurement, finance and revenue workspaces.

### Milestone 3 — Workflow orchestration
- Typed task contracts and department routing.
- Dependency-aware task execution and SLA policies.
- Human approvals and immutable audit events.
- Guest-facing status notifications with consent and delivery tracking.

### Milestone 4 — Switch integration
- Implement only the current, documented Switch Agent Protocol.
- Register actual agents and room membership.
- Show connection, delivery and acknowledgement states from verified protocol events.
- Keep local demo orchestration clearly labelled and separate from live Switch execution.

### Milestone 5 — External systems and production hardening
- PMS/POS/payment/messaging adapters with explicit permissions.
- Authentication, role-based access control, rate limits and session management.
- Automated tests, observability, backup/restore and deployment configuration.

## Current implementation status

Milestone 1 is in progress. The specialist roster is currently a frontend domain catalog merged with server-provided state. The additional agents are not yet independently executing work, and the live Switch integration is not certified. Do not present simulated actions as completed hotel operations.
