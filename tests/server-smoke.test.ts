import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const port = 8799;

// Integration smoke test: boots the real Express server locally and
// checks /api/health only. No AI calls, no database writes, no network
// beyond localhost. The child process is always killed afterwards.
test('server boots and /api/health responds', { timeout: 30000 }, async () => {
  const child = spawn(process.execPath, [tsxCli, 'server/index.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
  });

  try {
    const deadline = Date.now() + 20000;
    let body: any = null;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) {
          body = await res.json();
          break;
        }
      } catch {
        // server not up yet
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(body, 'health endpoint did not respond within 20s');
    assert.equal(body.ok, true);
    assert.equal(body.service, 'skilltree-api');
  } finally {
    child.kill('SIGTERM');
  }
});
