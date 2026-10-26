const originalFetch = globalThis.fetch;
const certsUrl = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

globalThis.fetch = (input, options) => {
  if (String(input) === certsUrl) {
    return Promise.resolve(new Response(JSON.stringify({
      "test-key": Buffer.from(process.env.TTOK_TEST_CERT_BASE64, "base64").toString("utf8"),
    }), { headers: { "content-type": "application/json", "cache-control": "max-age=60" } }));
  }
  return originalFetch(input, options);
};
