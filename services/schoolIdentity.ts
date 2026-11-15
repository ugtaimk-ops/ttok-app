// Read-only local school lookup can verify the current Firebase account without
// copying production Admin credentials to a development laptop. This API key is
// the public web application identifier, never a service-account/private key.
export async function verifySchoolAccount(idToken: string, expectedUid: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const key = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyDh9mrhvYSDgrN7WUzMW_WSO670z5OTjWE';
  const res = await fetcher('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({idToken}), signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return false;
  const body = await res.json();
  return Array.isArray(body.users) && body.users.some((u: any) => u.localId === expectedUid && u.disabled !== true);
}
