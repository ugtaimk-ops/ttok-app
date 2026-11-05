// Copy-only migration. Never deletes Firestore or overwrites PostgreSQL rows.
// Use --write only after schema.sql and DATABASE_URL are prepared.
import dotenv from 'dotenv';
import pg from 'pg';
import { createRequire } from 'node:module';

dotenv.config();
const require = createRequire(import.meta.url);
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const write = process.argv.includes('--write');
const serviceKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const url = process.env.DATABASE_URL;
if (!serviceKey || (write && !url)) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is required; --write also requires DATABASE_URL.');
  process.exit(1);
}
const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(serviceKey)) });
const source = getFirestore(app, 'ai-studio-22fbd27c-5516-4028-bd17-a6d4ba99710b');
const pool = write ? new pg.Pool({ connectionString: url, max: 3 }) : null;
const collections = ['schedules', 'todos', 'scripts', 'practiceLogs', 'aiCostMonths'];
const totals = { users: 0, documents: 0, usage: 0, subscriptions: 0, caches: 0 };
function normalized(value) {
  if (value?.toDate instanceof Function) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalized(v)]));
  return value;
}
async function copyDocument(uid, collection, id, data) {
  totals.documents++;
  if (!write) return;
  await pool.query(`INSERT INTO app_documents (owner_uid, collection_name, document_id, data)
    VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT DO NOTHING`, [uid, collection, id, JSON.stringify(normalized(data))]);
}
async function copyCache(uid, type, key, data, expiresAt) {
  totals.caches++;
  if (!write) return;
  await pool.query(`INSERT INTO app_cache (owner_uid, cache_type, cache_key, data, expires_at)
    VALUES ($1, $2, $3, $4::jsonb, $5) ON CONFLICT DO NOTHING`,
    [uid, type, key, JSON.stringify(normalized(data)), new Date(expiresAt)]);
}
try {
  let cursor = null;
  while (true) {
    let query = source.collection('users').orderBy('__name__').limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const user of page.docs) {
      const uid = user.id;
      const profile = user.data();
      totals.users++;
      await copyDocument(uid, 'profile', 'root', profile);
      if (profile.aiUsageMonth && Number.isFinite(profile.aiUsageCount)) {
        totals.usage++;
        if (write) await pool.query(`INSERT INTO app_usage (owner_uid, month_key, used, estimated_cost_usd)
          VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [uid, profile.aiUsageMonth, Math.max(0, Math.floor(profile.aiUsageCount)), Math.max(0, Number(profile.aiEstimatedCostUsd) || 0)]);
      }
      totals.subscriptions++;
      if (write) await pool.query(`INSERT INTO app_subscriptions (owner_uid, is_premium)
        VALUES ($1, $2) ON CONFLICT DO NOTHING`, [uid, profile.isPremium === true]);
      for (const collection of collections) {
        const docs = await user.ref.collection(collection).get();
        for (const doc of docs.docs) await copyDocument(uid, collection, doc.id, doc.data());
      }
      const aiResults = await user.ref.collection('aiResultCache').get();
      for (const doc of aiResults.docs) {
        const data = doc.data();
        if (Number.isFinite(data.expiresAt)) await copyCache(uid, 'aiResult', doc.id, data, data.expiresAt);
      }
      const solutions = await source.collection('problemSolutions').doc(uid).collection('items').get();
      for (const doc of solutions.docs) {
        const data = doc.data();
        if (Number.isFinite(data.createdAt)) await copyCache(uid, 'problemSolution', doc.id, data, data.createdAt + 30 * 24 * 60 * 60 * 1000);
      }
    }
    cursor = page.docs.at(-1);
    if (page.size < 100) break;
  }
  console.log(JSON.stringify({ mode: write ? 'copy' : 'dry-run', totals }));
} finally {
  if (pool) await pool.end();
}
