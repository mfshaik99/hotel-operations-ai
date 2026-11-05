import { randomUUID } from 'node:crypto';

export interface SwitchAgentConfig {
  baseUrl: string;
  agentId: string;
  apiKey: string;
  roomId: string;
}

export interface SwitchRoomMessage {
  sender: string;
  senderId: string;
  senderKind: string;
  content: string;
  roomId: string;
  sequence: number;
  messageId?: string;
  timestamp?: number;
}

type StatusHandler = (status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTION_FAILED', detail?: string) => void;

export class SwitchAgentClient {
  private readonly config: SwitchAgentConfig;
  private readonly connectionId = randomUUID();
  private cursor = 0;
  private stopped = false;
  private activeController?: AbortController;

  constructor(config: SwitchAgentConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\\/+$/, ''),
    };
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async probe(): Promise<{ ok: boolean; detail: string }> {
    if (!this.config.baseUrl || !this.config.agentId || !this.config.apiKey || !this.config.roomId) {
      return { ok: false, detail: 'Switch bridge URL, agent ID, API key, and room ID are required.' };
    }

    const health = await fetch(`${this.config.baseUrl}/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) {
      return { ok: false, detail: `Switch bridge health check returned HTTP ${health.status}.` };
    }

    const operations = await fetch(
      `${this.config.baseUrl}/agents/${encodeURIComponent(this.config.agentId)}/ops`,
      { headers: this.headers(), signal: AbortSignal.timeout(5000) },
    );
    if (!operations.ok) {
      return {
        ok: false,
        detail: `Switch agent authentication failed or agent is unavailable (HTTP ${operations.status}).`,
      };
    }

    return { ok: true, detail: 'Switch bridge reachable and agent API key authenticated.' };
  }

  async sendMessage(content: string): Promise<void> {
    const response = await fetch(
      `${this.config.baseUrl}/agents/${encodeURIComponent(this.config.agentId)}/message`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ room_id: this.config.roomId, content }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Switch message delivery failed (HTTP ${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
    }
  }

  stop(): void {
    this.stopped = true;
    this.activeController?.abort();
  }

  async listen(onMessage: (message: SwitchRoomMessage) => void, onStatus: StatusHandler): Promise<void> {
    this.stopped = false;

    while (!this.stopped) {
      const controller = new AbortController();
      this.activeController = controller;
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      try {
        const params = new URLSearchParams({
          connection_id: this.connectionId,
          scope: 'single',
          filter: 'all',
          start_from: this.cursor ? String(this.cursor) : 'head',
          rooms: this.config.roomId,
        });
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: 'text/event-stream',
        };
        if (this.cursor > 0) headers['Last-Event-ID'] = String(this.cursor);

        const response = await fetch(
          `${this.config.baseUrl}/agents/${encodeURIComponent(this.config.agentId)}/events?${params.toString()}`,
          { headers, signal: controller.signal },
        );
        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Switch event stream rejected (HTTP ${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }

        onStatus('CONNECTED');
        heartbeat = setInterval(() => {
          void fetch(
            `${this.config.baseUrl}/agents/${encodeURIComponent(this.config.agentId)}/connection/beat`,
            {
              method: 'POST',
              headers: this.headers(),
              body: JSON.stringify({ connection_id: this.connectionId, cursor: this.cursor }),
              signal: AbortSignal.timeout(1500),
            },
          ).then((beat) => {
            if (!beat.ok) controller.abort();
          }).catch(() => controller.abort());
        }, 2000);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!this.stopped && !controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\\r?\\n\\r?\\n/);
          buffer = frames.pop() || '';

          for (const rawFrame of frames) {
            let eventName = 'message';
            let eventId = '';
            const dataLines: string[] = [];
            for (const line of rawFrame.split(/\\r?\\n/)) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('id:')) eventId = line.slice(3).trim();
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
            }
            if (eventId && /^\\d+$/.test(eventId)) this.cursor = Math.max(this.cursor, Number(eventId));
            if (!dataLines.length) continue;

            try {
              const event = JSON.parse(dataLines.join('')) as {
                type?: string;
                sequence?: number;
                payload?: Record<string, unknown>;
                room_id?: string;
              };
              if (typeof event.sequence === 'number') this.cursor = Math.max(this.cursor, event.sequence);
              const kind = event.type || eventName;
              if (kind === 'evicted') {
                controller.abort();
                break;
              }
              if (kind !== 'message' || !event.payload) continue;

              const payload = event.payload;
              const content = typeof payload.body === 'string' ? payload.body : '';
              if (!content) continue;
              onMessage({
                sender: typeof payload.sender_name === 'string' ? payload.sender_name : 'Switch teammate',
                senderId: typeof payload.sender === 'string' ? payload.sender : 'unknown',
                senderKind: typeof payload.sender_kind === 'string' ? payload.sender_kind : 'agent',
                content,
                roomId: event.room_id || this.config.roomId,
                sequence: this.cursor,
                messageId: typeof payload.message_id === 'string' ? payload.message_id : undefined,
                timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : undefined,
              });
            } catch {
              // Ignore malformed frames; the next valid frame still advances the stream.
            }
          }
        }
        await reader.cancel().catch(() => {});
        if (!this.stopped) onStatus('DISCONNECTED', 'Switch event stream ended; reconnecting.');
      } catch (error) {
        if (!this.stopped) {
          onStatus('DISCONNECTED', error instanceof Error ? error.message : 'Switch event stream disconnected.');
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (this.activeController === controller) this.activeController = undefined;
      }

      if (!this.stopped) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
  }
}
