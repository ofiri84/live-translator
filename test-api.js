#!/usr/bin/env node
/**
 * Quick API smoke test.
 * Run: npm start (in one terminal), then npm test (in another)
 * Or: node test-api.js (requires server running on :3000)
 * Valid OPENAI_API_KEY needed for full pass.
 */
const http = require('http');

const BASE = 'http://localhost:3000';

function req(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const opts = { method, hostname: u.hostname, port: u.port || 3000, path: u.pathname + u.search };
    if (body) {
      const buf = Buffer.from(JSON.stringify(body));
      opts.headers = { 'Content-Type': 'application/json', 'Content-Length': buf.length };
    }
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const ct = res.headers['content-type'] || '';
        let parsed = data;
        if (data && ct.includes('application/json')) {
          try {
            parsed = JSON.parse(data);
          } catch {}
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    r.on('error', reject);
    if (body) r.write(Buffer.from(JSON.stringify(body)));
    r.end();
  });
}

async function main() {
  console.log('Testing Live Translator API...\n');

  // 1. Static files
  try {
    const r = await req('/');
    if (r.status === 200) {
      console.log('✓ GET / (static) ok');
    } else {
      console.log('✗ GET / failed:', r.status);
    }
  } catch (e) {
    console.log('✗ Server not running?', e.message);
    process.exit(1);
  }

  // 2. translate-auto (will fail without valid key, but we check structure)
  try {
    const r = await req('/api/translate-auto', 'POST', { text: 'hello', voice: 'female', speakBoth: false });
    if (r.status === 200 && r.data?.translated && r.data?.audioTranslated) {
      console.log('✓ POST /api/translate-auto ok (translation + audio)');
    } else if (r.status === 401 || r.status === 500) {
      console.log('⚠ POST /api/translate-auto responded (auth/error - check OPENAI_API_KEY)');
    } else {
      console.log('✗ POST /api/translate-auto unexpected:', r.status, r.data?.error || '');
    }
  } catch (e) {
    console.log('✗ translate-auto:', e.message);
  }

  // 3. speak (returns binary mp3, or JSON error)
  try {
    const r = await req('/api/speak', 'POST', { text: 'hi', voice: 'female' });
    if (r.status === 200) {
      const isJson = r.data && typeof r.data === 'object' && 'error' in r.data;
      console.log(isJson ? '⚠ POST /api/speak error in body' : '✓ POST /api/speak ok (audio)');
    } else if (r.status === 401 || r.status === 500) {
      console.log('⚠ POST /api/speak responded (auth/error)');
    } else {
      console.log('✗ POST /api/speak:', r.status);
    }
  } catch (e) {
    console.log('✗ speak:', e.message);
  }

  console.log('\nDone.');
}

main().catch(console.error);
