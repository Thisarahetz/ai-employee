#!/usr/bin/env node
/**
 * One-command setup for connecting any Node.js backend to AI Employee.
 *
 *   npx ai-employee-sdk init      # detect framework, write starter code, create API key
 *   npx ai-employee-sdk verify    # check the endpoints and the event webhook work
 *
 * Uses only Node built-ins so it runs in any project.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { sendEvent } from './events';

const SDK = 'ai-employee-sdk';
const cwd = process.cwd();
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const ok = (s: string) => console.log(`  ${green('✓')} ${s}`);
const bad = (s: string) => console.log(`  ${red('✗')} ${s}`);

type Framework = 'nest' | 'next' | 'express' | 'node';

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Minimal .env reader: KEY=value lines, quotes stripped. */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

/** This folder and its parents up to the repo root (monorepos keep .env and lock files at the root). */
function projectDirs(): string[] {
  const dirs: string[] = [];
  let dir = cwd;
  for (;;) {
    dirs.push(dir);
    const isRoot = ['.git', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb', 'bun.lock'].some((f) =>
      existsSync(join(dir, f)),
    );
    const parent = dirname(dir);
    if (isRoot || parent === dir) return dirs;
    dir = parent;
  }
}

/** Settings from every .env between the repo root and here; the closest file wins, like most loaders. */
function loadEnv(files: string[]): { values: Record<string, string>; existing: string[] } {
  const values: Record<string, string> = {};
  const existing: string[] = [];
  for (const dir of [...projectDirs()].reverse()) {
    for (const f of files) {
      const path = join(dir, f);
      if (!existsSync(path)) continue;
      existing.push(path);
      Object.assign(values, readEnvFile(path));
    }
  }
  return { values, existing };
}

const portOf = (env: Record<string, string>) => env.PORT || env.API_PORT || env.SERVER_PORT || env.APP_PORT || '3000';
const show = (path: string) => relative(cwd, path) || path;

function detect(pkg: any): { framework: Framework; ts: boolean; cjs: boolean } {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const framework: Framework = deps['@nestjs/core'] ? 'nest' : deps.next ? 'next' : deps.express ? 'express' : 'node';
  const ts = Boolean(deps.typescript) || existsSync(join(cwd, 'tsconfig.json'));
  // Plain JS without "type": "module" uses require(); generate code in the same style.
  return { framework, ts, cjs: !ts && pkg.type !== 'module' };
}

const EXAMPLE_ACTION = `registerAction({
  name: 'get_business_hours',
  description: 'Return the business opening hours. Replace this with a real action, e.g. create_booking.',
  parameters: {},
  handler: async () => {
    // Call your own services / database here and return plain JSON.
    return { note: 'Replace this example with your real data.' };
  },
});

// Optional: reference data AI Employee answers questions from (services, prices, policies).
registerKnowledge(async () => ({
  documents: [
    // { externalId: 'services-and-pricing', title: 'Services & Pricing', format: 'markdown', content: '...' },
  ],
}));`;

/** Rewrites the ESM starter into CommonJS for plain-JS projects. */
function toCommonJs(code: string): string {
  return code
    .replace(/^import \{ ([^}]+) \} from '([^']+)';$/gm, "const { $1 } = require('$2');")
    .replace(/^export const (\w+) = /gm, 'module.exports.$1 = ')
    .replace(/^export function (\w+)\(/gm, 'module.exports.$1 = function $1(');
}

function starterFiles(framework: Framework, ts: boolean, cjs = false): { path: string; content: string; mount: string; basePath: string }[] {
  const files = esmStarterFiles(framework, ts);
  if (!cjs || framework === 'next' || framework === 'nest') return files;
  return files.map((f) => ({
    ...f,
    content: toCommonJs(f.content),
    mount: f.mount.replace("import { aiEmployeeRouter } from './ai-employee';", "const { aiEmployeeRouter } = require('./ai-employee');"),
  }));
}

function esmStarterFiles(framework: Framework, ts: boolean): { path: string; content: string; mount: string; basePath: string }[] {
  const ext = ts ? 'ts' : 'js';
  const srcDir = existsSync(join(cwd, 'src')) ? 'src' : '.';
  const header = '// AI Employee connection — generated by `npx ai-employee-sdk init`.\n// The API key comes from AI_EMPLOYEE_API_KEY in your environment.\n';

  if (framework === 'nest') {
    return [
      {
        path: join(srcDir, 'ai-employee', `ai-employee.module.${ext}`),
        content: `${header}import { Module } from '@nestjs/common';
import { AiActionsModule, registerAction, registerKnowledge } from '${SDK}/nestjs-adapter';

${EXAMPLE_ACTION}

@Module({ imports: [AiActionsModule.forRoot()] })
export class AiEmployeeModule {}
`,
        mount: "Add AiEmployeeModule to the imports of your AppModule:\n      import { AiEmployeeModule } from './ai-employee/ai-employee.module';",
        basePath: '',
      },
    ];
  }

  if (framework === 'next') {
    const appDir = existsSync(join(cwd, 'src', 'app')) ? join('src', 'app') : 'app';
    return [
      {
        path: join(appDir, 'api', 'ai', '[...slug]', `route.${ext}`),
        content: `${header}import { handleIntegrationRequest, registerAction, registerKnowledge } from '${SDK}/registry';

${EXAMPLE_ACTION}

async function handler(req${ts ? ': Request' : ''}) {
  const url = new URL(req.url);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : undefined;
  const res = await handleIntegrationRequest({
    method: req.method,
    path: url.pathname.replace(/^\\/api/, ''),
    headers: Object.fromEntries(req.headers.entries()),
    body,
  });
  return Response.json(res.body, { status: res.status });
}

export { handler as GET, handler as POST };
`,
        mount: 'Nothing to add: Next.js picks the route up automatically.',
        basePath: '/api',
      },
    ];
  }

  if (framework === 'express') {
    return [
      {
        path: join(srcDir, `ai-employee.${ext}`),
        content: `${header}import { createExpressRouter, registerAction, registerKnowledge } from '${SDK}/express-adapter';

${EXAMPLE_ACTION}

export const aiEmployeeRouter = createExpressRouter();
`,
        mount: "In your app file, after app.use(express.json()):\n      import { aiEmployeeRouter } from './ai-employee';\n      app.use('/ai', aiEmployeeRouter);",
        basePath: '',
      },
    ];
  }

  return [
    {
      path: join(srcDir, `ai-employee.${ext}`),
      content: `${header}import { handleIntegrationRequest, registerAction, registerKnowledge } from '${SDK}/registry';

${EXAMPLE_ACTION}

/** Call this from any server for requests under /ai (Fastify, Hono, Koa, plain http …). */
export function handleAiEmployee(method${ts ? ': string' : ''}, path${ts ? ': string' : ''}, headers${ts ? ': Record<string, string>' : ''}, body${ts ? '?: unknown' : ''}) {
  return handleIntegrationRequest({ method, path, headers, body }); // -> { status, body }
}
`,
      mount: 'Route GET/POST requests under /ai to handleAiEmployee(method, path, headers, body) and send back { status, body }.',
      basePath: '',
    },
  ];
}

function installCommand(): string[] {
  const has = (f: string) => projectDirs().some((d) => existsSync(join(d, f)));
  if (has('pnpm-lock.yaml') || has('pnpm-workspace.yaml')) return ['pnpm', 'add', SDK];
  if (has('yarn.lock')) return ['yarn', 'add', SDK];
  if (has('bun.lockb') || has('bun.lock')) return ['bun', 'add', SDK];
  return ['npm', 'install', SDK];
}

function isGitIgnored(path: string): boolean {
  const r = spawnSync('git', ['check-ignore', '-q', path], { cwd });
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  // Not a git repo or git missing: fall back to a simple .gitignore check.
  const gitignore = existsSync(join(cwd, '.gitignore')) ? readFileSync(join(cwd, '.gitignore'), 'utf8') : '';
  return gitignore.split('\n').some((l) => ['.env', '.env*', '.env.local', '.env*.local'].includes(l.trim()));
}

function init(args: string[]) {
  const pkg = readJson(join(cwd, 'package.json'));
  if (!pkg) {
    console.error(red('No package.json here. Run this inside your backend project folder.'));
    process.exit(1);
  }
  const { framework, ts, cjs } = detect(pkg);
  const label = { nest: 'NestJS', next: 'Next.js', express: 'Express', node: 'Node.js (generic)' }[framework];
  console.log(bold(`\nConnecting ${pkg.name ?? 'this project'} to AI Employee`) + dim(`  (${label}${ts ? ', TypeScript' : ''})\n`));

  // 1. Install the SDK.
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (deps[SDK]) ok(`${SDK} already installed`);
  else if (args.includes('--no-install')) console.log(`  - Skipped install. Run: ${installCommand().join(' ')}`);
  else {
    const [cmd, ...rest] = installCommand();
    console.log(dim(`  $ ${[cmd, ...rest].join(' ')}`));
    const r = spawnSync(cmd!, rest, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) {
      bad(`Install failed. Run it yourself: ${[cmd, ...rest].join(' ')}`);
      process.exit(1);
    }
    ok(`Installed ${SDK}`);
  }

  // 2. Starter code (never overwrites without --force).
  const files = starterFiles(framework, ts, cjs);
  for (const f of files) {
    const full = join(cwd, f.path);
    if (existsSync(full) && !args.includes('--force')) {
      ok(`${f.path} already exists (kept; use --force to replace)`);
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
    ok(`Created ${f.path}`);
  }

  // 3. Environment. Keys from the owner's developer kit may already be in a .env here or at the
  //    repo root; never create a second, different key next to them.
  const envFile = framework === 'next' ? '.env.local' : '.env';
  const { values: env, existing } = loadEnv(framework === 'next' ? ['.env', '.env.local'] : ['.env']);
  const target = existing.filter((p) => p.endsWith(envFile)).pop() ?? join(cwd, envFile);
  const lines: string[] = [];
  const apiKey = env.AI_EMPLOYEE_API_KEY || `aie_${randomBytes(24).toString('base64url')}`;
  if (!env.AI_EMPLOYEE_API_KEY) lines.push(`AI_EMPLOYEE_API_KEY=${apiKey}`);
  if (env.AI_EMPLOYEE_WEBHOOK_URL === undefined) lines.push('AI_EMPLOYEE_WEBHOOK_URL=');
  if (env.AI_EMPLOYEE_WEBHOOK_SECRET === undefined) lines.push('AI_EMPLOYEE_WEBHOOK_SECRET=');
  if (lines.length) {
    appendFileSync(target, `\n# AI Employee connection\n${lines.join('\n')}\n`);
    ok(`Added ${lines.length} setting(s) to ${show(target)}`);
  } else ok(`Found the AI Employee settings in ${existing.map(show).join(', ')}`);
  if (!isGitIgnored(target)) console.log(red(`  ! Add ${show(target)} to .gitignore so the key is never committed.`));

  const port = portOf(env);
  const baseUrl = `http://localhost:${port}${files[0]!.basePath}`;
  const fromKit = Boolean(env.AI_EMPLOYEE_API_KEY && env.AI_EMPLOYEE_WEBHOOK_URL);
  if (fromKit) {
    // Keys came from the business owner's developer kit: AI Employee already knows them.
    console.log(`
${bold('Next steps')}
  1. ${files[0]!.mount}
  2. Replace the example action with real ones that call your code.
  3. Start your server and check it: ${bold(`npx ${SDK} verify --url ${baseUrl}`)}
  4. Send the business owner your ${bold('Base URL')} (your public address, e.g. https://api.yourapp.com${files[0]!.basePath}).
     They paste it into AI Employee and click Test connection.
`);
    return;
  }
  console.log(`
${bold('Next steps')}
  1. ${files[0]!.mount}
  2. Start your server.
  3. In AI Employee: ${bold('Integrations → Connect your software → I already have the details')}
       Base URL: ${baseUrl}   ${dim('(use your real port; your public https address in production)')}
       API key:  ${apiKey}
     Click ${bold('Connect and test')}.
  4. Copy the webhook URL and secret AI Employee shows into ${show(target)}:
       AI_EMPLOYEE_WEBHOOK_URL=…   AI_EMPLOYEE_WEBHOOK_SECRET=…
     Then report events from your code: ${dim("await sendEvent('booking.created', { bookingId, customerName })")}
  5. Check everything: ${bold(`npx ${SDK} verify --url ${baseUrl}`)}
`);
}

async function verify(args: string[]) {
  const urlArg = args[args.indexOf('--url') + 1];
  const fileEnv = loadEnv(['.env', '.env.local']).values;
  const get = (k: string) => process.env[k] || fileEnv[k] || '';
  const base = (args.includes('--url') && urlArg ? urlArg : `http://localhost:${portOf({ ...fileEnv, ...(process.env as Record<string, string>) })}`).replace(/\/+$/, '').replace(/\/ai$/, '');
  const apiKey = get('AI_EMPLOYEE_API_KEY');
  let failed = false;
  console.log(bold(`\nChecking the AI Employee connection at ${base}\n`));

  if (!apiKey) {
    bad('AI_EMPLOYEE_API_KEY is not set (run `init` first).');
    process.exit(1);
  }

  try {
    const res = await fetch(`${base}/ai/actions`, { headers: { 'X-API-Key': apiKey } });
    if (res.ok) {
      const body = (await res.json()) as { actions?: { name: string }[] };
      const n = body.actions?.length ?? 0;
      if (n) ok(`GET /ai/actions answers with ${n} action(s): ${body.actions!.map((a) => a.name).join(', ')}`);
      else {
        bad('GET /ai/actions answers but lists no actions. Register at least one with registerAction().');
        failed = true;
      }
    } else {
      bad(`GET /ai/actions answered ${res.status}. ${res.status === 401 ? 'The server has a different AI_EMPLOYEE_API_KEY — restart it after editing .env.' : res.status === 404 ? 'The route is not mounted at /ai (see the mount step from init).' : ''}`);
      failed = true;
    }
  } catch (err) {
    bad(`Could not reach ${base}: ${(err as Error).message}. Is the server running? Pass --url if it uses another address.`);
    process.exit(1);
  }

  const anon = await fetch(`${base}/ai/actions`).catch(() => null);
  if (anon && anon.status === 401) ok('Requests without the key are refused');
  else if (anon) {
    bad('Requests WITHOUT the key are accepted. Make sure the server reads AI_EMPLOYEE_API_KEY.');
    failed = true;
  }

  const k = await fetch(`${base}/ai/knowledge`, { headers: { 'X-API-Key': apiKey } }).catch(() => null);
  if (k?.ok) {
    const body = (await k.json()) as { documents?: unknown[]; locations?: unknown[] };
    ok(`GET /ai/knowledge: ${body.documents?.length ?? 0} document(s), ${body.locations?.length ?? 0} location(s)${body.documents?.length ? '' : dim(' (optional)')}`);
  } else console.log(`  - GET /ai/knowledge not available ${dim('(optional)')}`);

  if (get('AI_EMPLOYEE_WEBHOOK_URL') && get('AI_EMPLOYEE_WEBHOOK_SECRET')) {
    const r = await sendEvent('connection.test', { message: 'Test event from verify' }, {
      webhookUrl: get('AI_EMPLOYEE_WEBHOOK_URL'),
      webhookSecret: get('AI_EMPLOYEE_WEBHOOK_SECRET'),
      retries: 0,
    });
    if (r.ok) ok('Test event delivered to AI Employee (it shows on the integration as the last event)');
    else {
      bad(`Test event failed: ${r.error}`);
      failed = true;
    }
  } else console.log(`  - Events not set up yet: add AI_EMPLOYEE_WEBHOOK_URL and AI_EMPLOYEE_WEBHOOK_SECRET ${dim('(from AI Employee)')}`);

  console.log(failed ? red('\nSome checks failed — see above.\n') : green('\nAll checks passed.\n'));
  process.exit(failed ? 1 : 0);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'init') init(rest);
else if (command === 'verify') void verify(rest);
else {
  console.log(`Usage:
  npx ${SDK} init [--no-install] [--force]   Set up this project (detects NestJS, Next.js, Express)
  npx ${SDK} verify [--url <base url>]       Check the endpoints and event webhook work`);
  process.exit(command ? 1 : 0);
}
