import http from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { dirname, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.KORETS_DATA_DIR || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'KoretsMuseum');
const assetDir = join(dataDir, 'assets');
const catalogPath = join(dataDir, 'exhibits.json');
const articlesPath = join(dataDir, 'articles.json');
const adminPath = join(dataDir, 'admin.json');
const sessions = new Map();
const maxUpload = 100 * 1024 * 1024;
const port = Number(process.env.KORETS_API_PORT || 3001);
const networkMode = process.env.KORETS_NETWORK === '1';

function allowedOrigin(origin) {
  if (!origin) return false;
  try {
    const value = new URL(origin);
    if (value.protocol !== 'http:' || value.port !== '3000') return false;
    const host = value.hostname;
    return host === 'localhost' || host === '127.0.0.1' || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  } catch { return false; }
}

await mkdir(assetDir, { recursive: true });
try { await stat(catalogPath); } catch { await copyFile(join(root, 'data', 'seed-exhibits.json'), catalogPath); }
try { await stat(articlesPath); } catch { await writeFile(articlesPath, '[]'); }

function send(res, status, value, extra = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}
function fail(res, status, message) { send(res, status, { error: message }); }
async function readJson(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Завеликий запит');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function catalog() { return JSON.parse(await readFile(catalogPath, 'utf8')); }
async function saveCatalog(items) {
  const temp = `${catalogPath}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(items, null, 2));
  await rename(temp, catalogPath);
}
async function articles() { return JSON.parse(await readFile(articlesPath, 'utf8')); }
async function saveArticles(items) {
  const temp = `${articlesPath}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(items, null, 2));
  await rename(temp, articlesPath);
}
function authorized(req) {
  const cookie = req.headers.cookie?.match(/(?:^|; )museum_session=([a-f0-9]+)/)?.[1];
  if (!cookie) return false;
  const expiry = sessions.get(cookie);
  if (!expiry || expiry < Date.now()) { sessions.delete(cookie); return false; }
  return true;
}
function validate(item, existingId) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim().slice(0, 120);
  const period = String(item.period || '').trim().slice(0, 120);
  const category = String(item.category || '').trim().slice(0, 80);
  const summary = String(item.summary || '').trim().slice(0, 1200);
  const model = String(item.model || '');
  const poster = String(item.poster || '');
  const normalizeAsset = (path) => path.replace(new RegExp(`^http://(?:localhost|127\\.0\\.0\\.1):${port}(/assets/)`), '$1');
  const normalizedModel = normalizeAsset(model);
  const normalizedPoster = normalizeAsset(poster);
  const validAsset = (path, ext) => path.startsWith('/models/') || new RegExp(`^/assets/[a-f0-9-]+\\.${ext}$`).test(path);
  if (!title || !normalizedModel || !validAsset(normalizedModel, 'glb')) return null;
  if (normalizedPoster && !(/^\/exhibits\/[\w.-]+$/.test(normalizedPoster) || validAsset(normalizedPoster, '(png|jpg|jpeg|webp)'))) return null;
  return { id: existingId || randomUUID(), title, period, category, summary, model: normalizedModel, ...(normalizedPoster ? { poster: normalizedPoster } : {}), cameraOrbit: '25deg 70deg 2.8m' };
}
function validateArticle(item, existingId) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim().slice(0, 160);
  const subtitle = String(item.subtitle || '').trim().slice(0, 600);
  const category = String(item.category || '').trim().slice(0, 80);
  const normalizeAsset = (path) => String(path || '').replace(new RegExp(`^http://(?:localhost|127\\.0\\.0\\.1):${port}(/assets/)`), '$1');
  const validImage = (path) => !path || /^\/assets\/[a-f0-9-]+\.(png|jpg|jpeg|webp)$/.test(path);
  const cover = normalizeAsset(item.cover);
  if (!title || !validImage(cover) || !Array.isArray(item.blocks)) return null;
  const blocks = item.blocks.slice(0, 80).map((block) => {
    if (!block || typeof block !== 'object') return null;
    const type = String(block.type || '');
    const id = /^[a-zA-Z0-9-]{1,80}$/.test(String(block.id || '')) ? String(block.id) : randomUUID();
    if (type === 'heading') return { id, type, text: String(block.text || '').trim().slice(0, 240) };
    if (type === 'paragraph') return { id, type, text: String(block.text || '').trim().slice(0, 6000) };
    if (type === 'quote') return { id, type, text: String(block.text || '').trim().slice(0, 1800) };
    if (type === 'image') {
      const image = normalizeAsset(block.image);
      if (!image || !validImage(image)) return null;
      return { id, type, image, caption: String(block.caption || '').trim().slice(0, 400) };
    }
    return null;
  }).filter(Boolean);
  if (blocks.length !== item.blocks.slice(0, 80).length) return null;
  return { id: existingId || randomUUID(), title, subtitle, category, ...(cover ? { cover } : {}), blocks };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const permittedOrigin = allowedOrigin(origin) ? origin : null;
  if (permittedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(permittedOrigin ? 204 : 403); res.end(); return; }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      let pinReady = true;
      try { await stat(adminPath); } catch { pinReady = false; }
      send(res, 200, { ok: true, pinReady }); return;
    }
    if (url.pathname === '/api/exhibits' && req.method === 'GET') { send(res, 200, await catalog()); return; }
    if (url.pathname === '/api/articles' && req.method === 'GET') { send(res, 200, await articles()); return; }
    if (url.pathname.startsWith('/assets/') && req.method === 'GET') {
      const name = url.pathname.slice('/assets/'.length);
      if (!/^[a-f0-9-]+\.(glb|png|jpg|jpeg|webp)$/.test(name)) { fail(res, 404, 'Не знайдено'); return; }
      const file = join(assetDir, name);
      let info;
      try { info = await stat(file); } catch { fail(res, 404, 'Не знайдено'); return; }
      const ext = extname(name);
      const mime = { '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext];
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': info.size, 'Access-Control-Allow-Origin': permittedOrigin || '*', 'Cache-Control': 'public, max-age=3600' });
      createReadStream(file).pipe(res); return;
    }
    if (!permittedOrigin) { fail(res, 403, 'Недозволене джерело запиту'); return; }
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { pin } = await readJson(req, 1024);
      const admin = JSON.parse(await readFile(adminPath, 'utf8'));
      const candidate = scryptSync(String(pin || ''), admin.salt, 64);
      const expected = Buffer.from(admin.hash, 'hex');
      if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) { fail(res, 401, 'Невірний PIN'); return; }
      const token = randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
      send(res, 200, { ok: true }, { 'Set-Cookie': `museum_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` }); return;
    }
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      const token = req.headers.cookie?.match(/(?:^|; )museum_session=([a-f0-9]+)/)?.[1];
      if (token) sessions.delete(token);
      send(res, 200, { ok: true }, { 'Set-Cookie': 'museum_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); return;
    }
    if (!authorized(req)) { fail(res, 401, 'Потрібен вхід адміністратора'); return; }
    if (url.pathname === '/api/session' && req.method === 'GET') { send(res, 200, { ok: true }); return; }
    if (url.pathname === '/api/upload' && req.method === 'PUT') {
      const ext = url.searchParams.get('ext')?.toLowerCase();
      if (!['glb', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) { fail(res, 400, 'Підтримуються GLB, PNG, JPG та WebP'); return; }
      const length = Number(req.headers['content-length']);
      if (!Number.isFinite(length) || length <= 0 || length > maxUpload) { fail(res, 413, 'Файл має бути до 100 МБ'); return; }
      const name = `${randomUUID()}.${ext}`;
      const file = join(assetDir, name);
      let size = 0;
      try {
        req.on('data', (chunk) => { size += chunk.length; if (size > maxUpload) req.destroy(); });
        await pipeline(req, createWriteStream(file, { flags: 'wx' }));
        if (size !== length) throw new Error('Передано не весь файл');
      } catch (error) { await rm(file, { force: true }); throw error; }
      send(res, 201, { url: `/assets/${name}` }); return;
    }
    if (url.pathname === '/api/exhibits' && req.method === 'POST') {
      const item = validate(await readJson(req));
      if (!item) { fail(res, 400, 'Додайте назву та GLB-модель'); return; }
      const items = await catalog(); items.push(item); await saveCatalog(items);
      send(res, 201, item); return;
    }
    const match = url.pathname.match(/^\/api\/exhibits\/([\w-]+)$/);
    if (match && req.method === 'PUT') {
      const items = await catalog(); const index = items.findIndex((item) => item.id === match[1]);
      if (index < 0) { fail(res, 404, 'Експонат не знайдено'); return; }
      const item = validate(await readJson(req), match[1]);
      if (!item) { fail(res, 400, 'Додайте назву та GLB-модель'); return; }
      items[index] = item; await saveCatalog(items); send(res, 200, item); return;
    }
    if (match && req.method === 'DELETE') {
      const items = await catalog(); const next = items.filter((item) => item.id !== match[1]);
      if (next.length === items.length) { fail(res, 404, 'Експонат не знайдено'); return; }
      await saveCatalog(next); send(res, 200, { ok: true }); return;
    }
    if (url.pathname === '/api/articles' && req.method === 'POST') {
      const item = validateArticle(await readJson(req, 512 * 1024));
      if (!item) { fail(res, 400, 'Перевірте назву, текстові блоки та зображення'); return; }
      const items = await articles(); items.push(item); await saveArticles(items);
      send(res, 201, item); return;
    }
    const articleMatch = url.pathname.match(/^\/api\/articles\/([\w-]+)$/);
    if (articleMatch && req.method === 'PUT') {
      const items = await articles(); const index = items.findIndex((item) => item.id === articleMatch[1]);
      if (index < 0) { fail(res, 404, 'Статтю не знайдено'); return; }
      const item = validateArticle(await readJson(req, 512 * 1024), articleMatch[1]);
      if (!item) { fail(res, 400, 'Перевірте назву, текстові блоки та зображення'); return; }
      items[index] = item; await saveArticles(items); send(res, 200, item); return;
    }
    if (articleMatch && req.method === 'DELETE') {
      const items = await articles(); const next = items.filter((item) => item.id !== articleMatch[1]);
      if (next.length === items.length) { fail(res, 404, 'Статтю не знайдено'); return; }
      await saveArticles(next); send(res, 200, { ok: true }); return;
    }
    fail(res, 404, 'Не знайдено');
  } catch (error) {
    console.error(error);
    fail(res, 500, error.code === 'ENOENT' && url.pathname === '/api/login' ? 'PIN ще не налаштовано' : 'Не вдалося виконати дію');
  }
});
const bindHost = networkMode ? '0.0.0.0' : '127.0.0.1';
server.listen(port, bindHost, () => console.log(`Museum data: ${dataDir}; API listening on ${bindHost}:${port}`));
const ipv6Server = http.createServer(server.listeners('request')[0]);
ipv6Server.on('error', (error) => console.warn(`IPv6 loopback unavailable: ${error.message}`));
ipv6Server.listen(port, '::1');
