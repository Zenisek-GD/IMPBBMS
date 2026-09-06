// Server-render initial screen states without a browser, database or API writes.
// This detects render crashes; it does not simulate effects, clicks or layout.
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readdir } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let failures = 0;
let checked = 0;
async function screens(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? screens(`${folder}/${entry.name}`) : entry.name.endsWith('.jsx') ? [`${folder}/${entry.name}`] : []))).flat();
}
try {
  const { AuthContext } = await server.ssrLoadModule('/src/context/auth-context.js');
  const { ThemeProvider } = await server.ssrLoadModule('/src/context/ThemeContext.jsx');
  const { ROLE_NAV } = await server.ssrLoadModule('/src/config/navigation.js');
  const user = { id: 0, name: 'QA fixture', role: 'systemAdministrator', roleName: 'System Administrator', permissions: [], mfaEnrollmentRequired: true };
  const auth = { user, setUser() {}, logout: async () => true, isLoading: false };
  for (const file of await screens('src/pages')) {
    if (file.endsWith('/MfaChallenge.jsx')) continue; // Requires a challenge from login.
    try {
      const { default: Screen } = await server.ssrLoadModule('/' + file);
      if (typeof Screen !== 'function') continue;
      renderToString(React.createElement(MemoryRouter, { initialEntries: ['/'] }, React.createElement(AuthContext.Provider, { value: auth }, React.createElement(ThemeProvider, null, React.createElement(Screen)))));
      checked++;
    } catch (error) {
      failures++;
      console.log(JSON.stringify({ file, renderFailed: true, errorType: error.name, message: String(error.message).slice(0, 150) }));
    }
  }
  console.log(JSON.stringify({ screensRendered: checked, configuredRoles: Object.keys(ROLE_NAV).length, failures, scope: 'initial render only; no effects or browser layout' }));
} finally { await server.close(); }
process.exitCode = failures ? 1 : 0;
