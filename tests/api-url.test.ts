import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiUrl } from '../src/lib/api';

// Under Node (no Vite env) VITE_API_BASE_URL is unset, which is exactly
// the dev/proxy mode: requests must stay relative so the Vite proxy
// forwards /api to the local Express server.

test('apiUrl keeps paths relative when no API base is configured', () => {
  assert.equal(apiUrl('/api/health'), '/api/health');
  assert.equal(apiUrl('/api/ceo/chat'), '/api/ceo/chat');
});

test('apiUrl normalizes missing leading slash', () => {
  assert.equal(apiUrl('api/health'), '/api/health');
});
