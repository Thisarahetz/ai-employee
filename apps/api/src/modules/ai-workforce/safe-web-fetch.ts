import axios from 'axios';
import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';

/**
 * Fetches a public web page for the `fetch_webpage` tool without letting the
 * AI reach internal infrastructure (SSRF). The address check runs inside the
 * socket's DNS lookup, i.e. on the exact IP being connected to, so a DNS
 * record that changes between "check" and "connect" can't slip through.
 */

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCb): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = addresses as dns.LookupAddress[];
    const blocked = list.find((a) => isPrivateAddress(a.address));
    if (!list.length || blocked) {
      const e = new Error(`Blocked: ${hostname} resolves to a private or internal address.`) as NodeJS.ErrnoException;
      e.code = 'EBLOCKED';
      return callback(e, '');
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

export const httpAgent = new http.Agent({ lookup: guardedLookup as unknown as http.AgentOptions['lookup'] });
export const httpsAgent = new https.Agent({ lookup: guardedLookup as unknown as https.AgentOptions['lookup'] });

export interface WebPageSummary {
  url: string;
  finalUrl: string;
  status: number;
  responseTimeMs: number;
  title: string | null;
  metaDescription: string | null;
  hasViewportMeta: boolean;
  headings: { h1: string[]; h2: string[] };
  links: number;
  images: number;
  imagesMissingAlt: number;
  forms: number;
  scripts: number;
  callsToAction: string[];
  text: string;
}

export function validatePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().match(/^https?:\/\//i) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new Error(`"${raw}" is not a valid URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https URLs can be fetched.');
  if (url.username || url.password) throw new Error('URLs with embedded credentials are not allowed.');
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) throw new Error(`Port ${url.port} is not allowed.`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateAddress(host)) throw new Error('Private or internal addresses cannot be fetched.');
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) {
    throw new Error('Internal hostnames cannot be fetched.');
  }
  return url;
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const strip = (html: string) => decode(html.replace(/<[^>]+>/g, ' '));

export function summarizeHtml(html: string): Omit<WebPageSummary, 'url' | 'finalUrl' | 'status' | 'responseTimeMs'> {
  const all = (re: RegExp) => [...html.matchAll(re)].map((m) => strip(m[1])).filter(Boolean);
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const buttons = all(/<button\b[^>]*>([\s\S]*?)<\/button>/gi);
  const ctaLinks = all(/<a\b[^>]*class="[^"]*(?:btn|button|cta)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi);

  return {
    title: all(/<title[^>]*>([\s\S]*?)<\/title>/gi)[0] ?? null,
    metaDescription:
      html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ??
      null,
    hasViewportMeta: /<meta[^>]+name=["']viewport["']/i.test(html),
    headings: {
      h1: all(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi).slice(0, 5),
      h2: all(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi).slice(0, 12),
    },
    links: (html.match(/<a\b[^>]*href=/gi) ?? []).length,
    images: imgTags.length,
    imagesMissingAlt: imgTags.filter((t) => !/\balt=["'][^"']+["']/i.test(t)).length,
    forms: (html.match(/<form\b/gi) ?? []).length,
    scripts: (html.match(/<script\b/gi) ?? []).length,
    callsToAction: [...new Set([...buttons, ...ctaLinks])].slice(0, 10),
    text: strip(body).slice(0, 6000),
  };
}

export async function fetchPublicPage(rawUrl: string): Promise<WebPageSummary> {
  let url = validatePublicUrl(rawUrl);
  const start = Date.now();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await axios.get<string>(url.toString(), {
      httpAgent,
      httpsAgent,
      maxRedirects: 0,
      timeout: TIMEOUT_MS,
      maxContentLength: MAX_BYTES,
      responseType: 'text',
      transformResponse: (d) => d,
      validateStatus: () => true,
      headers: { 'User-Agent': 'AI-Employee-WebReader/1.0', Accept: 'text/html,application/xhtml+xml' },
    });

    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = validatePublicUrl(new URL(String(res.headers.location), url).toString());
      continue;
    }

    const contentType = String(res.headers['content-type'] ?? '');
    const html = typeof res.data === 'string' ? res.data : '';
    const summary = /html|xml|text/i.test(contentType) || !contentType ? summarizeHtml(html) : summarizeHtml('');
    return {
      url: rawUrl,
      finalUrl: url.toString(),
      status: res.status,
      responseTimeMs: Date.now() - start,
      ...summary,
    };
  }
  throw new Error(`Too many redirects (more than ${MAX_REDIRECTS}).`);
}

/**
 * HTTP agents for calls to tenant-configured integration URLs. Private/internal
 * addresses are blocked at connect time in production unless
 * INTEGRATION_ALLOW_PRIVATE_NETWORK=true (e.g. an on-prem system on a VPN);
 * outside production they are allowed so local systems (localhost) work.
 */
export function integrationAgents(env: NodeJS.ProcessEnv = process.env): { httpAgent?: http.Agent; httpsAgent?: https.Agent } {
  const flag = env.INTEGRATION_ALLOW_PRIVATE_NETWORK;
  const allowPrivate = flag ? flag === 'true' : env.NODE_ENV !== 'production';
  return allowPrivate ? {} : { httpAgent, httpsAgent };
}
