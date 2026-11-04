# Hotel Operations AI

**Every Guest Request. Every Department. One AI-Powered Team.**

Hotel Operations AI is a hackathon prototype that helps hotel teams coordinate guest requests across Reception, Housekeeping, and Maintenance using AI agents working together in a shared team-chat workflow powered by **Switch**.

## The problem

Guest requests often move between departments through calls and scattered messages. Requests can be forgotten, ownership can be unclear, and staff may not know which issues are overdue.

## The solution

A guest request becomes a trackable case. AI teammates classify the request, route it to the right department, coordinate follow-ups, and flag delays. Human staff remain responsible for confirming that work is actually completed.

## Example workflow

A guest in Room 204 reports a broken air conditioner and asks for extra towels.

1. Reception records the guest's two requests.
2. The workflow creates two separate cases.
3. Housekeeping receives the towel request.
4. Maintenance receives the AC issue.
5. A coordinator agent tracks both cases and follows up on delays.
6. A human employee confirms completion before a case is marked resolved.

## MVP scope

- Reception request intake
- Request classification and case creation
- Housekeeping and Maintenance routing
- Shared Switch team-chat coordination
- Case status and priority tracking
- Human completion confirmation
- Delay escalation and a simple operations dashboard

## Architecture (planned)

- **Frontend:** browser-based operations dashboard
- **Backend:** Python API and request workflow
- **AI:** Gemini via Google AI Studio / Gemini API
- **Agent collaboration:** Switch connected to a shared hotel operations room
- **Persistence:** lightweight database for prototype cases

The exact integration and deployment approach will be documented as it is implemented. Switch is a core part of the workflow, not just a notification channel.

## Important prototype boundaries

This is a hackathon demonstration, not a production hotel management system. Do not enter real guest personal information. AI agents may classify, recommend, route, and escalate; only authorized human staff can confirm that a physical task is complete.

## Development

We are developing with Google AI Studio and Google Antigravity, with this repository as the source of truth.

Implementation instructions, environment variables, and deployment steps will be added as the MVP is built.
