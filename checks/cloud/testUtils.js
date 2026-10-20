// Shared helper for checks/cloud/*.test.js. Not matched by `node --test`'s own file-discovery
// pattern (doesn't end in .test.js), so this never runs as a test suite itself.
export function jsonResponse(body, ok = true, status = 200, statusText = 'OK') {
  return { ok, status, statusText, json: async () => body };
}
