/**
 * Shared data API (Vercel Node serverless)
 * Env: GITHUB_TOKEN (Contents read/write on open-astro-lab/danceapp)
 */

const REPO = process.env.GITHUB_REPO || 'open-astro-lab/danceapp';
const PATH = 'data.json';
const BRANCH = process.env.GITHUB_BRANCH || 'main';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      resolve(req.body);
      return;
    }
    if (typeof req.body === 'string') {
      try {
        resolve(JSON.parse(req.body));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function gh(urlPath, opts = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    const err = new Error('GITHUB_TOKEN missing on Vercel. Add it in Project Settings → Environment Variables, then Redeploy.');
    err.code = 'NO_TOKEN';
    throw err;
  }
  const res = await fetch(`https://api.github.com${urlPath}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'danceapp-vercel',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const err = new Error(data?.message || `GitHub HTTP ${res.status}`);
    err.status = res.status;
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
  if (req.method === 'OPTIONS') {
    return send(res, 204, {});
  }

  try {
    if (req.method === 'GET') {
      try {
        const file = await gh(`/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`);
        const decoded = Buffer.from(String(file.content).replace(/\n/g, ''), 'base64').toString('utf8');
        const data = normalize(JSON.parse(decoded));
        return send(res, 200, { ok: true, data, sha: file.sha });
      } catch (e) {
        if (e.status === 404) {
          return send(res, 200, { ok: true, data: normalize(null), sha: null });
        }
        throw e;
      }
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
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
        message: `chore: update class data ${new Date().toISOString()}`,
        content,
        branch: BRANCH,
      };
      if (sha) payload.sha = sha;

      const result = await gh(`/repos/${REPO}/contents/${PATH}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      return send(res, 200, {
        ok: true,
        data,
        sha: result.content?.sha || null,
      });
    }

    return send(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('api/data error', e);
    return send(res, e.status && e.status < 600 ? e.status : 500, {
      ok: false,
      error: e.message || 'Server error',
      code: e.code || null,
    });
  }
};
