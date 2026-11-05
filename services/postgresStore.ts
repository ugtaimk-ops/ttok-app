import pg from "pg";

const { Pool } = pg;
const collections = ["profile", "schedules", "todos", "scripts", "practiceLogs", "aiCostMonths"] as const;
export type StoredCollection = typeof collections[number];
const serverFields = new Set([
  "isPremium", "aiUsageCount", "aiUsageMonth", "aiProblemSolveCalls",
  "aiEstimatedCostMonth", "aiEstimatedCostUsd", "uid", "email", "provider",
  "createdAt", "lastLogin", "termsAcceptedVersion", "termsAcceptedAt"
]);

let pool: pg.Pool | null = null;
export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
function database(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });
    pool.on("error", (err) => console.error("[Postgres] Idle connection error:", err));
  }
  return pool;
}
export function validCollection(value: string): value is StoredCollection {
  return (collections as readonly string[]).includes(value);
}
export function validDocumentId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && !/[\/\\\x00-\x1f]/.test(value);
}
export function validUserPayload(collection: StoredCollection, id: string, value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => serverFields.has(key))) return false;
  if (collection === "aiCostMonths") return false;
  if (collection === "profile") return id === "root";
  return typeof data.id === "string" && data.id === id;
}
export async function getUserDocuments(uid: string, collection: StoredCollection, after = ""): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
  const result = await database().query(
    "SELECT document_id, data FROM app_documents WHERE owner_uid = $1 AND collection_name = $2 AND document_id > $3 ORDER BY document_id LIMIT 101",
    [uid, collection, after]
  );
  const hasMore = result.rows.length > 100;
  const page = result.rows.slice(0, 100);
  return { items: page.map((row) => row.data), nextCursor: hasMore ? page.at(-1).document_id : null };
}
export async function putUserDocument(uid: string, collection: StoredCollection, id: string, data: Record<string, unknown>): Promise<void> {
  await database().query(
    `INSERT INTO app_documents (owner_uid, collection_name, document_id, data)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (owner_uid, collection_name, document_id)
     DO UPDATE SET data = app_documents.data || EXCLUDED.data, updated_at = now()`,
    [uid, collection, id, JSON.stringify(data)]
  );
}
export async function deleteUserDocument(uid: string, collection: StoredCollection, id: string): Promise<void> {
  await database().query(
    "DELETE FROM app_documents WHERE owner_uid = $1 AND collection_name = $2 AND document_id = $3",
    [uid, collection, id]
  );
}
export async function getStorageStatus(): Promise<boolean> {
  await database().query("SELECT 1");
  return true;
}
