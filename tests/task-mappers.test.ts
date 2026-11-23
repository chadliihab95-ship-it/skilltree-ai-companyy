import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapStatus, mapPriority, toDbStatus, toDbPriority } from '../src/lib/taskService';

test('mapStatus maps DB statuses to Arabic UI statuses', () => {
  assert.equal(mapStatus('new'), 'جديدة');
  assert.equal(mapStatus('running'), 'قيد التنفيذ');
  assert.equal(mapStatus('queued'), 'قيد التنفيذ');
  assert.equal(mapStatus('awaiting_approval'), 'بانتظار الموافقة');
  assert.equal(mapStatus('completed'), 'مكتملة');
});

test('mapStatus falls back to new for terminal/unknown statuses', () => {
  assert.equal(mapStatus('failed'), 'جديدة');
  assert.equal(mapStatus('cancelled'), 'جديدة');
  assert.equal(mapStatus('unexpected'), 'جديدة');
});

test('mapPriority maps DB priorities to Arabic UI priorities', () => {
  assert.equal(mapPriority('low'), 'منخفضة');
  assert.equal(mapPriority('medium'), 'متوسطة');
  assert.equal(mapPriority('high'), 'عالية');
  assert.equal(mapPriority('urgent'), 'عالية');
  assert.equal(mapPriority('unexpected'), 'متوسطة');
});

test('toDbStatus maps Arabic UI statuses back to DB statuses', () => {
  assert.equal(toDbStatus('جديدة'), 'new');
  assert.equal(toDbStatus('قيد التنفيذ'), 'running');
  assert.equal(toDbStatus('بانتظار الموافقة'), 'awaiting_approval');
  assert.equal(toDbStatus('مكتملة'), 'completed');
});

test('toDbPriority maps Arabic UI priorities back to DB priorities', () => {
  assert.equal(toDbPriority('منخفضة'), 'low');
  assert.equal(toDbPriority('متوسطة'), 'medium');
  assert.equal(toDbPriority('عالية'), 'high');
});

test('status round-trip is stable for editable statuses', () => {
  for (const status of ['new', 'running', 'awaiting_approval', 'completed'] as const) {
    assert.equal(toDbStatus(mapStatus(status)), status);
  }
});

test('priority round-trip is stable; urgent intentionally collapses to high', () => {
  for (const priority of ['low', 'medium', 'high'] as const) {
    assert.equal(toDbPriority(mapPriority(priority)), priority);
  }
  assert.equal(toDbPriority(mapPriority('urgent')), 'high');
});
