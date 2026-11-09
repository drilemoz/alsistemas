import hashlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('up217', Path(__file__).parents[1] / 'admin' / 'updater.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)


class UpdateFileTests(unittest.TestCase):
    def test_local_zip_success_and_bad_sha256(self):
        for valid in (True, False):
            with self.subTest(valid=valid), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                data, backup, target = (root / x for x in ('data', 'backup', 'current'))
                for f in (data, backup, target): f.mkdir()
                (target / 'package.json').write_text(json.dumps({'version': '2.0.16'}))
                helper, unit, sudoers = (root / x for x in ('helper', 'unit', 'sudoers'))
                for f in (helper, unit, sudoers): f.write_text('old')
                zipped = backup / ('upload-' + 'b' * 24 + '.zip')
                with zipfile.ZipFile(zipped, 'w') as z:
                    for name, payload in {
                        'instalar.sh': 'set -e',
                        'vps/src/server.js': "const VERSION = '2.0.17'",
                        'vps/admin/helper.py': '# admin',
                        'vps/admin/updater.py': '# updater',
                        'vps/package.json': json.dumps({'version': '2.0.17'})
                    }.items(): z.writestr(name, payload)
                    z.writestr('payload.bin', 'x' * 700)
                sha = hashlib.sha256(zipped.read_bytes()).hexdigest()
                request = {'id': 'b' * 24, 'mode': 'file', 'archive': zipped.name,
                           'sha256': sha if valid else 'f' * 64}
                events = []
                def installer(_):
                    (target / 'package.json').write_text(json.dumps({'version': '2.0.17'}))
                with patch.multiple(u, DATA=data, BACKUP=backup, TARGET=target, HELPER=helper, UNIT=unit,
                                    SUDOERS=sudoers), patch.object(u, 'trusted_local_archive', lambda _: True), \
                     patch.object(u, 'status', lambda stage, msg, **kw: events.append(stage)), \
                     patch.object(u.os, 'geteuid', lambda: 0), patch.object(u, 'health', lambda: True), \
                     patch.object(u, 'wait_healthy', lambda _: True), patch.object(u, 'run_installer', installer):
                    if valid:
                        u.apply(request)
                        self.assertEqual(json.loads((target / 'package.json').read_text())['version'], '2.0.17')
                        self.assertIn('completed', events)
                        self.assertIn('backup', events)
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'SHA-256'): u.apply(request)
                        self.assertEqual(json.loads((target / 'package.json').read_text())['version'], '2.0.16')
                        self.assertNotIn('installing', events)

if __name__ == '__main__': unittest.main()
