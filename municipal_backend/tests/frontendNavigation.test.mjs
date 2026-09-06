import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ROLE_NAV } from '../../municipal-frontend/src/config/navigation.js';
import { landingRouteForRole } from '../../municipal-frontend/src/config/roleLanding.js';
const requireFrontend = createRequire(new URL('../../municipal-frontend/package.json', import.meta.url));
const { parse } = requireFrontend('@babel/parser');
const source = await readFile(new URL('../../municipal-frontend/src/App.jsx', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const routes = new Map();
function walk(node, allowed = null) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'JSXElement' && node.openingElement.name.name === 'Route') {
    const attributes = node.openingElement.attributes;
    const element = attributes.find(attribute => attribute.name?.name === 'element')?.value?.expression;
    if (element?.openingElement?.name?.name === 'RoleRoute') {
      allowed = element.openingElement.attributes.find(attribute => attribute.name?.name === 'allow').value.expression.elements.map(item => item.value);
    }
    const routePath = attributes.find(attribute => attribute.name?.name === 'path')?.value?.value;
    if (routePath) routes.set(routePath, allowed);
    for (const child of node.children) walk(child, allowed);
    return;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, allowed));
    else if (value && typeof value === 'object') walk(value, allowed);
  }
}
walk(ast);
test('all configured role landing pages and sidebar links exist and accept their role', () => {
  const failures = [];
  for (const [role, nav] of Object.entries(ROLE_NAV)) {
    const paths = [landingRouteForRole(role), ...nav.sections.flatMap(section => section.items.map(item => item.href))];
    for (const routePath of new Set(paths)) {
      const path = routePath.split('?')[0];
      if (!routes.has(path)) failures.push(`${role}: missing ${path}`);
      else if (routes.get(path) && !routes.get(path).includes(role)) failures.push(`${role}: route denies ${path}`);
    }
  }
  assert.deepEqual(failures, []);
});
