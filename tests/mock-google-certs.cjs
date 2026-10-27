const originalFetch = globalThis.fetch;
const certsUrl = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certFetches = 0;

globalThis.fetch = (input, options) => {
  if (String(input) === certsUrl) {
    const cert = Buffer.from(process.env.TTOK_TEST_CERT_BASE64, "base64").toString("utf8");
    const keys = { "test-key": cert };
    if (++certFetches >= 2) keys["rotated-key"] = cert;
    return Promise.resolve(new Response(JSON.stringify(keys),
      { headers: { "content-type": "application/json", "cache-control": "max-age=60" } }));
  }
  return originalFetch(input, options);
};
