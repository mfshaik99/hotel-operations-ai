import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini SDK with User-Agent header
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(apiKey),
      timestamp: new Date().toISOString(),
    });
  });

  // Intelligent Request Breakdown API
  app.post('/api/gemini/parse-request', async (req, res) => {
    const { rawText, room, guestName } = req.body;

    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }

    if (!ai) {
      // High-grade heuristic fallback when no API key is present
      const fallbackData = generateHeuristicBreakdown(rawText, room, guestName);
      return res.json(fallbackData);
    }

    try {
      const prompt = `You are the central AI Business Operations Manager for The Grand Luminary Hotel & Residences (an ultra-luxury 5-star international property).
Analyze this incoming guest request/situation:
Raw Guest Input: "${rawText}"
Known Room: "${room || 'Not explicitly stated'}"
Guest Name: "${guestName || 'VIP Guest'}"

Your responsibility is ADVANCED REQUEST INTELLIGENCE:
1. Extract or confirm Room Number.
2. Break complex multi-problem requests into separate, independent operational responsibilities.
3. Delegate each task to the exact specialized agent:
   - "Reception Agent" (check-in/out, keycards, billing, room moves, concierge, guest satisfaction)
   - "Housekeeping Agent" (cleaning, bed making, fresh towels, amenities, turndown, spills)
   - "Maintenance Agent" (air conditioning, HVAC, plumbing, electrical, WiFi/TV, safe breakdown, door locks)
   - "Management Agent" (escalated complaints, VIP handling, safety hazards, compensation, service failure review)
4. Evaluate priority, time sensitivity (SLA in minutes), dependencies, and guest impact.
5. All physical tasks require human staff confirmation before resolution.

Provide structured JSON with:
- guestIntent: string summary of core intent
- detectedRoom: string (room number or fallback)
- urgencyLevel: "Normal" | "High" | "Urgent" | "Critical"
- executiveSummary: brief 1-sentence manager briefing
- tasks: array of objects:
  - title: clear, professional task title
  - department: "Reception" | "Housekeeping" | "Maintenance" | "Management"
  - priority: "Low" | "Normal" | "High" | "Urgent" | "Critical"
  - estimatedMinutes: number (e.g. 15, 30, 45, 60)
  - dependencies: array of strings (e.g. "Wait for Maintenance AC repair before Housekeeping fresh linens")
  - requiresHumanConfirmation: true
  - assignedAgent: "Reception Agent" | "Housekeeping Agent" | "Maintenance Agent" | "Management Agent"
  - rationale: why this agent and priority
  - potentialRisk: what happens if delayed`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are an elite hotel business operations manager. You output only valid JSON matching the requested schema without markdown codeblocks.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              guestIntent: { type: Type.STRING },
              detectedRoom: { type: Type.STRING },
              urgencyLevel: { type: Type.STRING },
              executiveSummary: { type: Type.STRING },
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    department: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    estimatedMinutes: { type: Type.NUMBER },
                    dependencies: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    requiresHumanConfirmation: { type: Type.BOOLEAN },
                    assignedAgent: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    potentialRisk: { type: Type.STRING },
                  },
                  required: ['title', 'department', 'priority', 'assignedAgent', 'requiresHumanConfirmation'],
                },
              },
            },
            required: ['guestIntent', 'detectedRoom', 'urgencyLevel', 'executiveSummary', 'tasks'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ success: true, source: 'gemini-3.8-flash', ...parsed });
    } catch (err: any) {
      console.error('Gemini breakdown error, falling back to heuristic:', err?.message);
      const fallbackData = generateHeuristicBreakdown(rawText, room, guestName);
      return res.json({ success: true, source: 'heuristic-fallback', ...fallbackData });
    }
  });

  // Switch Multi-Agent Dialogue Generation API
  app.post('/api/gemini/switch-dialogue', async (req, res) => {
    const { context, eventType, taskTitle, room, department } = req.body;

    if (!ai) {
      const messages = generateHeuristicDialogue(eventType, taskTitle, room, department);
      return res.json({ success: true, source: 'heuristic', messages });
    }

    try {
      const prompt = `You simulate the live operational Switch command room for a 5-star hotel.
An event occurred:
EventType: ${eventType}
Task: "${taskTitle}"
Room: "${room}"
Department: "${department}"
Context: ${context || 'Operational update'}

Generate 2 to 3 concise, highly professional operational collaboration messages between:
1. "Central Operations AI" (The GM coordinator: delegates, tracks SLA, sets expectations)
2. Specialized Agent (e.g., "${department} Agent": acknowledges, states protocol, dispatches human staff)
3. If escalated or cross-department, "Management Agent" or "Reception Agent" (checks guest comfort, contingency).

Tone: Decisive, elite hotel operations, crisp and respectful. Avoid robotic clichés.

Output JSON array of message objects:
- sender: "Central Operations AI" | "Reception Agent" | "Housekeeping Agent" | "Maintenance Agent" | "Management Agent"
- avatarRole: "Orchestrator" | "Front Desk" | "Housekeeping" | "Engineering" | "General Manager"
- content: string (under 160 characters, operational and direct)
- badge: "DISPATCHED" | "ACKNOWLEDGED" | "SLA ACTIVE" | "ESCALATED" | "VERIFIED" | "INFO"`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: 'You are an operations chat simulator for a luxury hotel. Return JSON array only.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sender: { type: Type.STRING },
                avatarRole: { type: Type.STRING },
                content: { type: Type.STRING },
                badge: { type: Type.STRING },
              },
              required: ['sender', 'avatarRole', 'content', 'badge'],
            },
          },
        },
      });

      const messages = JSON.parse(response.text || '[]');
      return res.json({ success: true, source: 'gemini-3.8-flash', messages });
    } catch (err: any) {
      console.error('Switch dialogue error, using heuristic:', err?.message);
      const messages = generateHeuristicDialogue(eventType, taskTitle, room, department);
      return res.json({ success: true, source: 'heuristic-fallback', messages });
    }
  });

  // Mount Vite or static dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Hotel Operations AI] Server running at http://0.0.0.0:${PORT}`);
  });
}

// Rule-based heuristic breakdown for offline/fallback mode
function generateHeuristicBreakdown(rawText: string, roomParam?: string, guestName?: string) {
  const roomMatch = rawText.match(/\b(?:room|suite|rm\.?|#)\s*([0-9]{3,4}[A-Z]?)\b/i);
  const detectedRoom = roomParam || (roomMatch ? roomMatch[1] : '412');

  // Split on periods, newlines, semicolons, commas, or conjunctions like 'and', 'also', 'furthermore'
  const phrases = rawText
    .split(/(?<=[.?!])\s+|\n|;\s*|,\s*(?=(?:and\s+|the\s+|please\s+|there\s+|we\s+|my\s+|also\s+|clean\s+|ac\s+|towel|shower|bath|wifi|door|key))|\band\s+(?=(?:the|please|also|we|my|there|clean|send|fix|check|extra))/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  const tasks: any[] = [];
  const processedChecks = new Set<string>();

  const checks = [
    {
      id: 'hvac',
      regex: /ac\b|air condition|hvac|hot air|cold|temperature|thermostat|cooling|heat\b|warm/i,
      dept: 'Maintenance' as const,
      agent: 'Maintenance Agent',
      title: 'Inspect & recalibrate HVAC / climate control system',
      priority: 'High' as const,
      est: 25,
      risk: 'Guest thermal discomfort in suite; direct impact on luxury rating',
    },
    {
      id: 'towels',
      regex: /towel|towels|linen|pillow|pillows|blanket|bed\b|duvet|sheet|cushion/i,
      dept: 'Housekeeping' as const,
      agent: 'Housekeeping Agent',
      title: 'Deliver fresh luxury linen & hypoallergenic amenities',
      priority: 'Normal' as const,
      est: 15,
      risk: 'Guest inconvenience during evening refresh or rest cycle',
    },
    {
      id: 'cleanliness',
      regex: /dirty|clean|stain|dust|trash|bin|smell|odor|bathroom|shower floor|hair|spill|wipe/i,
      dept: 'Housekeeping' as const,
      agent: 'Housekeeping Agent',
      title: 'Priority sanitary deep-clean & suite replenishment',
      priority: 'Urgent' as const,
      est: 35,
      risk: 'Severe luxury hygiene violation; high risk of formal executive complaint',
    },
    {
      id: 'plumbing',
      regex: /leak|water|tap|sink|faucet|plumb|drain|shower diverter|toilet|flood|washbasin/i,
      dept: 'Maintenance' as const,
      agent: 'Maintenance Agent',
      title: 'Urgent plumbing inspection & water isolation',
      priority: 'Urgent' as const,
      est: 20,
      risk: 'Active water damage to suite fixtures and lower floor ceilings',
    },
    {
      id: 'access',
      regex: /key|card|lock|access|door|safe|code|entry|locked out|beeping/i,
      dept: 'Reception' as const,
      agent: 'Reception Agent',
      title: 'Re-encode RFID credentials & test door lock mortise',
      priority: 'Urgent' as const,
      est: 10,
      risk: 'Guest lockout and physical room access impediment',
    },
    {
      id: 'connectivity',
      regex: /wifi|internet|tv|television|remote|channel|network|connection/i,
      dept: 'Maintenance' as const,
      agent: 'Maintenance Agent',
      title: 'Diagnostic test on high-speed gateway & interactive TV',
      priority: 'Normal' as const,
      est: 20,
      risk: 'Business traveler inability to conduct video conferences',
    },
    {
      id: 'billing',
      regex: /bill|charge|invoice|rate|refund|checkout|deposit|folio/i,
      dept: 'Reception' as const,
      agent: 'Reception Agent',
      title: 'Audit folio charges, verify vouchers & adjust balance',
      priority: 'Normal' as const,
      est: 15,
      risk: 'Dispute during departure leading to negative exit impression',
    },
    {
      id: 'escalation',
      regex: /manager|unacceptable|compensation|complain|furious|terrible|awful|gm\b/i,
      dept: 'Management' as const,
      agent: 'Management Agent',
      title: 'Executive Duty Manager in-person courtesy visit & service recovery',
      priority: 'Critical' as const,
      est: 10,
      risk: 'Escalation to hotel general manager; corporate brand review risk',
    },
  ];

  // First check against phrases
  for (const phrase of phrases) {
    for (const check of checks) {
      if (!processedChecks.has(check.id) && check.regex.test(phrase)) {
        processedChecks.add(check.id);
        tasks.push({
          title: `${check.title} (Suite ${detectedRoom})`,
          department: check.dept,
          priority: check.priority,
          estimatedMinutes: check.est,
          dependencies:
            check.dept === 'Housekeeping' && tasks.some((t) => t.department === 'Maintenance')
              ? ['Maintenance physical diagnostic must finish before final Housekeeping setup']
              : [],
          requiresHumanConfirmation: true,
          assignedAgent: check.agent,
          rationale: `Identified specific guest problem: "${phrase.slice(0, 60)}"`,
          potentialRisk: check.risk,
        });
      }
    }
  }

  // Also scan full text for any missed checks that appeared in compound sentences
  for (const check of checks) {
    if (!processedChecks.has(check.id) && check.regex.test(rawText)) {
      processedChecks.add(check.id);
      tasks.push({
        title: `${check.title} (Suite ${detectedRoom})`,
        department: check.dept,
        priority: check.priority,
        estimatedMinutes: check.est,
        dependencies:
          check.dept === 'Housekeeping' && tasks.some((t) => t.department === 'Maintenance')
            ? ['Maintenance physical diagnostic must finish before final Housekeeping setup']
            : [],
        requiresHumanConfirmation: true,
        assignedAgent: check.agent,
        rationale: `Extracted from guest request statement`,
        potentialRisk: check.risk,
      });
    }
  }

  // Guarantee at least one task if no specific pattern matched
  if (tasks.length === 0) {
    tasks.push({
      title: `General guest service triage & suite visit (Suite ${detectedRoom})`,
      department: 'Reception',
      priority: 'Normal',
      estimatedMinutes: 20,
      dependencies: [],
      requiresHumanConfirmation: true,
      assignedAgent: 'Reception Agent',
      rationale: 'Unclassified operational request routed to Reception for triage',
      potentialRisk: 'Guest waiting time exceeding 5-star hospitality benchmarks',
    });
  }

  const hasUrgent = tasks.some((t) => t.priority === 'Urgent' || t.priority === 'Critical');
  const urgencyLevel = hasUrgent ? 'Urgent' : 'Normal';

  return {
    guestIntent: `Multi-part operational request for Suite ${detectedRoom} involving ${tasks.length} distinct responsibilities across ${new Set(tasks.map((t) => t.department)).size} department(s).`,
    detectedRoom,
    urgencyLevel,
    executiveSummary: `Decomposed complex inquiry into ${tasks.length} autonomous departmental tasks with active SLA timers.`,
    tasks,
  };
}

function generateHeuristicDialogue(eventType: string, taskTitle: string, room: string, department: string) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  switch (eventType) {
    case 'NEW_TASK_CREATED':
      return [
        {
          sender: 'Central Operations AI',
          avatarRole: 'Orchestrator',
          content: `Routing new case for Room ${room}: "${taskTitle}". Assigning primary SLA to ${department} Agent.`,
          badge: 'DISPATCHED',
          time: timestamp,
        },
        {
          sender: `${department} Agent`,
          avatarRole: department === 'Maintenance' ? 'Engineering' : department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
          content: `Acknowledged. Duty technician/staff notified on radio channel 3. En route to Suite ${room}.`,
          badge: 'ACKNOWLEDGED',
          time: timestamp,
        },
      ];
    case 'TASK_ESCALATED':
      return [
        {
          sender: 'Management Agent',
          avatarRole: 'General Manager',
          content: `Escalation flagged for Room ${room}. Reviewing guest profile. Executive Duty Manager standing by for in-person recovery.`,
          badge: 'ESCALATED',
          time: timestamp,
        },
        {
          sender: 'Central Operations AI',
          avatarRole: 'Orchestrator',
          content: `Priority elevated to CRITICAL. Halting dependent tasks until duty manager assessment is logged.`,
          badge: 'SLA ACTIVE',
          time: timestamp,
        },
      ];
    case 'HUMAN_RESOLVED':
      return [
        {
          sender: `${department} Agent`,
          avatarRole: department === 'Maintenance' ? 'Engineering' : department === 'Housekeeping' ? 'Housekeeping' : 'Front Desk',
          content: `Staff confirmed physical resolution in Room ${room}. Quality standards met.`,
          badge: 'VERIFIED',
          time: timestamp,
        },
        {
          sender: 'Reception Agent',
          avatarRole: 'Front Desk',
          content: `Placing courtesy call to guest in Suite ${room} to confirm complete satisfaction.`,
          badge: 'INFO',
          time: timestamp,
        },
      ];
    default:
      return [
        {
          sender: 'Central Operations AI',
          avatarRole: 'Orchestrator',
          content: `Monitoring operational telemetry for Suite ${room}. All SLA countdowns active.`,
          badge: 'INFO',
          time: timestamp,
        },
      ];
  }
}

startServer();
