import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const connected = args.includes('--connected');
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev',
  '--hostname', '127.0.0.1', ...args.filter(arg => arg !== '--connected')], {
  stdio: 'inherit',
  env: { ...process.env, AIRTABLE_LOCAL_PREVIEW: connected ? 'false' : process.env.AIRTABLE_LOCAL_PREVIEW ?? 'true' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Could not start Next.js. Install dependencies first.'); process.exitCode = 1; });
child.on('exit', code => process.exit(code ?? 0));
