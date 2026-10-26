import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

async function unusedPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  server.close();
  await once(server, "close");
  return port;
}

test("private APIs reject callers without a verified Firebase token", async () => {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const certPreload = fileURLToPath(new URL("./mock-google-certs.cjs", import.meta.url));
  const server = spawn(process.execPath, ["build/server.cjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      APP_SHARED_SECRET: "legacy-test-secret",
      TTOK_TEST_CERT_BASE64: Buffer.from(publicKey).toString("base64"),
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${certPreload}`.trim(),
    },
    stdio: "ignore",
  });

  try {
    let health;
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        health = await fetch(`${origin}/api/health`);
        break;
      } catch {
        if (server.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.equal(health?.status, 200, "server must start and keep health public");

    for (const route of [
      "/api/school/search?keyword=test",
      "/api/meal/info?officeCode=ABC&schoolCode=1234567&date=20261026",
      "/api/usage/status",
      "/api/problem/solve",
    ]) {
      const response = await fetch(`${origin}${route}`, {
        headers: { "X-App-Secret": "legacy-test-secret" },
      });
      assert.equal(response.status, 401, `${route} must not trust a bundled secret`);
      assert.equal((await response.json()).code, "AUTH_REQUIRED");
    }

    const ai = await fetch(`${origin}/api/script/generate`, { method: "POST" });
    assert.equal(ai.status, 401);

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sub: "test-uid", iat: now, exp: now + 300, auth_time: now,
      aud: "gen-lang-client-0685740024",
      iss: "https://securetoken.google.com/gen-lang-client-0685740024",
    };
    const validToken = jwt.sign(claims, privateKey, { algorithm: "RS256", keyid: "test-key" });
    for (const headers of [
      { Authorization: `Bearer ${validToken}` },
      { Authorization: `Bearer ${validToken}`, "X-App-Secret": "legacy-test-secret" },
    ]) {
      const authenticated = await fetch(`${origin}/api/school/search?keyword=a`, { headers });
      assert.equal(authenticated.status, 200, "valid Firebase claims must pass authentication");
    }

    const missingAuthTime = jwt.sign({ ...claims, auth_time: undefined }, privateKey, {
      algorithm: "RS256", keyid: "test-key",
    });
    const invalid = await fetch(`${origin}/api/school/search?keyword=a`, {
      headers: { Authorization: `Bearer ${missingAuthTime}` },
    });
    assert.equal(invalid.status, 401, "invalid Firebase claims must be rejected");

    const webhook = await fetch(`${origin}/revenuecat/webhook`, { method: "POST" });
    assert.equal(webhook.status, 401);

    const serverFile = await fetch(`${origin}/server.cjs.map`);
    assert.equal(serverFile.headers.get("content-type")?.startsWith("text/html"), true);
    assert.equal((await serverFile.text()).includes("FIREBASE_SERVICE_ACCOUNT_KEY"), false);
  } finally {
    server.kill();
  }
});
