// Read-only deployment metadata. Never print API tokens, bindings, secret
// values, origin connection details, or unfiltered API errors.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
const cache = JSON.parse(await readFile('.wrangler/cache/wrangler-account.json', 'utf8'));
const account = typeof cache.account === 'string' ? cache.account : cache.account.id;
let token = process.env.CLOUDFLARE_API_TOKEN;
for (const base of [path.join(homedir(), '.wrangler'), path.join(process.env.APPDATA ?? '', 'xdg.config', '.wrangler')]) {
  if (token) break;
  try {
    const auth = await readFile(path.join(base, 'config', 'default.toml'), 'utf8');
    token = auth.match(/(?:oauth_token|api_token)\s*=\s*"([^"]+)"/)?.[1];
  } catch { /* Try the next standard Wrangler location. */ }
}
if (!token || !account) throw new Error('Wrangler authentication metadata unavailable.');
async function get(endpoint, summarize) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  console.log(JSON.stringify({ endpoint: endpoint.replace(/[a-f0-9]{32}/g, '[id]'), status: response.status, success: body.success, ...(body.success ? summarize(body.result) : {}) }));
}
await get('workers/scripts/procurenance/settings', result => ({ usageModel: result.usage_model, limits: result.limits, compatibilityDate: result.compatibility_date, bindings: result.bindings?.map(binding => ({ name: binding.name, type: binding.type })) }));
await get('workers/account-settings', result => ({ defaultUsageModel: result.default_usage_model }));
await get('subscriptions', result => ({ subscriptions: result.map(item => ({ type: item.rate_plan?.id, name: item.rate_plan?.public_name })) }));
await get('hyperdrive/configs/877823dff29b44edb4f9f85b48f52672', result => ({ caching: result.caching }));
