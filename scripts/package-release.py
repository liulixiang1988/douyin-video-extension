"""Build the browser-only release ZIP and its checksum using the standard library."""
from hashlib import sha256
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / 'extension'
manifest = json.loads((EXTENSION / 'manifest.json').read_text(encoding='utf-8'))
package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
if manifest['version'] != package['version']:
    raise SystemExit('Manifest and package versions differ')

DIST = ROOT / 'dist'
DIST.mkdir(exist_ok=True)
archive = DIST / f"douyin-video-extension-{manifest['version']}.zip"
files = [(p, p.relative_to(EXTENSION).as_posix()) for p in sorted(EXTENSION.rglob('*')) if p.is_file()]
files.append((ROOT / 'README.md', 'README.md'))

with ZipFile(archive, 'w', ZIP_DEFLATED, compresslevel=9) as output:
    for source, name in files:
        if source.is_symlink():
            raise SystemExit(f'Refusing symbolic link: {name}')
        info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        output.writestr(info, source.read_bytes())

with ZipFile(archive) as check:
    if check.testzip() is not None:
        raise SystemExit('Release ZIP failed CRC verification')
    if sorted(check.namelist()) != sorted(name for _, name in files):
        raise SystemExit('Unexpected release archive contents')
    for source, name in files:
        if check.read(name) != source.read_bytes():
            raise SystemExit(f'Archive differs from source: {name}')

digest = sha256(archive.read_bytes()).hexdigest()
checksums = DIST / 'SHA256SUMS.txt'
checksums.write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size,
                  'sha256': digest, 'checksums': str(checksums)}, ensure_ascii=True))
