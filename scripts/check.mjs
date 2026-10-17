import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'downloads']);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
const paths = [manifest.action.default_popup, manifest.background.service_worker, ...Object.values(manifest.icons)];
for (const file of paths) assert.ok(fs.existsSync(path.join(root, file)), `${file} missing`);
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.js'))) execFileSync(process.execPath, ['--check', path.join(root, file)]);
for (const [size, file] of Object.entries(manifest.icons)) {
  const png = fs.readFileSync(path.join(root, file));
  assert.equal(png.readUInt32BE(16), Number(size));
  assert.equal(png.readUInt32BE(20), Number(size));
}
console.log('PASS: Manifest V3, minimal permissions, referenced files, PNG dimensions, JavaScript syntax');
