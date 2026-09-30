import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ROLE_NAV, applyRecordPermissions } from '../../municipal-frontend/src/config/navigation.js';
import { canReadRecordPage } from '../../municipal-frontend/src/config/recordAccess.js';
import { ROLE_PERMISSIONS } from '../config/permissionMatrix.js';
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
      const props = element.openingElement.attributes;
      allowed = {
        roles: props.find(attribute => attribute.name?.name === 'allow')?.value?.expression?.elements?.map(item => item.value) ?? [],
        permission: props.find(attribute => attribute.name?.name === 'permission')?.value?.value,
      };
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
    const permissions = ROLE_PERMISSIONS[role] ?? [];
    const paths = [landingRouteForRole(role), ...applyRecordPermissions(nav.sections, permissions).flatMap(section => section.items.map(item => item.href))];
    for (const routePath of new Set(paths)) {
      const path = routePath.split('?')[0];
      if (!routes.has(path)) failures.push(`${role}: missing ${path}`);
      else if (routes.get(path)) {
        const guard = routes.get(path);
        const granted = canReadRecordPage(path, permissions) ?? (guard.roles.includes(role) || permissions.includes(guard.permission));
        if (!granted) failures.push(`${role}: route denies ${path}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('custom budget viewers can discover budget controls without gaining request or approval authority', () => {
  const sections = applyRecordPermissions([], ['budget.view']);
  assert.ok(sections.some(section => section.items.some(item => item.href === '/budget/controls')));
  assert.equal(routes.get('/budget/controls').permission, 'budget.view');
  assert.equal(canReadRecordPage('/budget/controls', ['budget.view']), true);
  assert.equal(canReadRecordPage('/budget/controls', []), false);
  assert.equal(applyRecordPermissions(sections, []).length, 0);
});
