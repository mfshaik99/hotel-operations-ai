import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Hotel Operations AI — Security & Protocol Verification', () => {
  const BASE_URL = 'http://localhost:3000';

  it('1. Rejects unauthenticated human chat messages with 401 Unauthorized', async () => {
    const res = await fetch(`${BASE_URL}/api/chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: 'Elena Rostova',
        senderType: 'HUMAN',
        avatarRole: 'Front Desk Lead',
        department: 'Reception',
        content: 'Unauthorized human message spoofing test',
        channel: '#operations-general',
      }),
    });

    assert.strictEqual(res.status, 401, 'Should return HTTP 401 when human message lacks staff token');
    const data = await res.json();
    assert.match(data.error, /Authentication required/i);
  });

  it('2. Authenticates valid staff PIN via POST /api/auth/staff-login', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: 'staff-elena',
        pin: '1042',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.staff.token.startsWith('token-staff-elena'));
    assert.strictEqual(data.staff.badgeId, 'REC-104');
  });

  it('3. Rejects invalid staff PIN', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: 'staff-elena',
        pin: '0000',
      }),
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Invalid staff identifier or security PIN/i);
  });

  it('4. Operating Principle #8: Strictly blocks marking tasks Resolved via PATCH', async () => {
    const tasksRes = await fetch(`${BASE_URL}/api/tasks`);
    const { tasks } = await tasksRes.json();
    const targetTask = tasks.find((t: any) => t.id.startsWith('task-'));
    assert.ok(targetTask, 'Should find at least one valid task');

    const patchRes = await fetch(`${BASE_URL}/api/tasks/${targetTask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Resolved',
        notes: 'Attempting illegal bypass of human sign-off',
      }),
    });

    assert.strictEqual(patchRes.status, 403, 'PATCH status: Resolved must be blocked with 403 Forbidden');
    const data = await patchRes.json();
    assert.match(data.error, /Operating Principle #8 Violation/i);
  });

  it('5. Allows legitimate human verification via POST /api/tasks/:id/verify', async () => {
    // Authenticate Carlos Mendez
    const loginRes = await fetch(`${BASE_URL}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: 'staff-carlos', pin: '4021' }),
    });
    const { staff } = await loginRes.json();

    const tasksRes = await fetch(`${BASE_URL}/api/tasks`);
    const { tasks } = await tasksRes.json();
    const targetTask = tasks.find((t: any) => t.id.startsWith('task-'));

    const verifyRes = await fetch(`${BASE_URL}/api/tasks/${targetTask.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffToken: staff.token,
        staffName: staff.name,
        badgeId: staff.badgeId,
        notes: 'Verified physical execution in suite. Temperature checked with digital probe: 20.1C.',
        checklistConfirmed: true,
      }),
    });

    assert.strictEqual(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.success, true);
    assert.strictEqual(verifyData.task.status, 'Resolved');
    assert.ok(verifyData.task.auditTrail.some((a: any) => a.action === 'HUMAN_VERIFIED'));
  });

  it('6. Requires clarification when guest request omits room number', async () => {
    const res = await fetch(`${BASE_URL}/api/gemini/parse-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: 'Please send extra hypoallergenic pillows and fresh mineral water immediately.',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.isRoomMissing, true);
    assert.strictEqual(data.needsClarification, true);
    assert.ok(data.clarificationPrompt.length > 0);
  });
});
