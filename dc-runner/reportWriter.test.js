import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapAsStandaloneHtml } from './reportWriter.js';

// wrapAsStandaloneHtml is pure string-in/string-out — writeReportFile (a 1-line fs wrapper) is
// glue, not worth unit-testing, and is exercised by the manual smoke test instead.

test('wraps the given body fragment verbatim inside a full HTML document with the given title', () => {
  const body = '<div id="report-content"><h2>Test Report</h2></div>';
  const html = wrapAsStandaloneHtml(body, { title: 'Discovery Report — Acme DC' });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<title>Discovery Report — Acme DC<\/title>/);
  assert.ok(html.includes(body), 'the body fragment must appear unmodified');
});

test('embeds the report CSS (finding/badge/stats-table styles) so the file needs no external stylesheet', () => {
  const html = wrapAsStandaloneHtml('<div></div>', { title: 'x' });
  assert.match(html, /\.finding\s*\{/);
  assert.match(html, /\.badge-critical\s*\{/);
  assert.match(html, /\.stats-table\s*\{/);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/, 'must not depend on an external stylesheet');
});
