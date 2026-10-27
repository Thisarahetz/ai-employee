/**
 * Fail-fast environment validation, run before the app boots. Missing secrets
 * must stop the process — never fall back to a guessable default.
 *
 * In production (NODE_ENV=production) placeholder values from .env.example
 * ("change-me…") and short secrets are rejected too.
 */
export interface EnvProblem {
  key: string;
  problem: string;
}

const PLACEHOLDER = /^(change-?me|changeme|secret|password|test|dev)/i;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const prod = env.NODE_ENV === 'production';
  const problems: EnvProblem[] = [];
  const need = (key: string) => {
    const v = env[key]?.trim();
    if (!v) problems.push({ key, problem: 'is not set' });
    return v ?? '';
  };

  need('DATABASE_URL');

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = need(key);
    if (v && prod && (v.length < 32 || PLACEHOLDER.test(v))) {
      problems.push({ key, problem: 'must be a random value of at least 32 characters in production' });
    }
  }
  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push({ key: 'JWT_REFRESH_SECRET', problem: 'must differ from JWT_ACCESS_SECRET' });
  }

  const enc = need('CREDENTIALS_ENCRYPTION_KEY');
  if (enc) {
    const bytes = Buffer.from(enc, 'base64');
    if (bytes.length !== 32) problems.push({ key: 'CREDENTIALS_ENCRYPTION_KEY', problem: 'must be 32 bytes, base64-encoded (openssl rand -base64 32)' });
  }

  if (prod) {
    const wh = need('WEBHOOK_SIGNING_SECRET');
    if (wh && (wh.length < 24 || PLACEHOLDER.test(wh))) {
      problems.push({ key: 'WEBHOOK_SIGNING_SECRET', problem: 'must be a random value of at least 24 characters in production' });
    }
    if (!env.REDIS_URL && !env.REDIS_HOST) problems.push({ key: 'REDIS_URL', problem: 'is required in production (task queue)' });
    if ((env.RASA_ENABLED ?? '').toLowerCase() === 'true') {
      if (!env.RASA_BASE_URL?.trim()) problems.push({ key: 'RASA_BASE_URL', problem: 'is required when RASA_ENABLED=true' });
      const rt = env.RASA_AUTH_TOKEN ?? '';
      if (rt.length < 24 || PLACEHOLDER.test(rt)) {
        problems.push({ key: 'RASA_AUTH_TOKEN', problem: 'must be a random value of at least 24 characters in production when RASA_ENABLED=true' });
      }
    }
    const hasAiKey = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'].some((k) => env[k]?.trim());
    if (!hasAiKey) problems.push({ key: 'GEMINI_API_KEY | OPENAI_API_KEY | ANTHROPIC_API_KEY', problem: 'at least one AI provider key is required' });
  }
  return problems;
}

export function assertValidEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems = validateEnv(env);
  if (problems.length) {
    const lines = problems.map((p) => `  - ${p.key} ${p.problem}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
}
