/**
 * Live Talk AI 대화 서버 (의존성 없음, Node 24 이상에서 .ts 를 바로 실행)
 *
 *   GET  /api/health   LLM 연결 상태
 *   POST /api/reply    채팅 하나 → 캐릭터 대답 { expr, text }
 *
 * 캐릭터 설정은 클라이언트가 보내지 않고, 서버가 스크립트 파일의 `ai` 항목에서 읽는다.
 */
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { loadConfig } from './config.ts';
import { complete, health, LlmError, loadModel } from './llm.ts';
import { buildMessages, parseRequest, sanitizeReply, type AiPersona } from './reply.ts';
import { Warmer } from './warmup.ts';

const cfg = loadConfig();
const PORT = Number(process.env.PORT) || 8787;
const SCRIPTS_DIR = resolve(process.env.SCRIPTS_DIR ?? join(import.meta.dirname, '../../public/scripts'));
const MAX_BODY = 16 * 1024;
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN) || 30;

/* ---------------- 모델 미리 올리기 ---------------- */
const warmer = new Warmer({
  check: () => health(cfg),
  load: () => loadModel(cfg),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  log: (m) => console.log(m),
  now: () => Date.now(),
});

/* ---------------- 캐릭터 설정 로드 (스크립트 파일의 ai 항목) ---------------- */
interface ScriptAi {
  ai?: AiPersona & { who?: string };
  characters?: Record<string, { name?: string }>;
}
const personaCache = new Map<string, { at: number; data: ScriptAi }>();

async function loadScript(name: string): Promise<ScriptAi> {
  const hit = personaCache.get(name);
  if (hit && Date.now() - hit.at < 5000) return hit.data;
  const data = JSON.parse(await readFile(join(SCRIPTS_DIR, `${name}.json`), 'utf8')) as ScriptAi;
  personaCache.set(name, { at: Date.now(), data });
  return data;
}

/* ---------------- 간단한 요청 제한 (IP 당 분당 N회) ---------------- */
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_PER_MIN;
}

/* ---------------- HTTP ---------------- */
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new LlmError('요청이 너무 큽니다', 413);
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new LlmError('JSON 형식이 아닙니다', 400);
  }
}

async function handleReply(req: IncomingMessage, res: ServerResponse) {
  // 모델을 올리는 중에는 오래 기다리게 하지 않고 바로 알린다 (브라우저는 준비된 대사로 대신함)
  if (!warmer.ready) return send(res, 503, { error: warmer.message, warming: true });

  const ip = req.socket.remoteAddress ?? 'unknown';
  if (rateLimited(ip)) return send(res, 429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });

  let parsed;
  try {
    parsed = parseRequest(await readJson(req));
  } catch (e) {
    return send(res, e instanceof LlmError ? e.status : 400, { error: (e as Error).message });
  }

  let script: ScriptAi;
  try {
    script = await loadScript(parsed.script);
  } catch {
    return send(res, 404, { error: `스크립트를 찾을 수 없습니다: ${parsed.script}` });
  }
  if (!script.ai?.persona) return send(res, 400, { error: '스크립트에 ai.persona 설정이 없습니다' });

  const who = parsed.who || script.ai.who || Object.keys(script.characters ?? {})[0] || '';
  const hostName = script.characters?.[who]?.name ?? '진행자';

  // 클라이언트가 연결을 끊으면 LLM 호출도 취소
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  const t0 = Date.now();
  try {
    const raw = await complete(cfg, buildMessages(script.ai, parsed, hostName), abort.signal);
    const reply = sanitizeReply(raw);
    send(res, 200, { ...reply, ms: Date.now() - t0, model: cfg.model });
  } catch (e) {
    const status = e instanceof LlmError ? e.status : 502;
    console.error(`[reply] ${status} ${(e as Error).message}`);
    if (!res.writableEnded && !abort.signal.aborted) send(res, status, { error: (e as Error).message });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const h = await health(cfg);
      const ok = h.reachable && h.modelReady && warmer.ready;
      return send(res, ok ? 200 : 503, {
        ok,
        provider: cfg.provider,
        model: cfg.model,
        warm: warmer.state,
        ...h,
        ...(!ok && !h.error ? { error: warmer.message } : {}),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/reply') return await handleReply(req, res);
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`[live-talk api] http://localhost:${PORT}  provider=${cfg.provider} model=${cfg.model} base=${cfg.baseUrl}`);
  void warmer.run();
});

const shutdown = () => {
  warmer.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
