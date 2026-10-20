// Maps known pg/mysql2 connection error codes to a specific, customer-facing sentence — and,
// deliberately, never echoes a raw driver error message for the recognized cases below without
// vetting it first, since some driver messages can embed connection details (host, user, etc.).
// Anything unrecognized falls back to a generic prefix rather than a bare, unexplained message.
export function explainConnectionError(err) {
  const code = err && err.code;

  if (code === 'ECONNREFUSED') {
    return `Could not reach ${err.address || 'the database'}${err.port ? ':' + err.port : ''} — check the host/port and that the database accepts connections from this machine.`;
  }
  if (code === 'ENOTFOUND') {
    return `Could not resolve the host — check that the hostname is correct and reachable from this machine.`;
  }
  if (code === 'ETIMEDOUT') {
    return `Connection timed out — check the host/port and any firewall between this machine and the database.`;
  }
  if (code === '28P01' || code === 'ER_ACCESS_DENIED_ERROR') {
    return 'Login failed — check the username and password.';
  }
  if (code === '3D000' || code === 'ER_BAD_DB_ERROR') {
    return 'The database name does not exist on this server — check the database name.';
  }

  return `Could not connect: ${err && err.message ? err.message : String(err)}`;
}
