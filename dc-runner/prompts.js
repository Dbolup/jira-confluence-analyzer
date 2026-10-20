// Interactive terminal prompts for the standalone DC runner. Masked password input uses a
// hand-rolled raw-mode stdin reader — no new dependency for something node:readline/promises
// doesn't support natively, matching this repo's existing preference for built-ins over adding
// a package (node:test over Jest, native module mocking over a mocking library).
//
// Uses the CALLBACK-based node:readline (not node:readline/promises), driven through its own
// async iterator (rl[Symbol.asyncIterator]()) rather than sequential `await rl.question()` calls
// — verified by hand that node:readline/promises' question() silently stalls after the first
// call when stdin is piped (a real, reproducible Node quirk independent of this file).
//
// A SECOND subtlety, also found by hand-testing: creating a brand-new readline.Interface AFTER
// a piped stdin stream has already been fully consumed (hit EOF) never resolves — the interface
// attaches after 'end' already fired, so it never sees a 'close'/'line' event either, and with
// no other handle keeping Node's event loop alive, the whole process exits silently instead of
// hanging. So for non-TTY (piped) input, ALL prompts — including the password and the final
// "prepared for" question — must go through ONE continuous interface/iterator, never closed
// until every question has been asked. A real TTY never hits EOF mid-session, so reopening a
// fresh interface there (done for the password step, which needs raw mode instead) is safe.
import readline from 'node:readline';

// ---------- Pure helpers (unit-tested directly, no I/O) ----------

export function defaultPortFor(type) {
  return type === 'mysql' ? 3306 : 5432;
}

export function parseYesNo(input) {
  const v = String(input || '').trim().toLowerCase();
  if (v === 'y' || v === 'yes') return true;
  if (v === '' || v === 'n' || v === 'no') return false;
  return null; // unrecognized — caller decides how to handle
}

// Turns raw prompt answers into the plain config object openDbConnection/runDiscoveryDc expect.
export function buildSourceFromAnswers(answers) {
  const type = answers.type === 'mysql' ? 'mysql' : 'postgres';
  const host = (answers.host || '').trim();
  return {
    name: (answers.name || '').trim() || host,
    type,
    host,
    port: Number(answers.port) || defaultPortFor(type),
    database: (answers.database || '').trim(),
    user: (answers.user || '').trim(),
    password: answers.password || '',
    ssl: !!answers.ssl,
  };
}

// ---------- Masked password (raw-mode stdin) ----------

function readMaskedPassword(promptText) {
  return new Promise((resolve, reject) => {
    process.stdout.write(promptText);
    const stdin = process.stdin;
    let value = '';

    const onData = (chunk) => {
      const str = chunk.toString('utf8');
      for (const ch of str) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') { // Ctrl-C
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Cancelled'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') { // Backspace
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        value += ch;
        process.stdout.write('*');
      }
    };

    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    };

    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

// ---------- Shared prompter ----------

function makePrompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const it = rl[Symbol.asyncIterator]();
  return {
    async ask(promptText) {
      process.stdout.write(promptText);
      const { value, done } = await it.next();
      return done ? '' : value;
    },
    close() { rl.close(); },
  };
}

// ---------- The prompts themselves ----------

// Asks everything in one flow and returns { source, preparedFor } — combined into one function
// (rather than two, as an earlier version had) specifically so the non-TTY path can share a
// single continuous readline interface across every question; see the file header comment.
export async function promptAll() {
  const prompter = makePrompter();

  const typeAnswer = await prompter.ask('Database type (postgres/mysql) [postgres]: ');
  const type = typeAnswer.trim().toLowerCase() || 'postgres';
  const name = await prompter.ask('Friendly name for this connection [optional]: ');
  const host = await prompter.ask('Host: ');
  const port = await prompter.ask('Port [leave blank for the type\'s default]: ');
  const database = await prompter.ask('Database name: ');
  const user = await prompter.ask('User: ');
  const sslAnswer = await prompter.ask('Use SSL? (y/N): ');

  let password;
  if (process.stdin.isTTY) {
    // Safe to close and use raw mode instead — a real terminal never hits EOF mid-session, so
    // reopening a fresh interface afterward (for "prepared for", below) works fine too.
    prompter.close();
    password = await readMaskedPassword('Password: ');
  } else {
    console.warn("⚠ This terminal doesn't support masked input — the password will be shown as you type.");
    password = await prompter.ask('Password: ');
  }

  let preparedFor;
  if (process.stdin.isTTY) {
    const p2 = makePrompter();
    preparedFor = await p2.ask('Prepared for (customer/prospect name, optional): ');
    p2.close();
  } else {
    preparedFor = await prompter.ask('Prepared for (customer/prospect name, optional): ');
    prompter.close();
  }

  const ssl = parseYesNo(sslAnswer) === true;
  const source = buildSourceFromAnswers({ type, name, host, port, database, user, password, ssl });
  return { source, preparedFor: preparedFor.trim() };
}
