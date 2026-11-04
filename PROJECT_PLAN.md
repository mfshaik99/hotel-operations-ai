# MVP Plan

## Primary workflow

**Guest request -> Reception -> Department agents -> Human staff -> Verified resolution**

### Case fields

- Case ID
- Room number (demo data only)
- Request description
- Department
- Priority
- Status
- Created timestamp
- Assigned owner
- Due time / SLA target
- Activity history
- Human completion confirmation

### Initial departments

| Department | Example requests |
|---|---|
| Housekeeping | Towels, pillows, room cleaning, missing amenities |
| Maintenance | AC, electricity, plumbing, equipment faults |
| Reception | Check-in/out questions, guest coordination |

## Agent responsibilities

1. **Reception Agent:** interpret incoming requests, ask for missing details, and create separate cases when a guest reports multiple issues.
2. **Housekeeping Agent:** acknowledge and coordinate housekeeping work.
3. **Maintenance Agent:** acknowledge and coordinate maintenance work.
4. **Coordinator Agent:** monitor case progress, identify overdue work, and request updates.
5. **Manager Agent (stretch goal):** summarize unresolved high-priority cases and escalate them to a human manager.

For the first demo, implement only the smallest reliable set of agents needed to prove end-to-end collaboration.

## Human-in-the-loop rules

- Agents can suggest priority and assignment.
- A human can correct the department, priority, or assignment.
- An agent must not claim a physical task is complete without a staff confirmation.
- Only an authorized human action can move a case to **Resolved**.
- Escalations should notify staff; they should not silently close or reassign a case.

## Demo acceptance criteria

- [ ] Submit one guest message containing two distinct requests.
- [ ] Create two independently trackable cases.
- [ ] Route each case to the correct department.
- [ ] Show agent coordination in a shared Switch room.
- [ ] Show status updates in the dashboard.
- [ ] Demonstrate an overdue case being escalated.
- [ ] Confirm completion as a human and show the case as resolved.
- [ ] Include a short demo script and screenshots/video in the repository.

## Non-goals for the hackathon MVP

- Real hotel PMS integration
- Real guest identity or payment data
- Autonomous control of room equipment
- Claiming real-world completion based only on an AI response
