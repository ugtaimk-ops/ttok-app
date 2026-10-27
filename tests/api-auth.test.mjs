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
    const oversizedAnonymous = await fetch(`${origin}/api/practice/analyze`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoBase64: "A".repeat(2_000_000) }),
    });
    assert.equal(oversizedAnonymous.status, 401, "authenticate before parsing large media requests");

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sub: "test-uid", iat: now, exp: now + 300, auth_time: now,
      aud: "gen-lang-client-0685740024",
      iss: "https://securetoken.google.com/gen-lang-client-0685740024",
      email_verified: true,
      firebase: { sign_in_provider: "password" },
    };
    const validToken = jwt.sign(claims, privateKey, { algorithm: "RS256", keyid: "test-key" });
    for (const headers of [
      { Authorization: `Bearer ${validToken}` },
      { Authorization: `Bearer ${validToken}`, "X-App-Secret": "legacy-test-secret" },
    ]) {
      const authenticated = await fetch(`${origin}/api/school/search?keyword=a`, { headers });
      assert.equal(authenticated.status, 503, "valid Firebase claims pass auth, then fail closed without Firestore");
    }

    const unverifiedToken = jwt.sign({ ...claims, email_verified: false }, privateKey, { algorithm: "RS256", keyid: "test-key" });
    const unverified = await fetch(`${origin}/api/school/search?keyword=a`, {
      headers: { Authorization: `Bearer ${unverifiedToken}` },
    });
    assert.equal(unverified.status, 401, "unverified password accounts must not use private APIs");

    const rotatedToken = jwt.sign(claims, privateKey, { algorithm: "RS256", keyid: "rotated-key" });
    const rotated = await fetch(`${origin}/api/school/search?keyword=a`, {
      headers: { Authorization: `Bearer ${rotatedToken}` },
    });
    assert.equal(rotated.status, 503, "an unknown kid must refresh cached Google certs before rejecting login");

    const missingAuthTime = jwt.sign({ ...claims, auth_time: undefined }, privateKey, {
      algorithm: "RS256", keyid: "test-key",
    });
    const invalid = await fetch(`${origin}/api/school/search?keyword=a`, {
      headers: { Authorization: `Bearer ${missingAuthTime}` },
    });
    assert.equal(invalid.status, 401, "invalid Firebase claims must be rejected");

    const webhook = await fetch(`${origin}/revenuecat/webhook`, { method: "POST" });
    assert.equal(webhook.status, 401);
    const oversizedWebhook = await fetch(`${origin}/revenuecat/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "A".repeat(200_000) }),
    });
    assert.equal(oversizedWebhook.status, 401, "reject webhook calls before body parsing");

    const serverFile = await fetch(`${origin}/server.cjs.map`);
    assert.equal(serverFile.headers.get("content-type")?.startsWith("text/html"), true);
    assert.equal((await serverFile.text()).includes("FIREBASE_SERVICE_ACCOUNT_KEY"), false);
  } finally {
    server.kill();
  }
});
