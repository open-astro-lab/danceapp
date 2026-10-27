/**
 * Shared data API for Dance Class Manager (Vercel serverless).
 * GET  → read data.json from GitHub
 * POST → write data.json to GitHub (same for every user)
 *
 * Env on Vercel:
 *   GITHUB_TOKEN  = fine-grained PAT with Contents read/write on this repo
 *   GITHUB_REPO   = open-astro-lab/danceapp   (optional, default below)
 */

const REPO = process.env.GITHUB_REPO || 'open-astro-lab/danceapp';
const PATH = 'data.json';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function gh(path, opts = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    const err = new Error('GITHUB_TOKEN is not set on the server');
    err.code = 'NO_TOKEN';
    throw err;
  }
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'danceapp',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.message || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function normalize(payload) {
  const empty = { mwf: [], tts: [], zumba: [] };
  if (!payload || typeof payload !== 'object') return empty;
  const out = { ...empty };
  for (const key of ['mwf', 'tts', 'zumba']) {
    const list = Array.isArray(payload[key]) ? payload[key] : [];
    out[key] = list
      .filter((s) => s && typeof s.name === 'string' && typeof s.feesDate === 'string')
      .map((s) => ({
        name: String(s.name).trim().slice(0, 80),
        feesDate: String(s.feesDate).slice(0, 10),
      }))
      .filter((s) => s.name && /^\d{4}-\d{2}-\d{2}$/.test(s.feesDate));
  }
  return out;
}

module.exports = async function handler(req, res) {
  // CORS for WordPress embed on another domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    if (req.method === 'GET') {
      try {
        const file = await gh(`/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`);
        const decoded = Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8');
        const data = normalize(JSON.parse(decoded));
        return json(res, 200, { ok: true, data, sha: file.sha });
      } catch (e) {
        if (e.status === 404) {
          return json(res, 200, { ok: true, data: normalize(null), sha: null });
        }
        throw e;
      }
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return json(res, 400, { ok: false, error: 'Invalid JSON body' });
        }
      }
      // Vercel may already parse JSON
      if (!body || typeof body !== 'object') {
        return json(res, 400, { ok: false, error: 'Body required' });
      }

      const data = normalize(body.data ?? body);
      let sha = body.sha || null;

      if (!sha) {
        try {
          const file = await gh(`/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`);
          sha = file.sha;
        } catch (e) {
          if (e.status !== 404) throw e;
        }
      }

      const content = Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64');
      const payload = {
        message: `Update class data (${new Date().toISOString()})`,
        content,
        branch: BRANCH,
      };
      if (sha) payload.sha = sha;

      const result = await gh(`/repos/${REPO}/contents/${PATH}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      return json(res, 200, {
        ok: true,
        data,
        sha: result.content?.sha || null,
      });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(res, e.status || 500, {
      ok: false,
      error: e.message || 'Server error',
      code: e.code || null,
    });
  }
};
