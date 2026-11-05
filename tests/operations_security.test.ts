import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Hotel Operations AI — Security, Multi-Agent & Protocol Verification', () => {
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

  it('2. Authenticates valid staff PIN via salted SHA-256 and issues random session token', async () => {
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
    assert.ok(data.token.startsWith('sess_'), 'Session token must be unpredictable random session');
    assert.strictEqual(data.staff.badgeId, 'REC-104');
  });

  it('3. Rejects invalid staff PIN with 401 Unauthorized', async () => {
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

  it('4. Rejects client-side attempts to spoof AI_AGENT identity with 403 Forbidden', async () => {
    const res = await fetch(`${BASE_URL}/api/chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: 'Central Operations AI',
        senderType: 'AI_AGENT',
        avatarRole: 'Orchestrator',
        department: 'Management',
        content: 'I am pretending to be an AI agent from the browser',
        channel: '#operations-general',
      }),
    });

    assert.strictEqual(res.status, 403, 'Must return HTTP 403 when client attempts to spoof AI_AGENT');
    const data = await res.json();
    assert.match(data.error, /Security Violation.*cannot post as AI_AGENT/i);
  });

  it('5. Operating Principle #8: Strictly blocks marking tasks Resolved via PATCH', async () => {
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

  it('6. Rejects task verification when staff department does not match task department', async () => {
    // Authenticate Maria Santos (Housekeeping)
    const loginRes = await fetch(`${BASE_URL}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: 'staff-maria', pin: '3105' }),
    });
    const { staff } = await loginRes.json();
    assert.strictEqual(staff.department, 'Housekeeping');

    // Find a Maintenance task
    const tasksRes = await fetch(`${BASE_URL}/api/tasks`);
    const { tasks } = await tasksRes.json();
    const maintTask = tasks.find((t: any) => t.department === 'Maintenance');
    assert.ok(maintTask, 'Should find a Maintenance task');

    // Attempt verification with Housekeeping staff credentials
    const verifyRes = await fetch(`${BASE_URL}/api/tasks/${maintTask.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffToken: staff.token,
        staffName: staff.name,
        badgeId: staff.badgeId,
        notes: 'Attempting cross-department unauthorized sign-off',
        checklistConfirmed: true,
      }),
    });

    assert.strictEqual(verifyRes.status, 403, 'Should reject verification on department mismatch with 403 Forbidden');
    const data = await verifyRes.json();
    assert.match(data.error, /Departmental Authorization Failure/i);
  });

  it('7. Allows authorized departmental staff (or Management) to verify task completion', async () => {
    // Authenticate Carlos Mendez (Maintenance)
    const loginRes = await fetch(`${BASE_URL}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: 'staff-carlos', pin: '4021' }),
    });
    const { staff } = await loginRes.json();
    assert.strictEqual(staff.department, 'Maintenance');

    const tasksRes = await fetch(`${BASE_URL}/api/tasks`);
    const { tasks } = await tasksRes.json();
    const maintTask = tasks.find((t: any) => t.department === 'Maintenance' && t.status !== 'Resolved');
    assert.ok(maintTask, 'Should find an active Maintenance task');

    const verifyRes = await fetch(`${BASE_URL}/api/tasks/${maintTask.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffToken: staff.token,
        staffName: staff.name,
        badgeId: staff.badgeId,
        notes: 'Physical repair completed and verified on site with thermal manifold.',
        checklistConfirmed: true,
      }),
    });

    assert.strictEqual(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.success, true);
    assert.strictEqual(verifyData.task.status, 'Resolved');
    assert.ok(verifyData.task.auditTrail.some((a: any) => a.action === 'HUMAN_VERIFIED'));
  });

  it('8. Requires clarification when guest request omits room number', async () => {
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

  it('9. SandboxAQ Switch Protocol: Responds with valid agent manifest', async () => {
    const res = await fetch(`${BASE_URL}/api/switch/manifest`);
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/vnd\.switch\.v1\+json/);

    const data = await res.json();
    assert.strictEqual(data.protocol, 'switch.v1');
    assert.ok(Array.isArray(data.registeredAgents));
    assert.ok(data.registeredAgents.length >= 4);
    assert.ok(data.supportedEventTypes.includes('switch.handshake'));
  });

  it('10. SandboxAQ Switch Protocol: Handshake challenge-response validation', async () => {
    const challengeNonce = 'test_nonce_' + Date.now();
    const res = await fetch(`${BASE_URL}/api/switch/mock-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.switch.v1+json',
      },
      body: JSON.stringify({
        protocol: 'switch.v1',
        type: 'switch.handshake',
        challenge: challengeNonce,
        roomId: 'hotel-operations-room',
      }),
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-switch-room-status'), 'ACTIVE');
    assert.match(res.headers.get('content-type') || '', /application\/vnd\.switch\.v1\+json/);

    const data = await res.json();
    assert.strictEqual(data.protocol, 'switch.v1');
    assert.strictEqual(data.type, 'switch.handshake.ack');
    assert.strictEqual(data.challengeEcho, challengeNonce);
    assert.strictEqual(data.status, 'ACTIVE');
  });

  it('11. SandboxAQ Switch Integration: Verifies connection against mock-room', async () => {
    // Configure Switch endpoint to reference mock-room
    await fetch(`${BASE_URL}/api/switch/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomWebhookUrl: `${BASE_URL}/api/switch/mock-room`,
        roomId: 'hotel-operations-room',
      }),
    });

    const testRes = await fetch(`${BASE_URL}/api/switch/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    assert.strictEqual(testRes.status, 200);
    const testData = await testRes.json();
    assert.strictEqual(testData.success, true);
    assert.strictEqual(testData.status, 'CONNECTED');
    assert.strictEqual(testData.protocolHandshakeVerified, true);
  });
});
