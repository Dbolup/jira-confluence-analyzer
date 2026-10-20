import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainConnectionError } from './connectionErrors.js';

test('ECONNREFUSED gets a specific, actionable message', () => {
  const msg = explainConnectionError({ code: 'ECONNREFUSED', address: '10.0.0.5', port: 5432 });
  assert.match(msg, /Could not reach 10\.0\.0\.5:5432/);
});

test('ENOTFOUND gets a specific message', () => {
  assert.match(explainConnectionError({ code: 'ENOTFOUND' }), /Could not resolve the host/);
});

test('pg auth failure (28P01) and mysql auth failure (ER_ACCESS_DENIED_ERROR) both map to the same login message', () => {
  assert.match(explainConnectionError({ code: '28P01' }), /Login failed/);
  assert.match(explainConnectionError({ code: 'ER_ACCESS_DENIED_ERROR' }), /Login failed/);
});

test('pg missing-database (3D000) and mysql missing-database (ER_BAD_DB_ERROR) both map to the same message', () => {
  assert.match(explainConnectionError({ code: '3D000' }), /does not exist/);
  assert.match(explainConnectionError({ code: 'ER_BAD_DB_ERROR' }), /does not exist/);
});

test('an unrecognized error falls back to a generic prefix, not a bare message', () => {
  const msg = explainConnectionError({ code: 'SOME_WEIRD_CODE', message: 'driver said something odd' });
  assert.match(msg, /^Could not connect: driver said something odd$/);
});

test('a password embedded in a raw driver message never appears in a recognized-code result', () => {
  const err = { code: '28P01', message: 'password authentication failed for user "bob" with password "hunter2"' };
  const msg = explainConnectionError(err);
  assert.ok(!msg.includes('hunter2'), 'the recognized-code path must use the fixed sentence, not the raw message');
});
