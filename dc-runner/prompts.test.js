import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPortFor, parseYesNo, buildSourceFromAnswers } from './prompts.js';

// Only the pure helpers are tested here — the actual terminal I/O (readline questions, the
// raw-mode masked password reader) needs a real TTY and is manual-smoke-test-only, per the plan.

test('defaultPortFor', () => {
  assert.equal(defaultPortFor('postgres'), 5432);
  assert.equal(defaultPortFor('mysql'), 3306);
  assert.equal(defaultPortFor('anything-else'), 5432, 'unrecognized type defaults to postgres\'s port');
});

test('parseYesNo accepts y/yes/n/no case-insensitively, blank means no, garbage is unrecognized', () => {
  assert.equal(parseYesNo('y'), true);
  assert.equal(parseYesNo('Y'), true);
  assert.equal(parseYesNo('yes'), true);
  assert.equal(parseYesNo('YES'), true);
  assert.equal(parseYesNo('n'), false);
  assert.equal(parseYesNo('no'), false);
  assert.equal(parseYesNo(''), false);
  assert.equal(parseYesNo('   '), false);
  assert.equal(parseYesNo('maybe'), null);
});

test('buildSourceFromAnswers coerces a string port to a number and applies the type-specific default when blank', () => {
  const s = buildSourceFromAnswers({ type: 'postgres', name: '', host: 'db.example.com', port: '', database: 'jiradb', user: 'u', password: 'p', ssl: false });
  assert.equal(typeof s.port, 'number');
  assert.equal(s.port, 5432);
  assert.equal(s.name, 'db.example.com', 'blank friendly name defaults to the host');
});

test('buildSourceFromAnswers respects an explicit port and name when provided', () => {
  const s = buildSourceFromAnswers({ type: 'mysql', name: 'Acme Prod', host: 'db.example.com', port: '3307', database: 'jiradb', user: 'u', password: 'p', ssl: true });
  assert.equal(s.port, 3307);
  assert.equal(s.name, 'Acme Prod');
  assert.equal(s.ssl, true);
});

test('buildSourceFromAnswers defaults an unrecognized type to postgres', () => {
  const s = buildSourceFromAnswers({ type: 'oracle', host: 'x', port: '', database: 'd', user: 'u', password: 'p' });
  assert.equal(s.type, 'postgres');
});
