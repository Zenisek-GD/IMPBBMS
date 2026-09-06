// Wrangler's raw event payload may include cookies and account data. Emit only
// a strict metadata allowlist and known diagnostic categories; never raw logs.
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['municipal_backend/node_modules/wrangler/bin/wrangler.js', 'tail', 'procurenance', '--format', 'json'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let buffer = '';
let connected = false;
child.stdout.on('data', chunk => {
  buffer += chunk;
  // Wrangler emits formatted JSON events. Parse complete objects by tracking
  // braces outside quoted strings, then discard every unapproved field.
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];
    if (start < 0) { if (char !== '{') continue; start = i; }
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        const event = JSON.parse(buffer.slice(start, i + 1));
        const logs = JSON.stringify([event.logs, event.exceptions]);
        const categories = ['COM_STMT_PREPARE', 'cross-request', 'acqui', 'truncated JSON', 'scheduled work failed', 'D1', 'unhandled', 'timeout', 'Error'].filter(term => logs.toLowerCase().includes(term.toLowerCase()));
        let path;
        try { path = new URL(event.event?.request?.url).pathname; } catch { /* scheduled event */ }
        console.log(JSON.stringify({ outcome: event.outcome, path, cron: event.event?.cron, categories, logCount: event.logs?.length ?? 0, exceptions: event.exceptions?.length ?? 0 }));
      } catch { /* Never print raw text. */ }
      buffer = buffer.slice(i + 1); i = -1; start = -1;
    }
  }
  if (!connected) { connected = true; console.log('Worker tail output received; raw payloads suppressed.'); }
  if (buffer.length > 1000000) buffer = '';
});
child.stderr.on('data', () => console.log('Wrangler diagnostic received (contents suppressed).'));
child.on('exit', code => { console.log(JSON.stringify({ tailExit: code })); process.exitCode = code ?? 0; });
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setTimeout(stop, Number(process.env.QA_TAIL_MS ?? 1200000)).unref();
