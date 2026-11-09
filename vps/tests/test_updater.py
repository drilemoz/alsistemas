import importlib.util
import io
import json
import tempfile
import zipfile
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('al_updater', Path(__file__).parents[1] / 'admin' / 'updater.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)


class UpdaterTests(unittest.TestCase):
    def test_versions_urls(self):
        self.assertEqual(u.version_tuple('2.0.5'), (2, 0, 5))
        for name in ['../../etc/passwd', '2.0.5-beta', 'v2.0.5']:
            with self.assertRaises(RuntimeError): u.version_tuple(name)
        self.assertTrue(u.safe_url('https://api.github.com/repos/user/repo/releases/latest', 'user/repo'))
        self.assertFalse(u.safe_url('http://api.github.com/repos/user/repo/releases/latest', 'user/repo'))
        self.assertFalse(u.safe_url('https://127.0.0.1/private', 'user/repo'))
        self.assertFalse(u.safe_url('https://github.com/other/repo/releases/download/v2.0.5/AL-Sistemas-v2.0.5-VPS.zip', 'user/repo', 'AL-Sistemas-v2.0.5-VPS.zip'))
        self.assertTrue(u.safe_url('https://release-assets.githubusercontent.com/some/path?auth=temporary', 'user/repo', 'AL-Sistemas-v2.0.5-VPS.zip'))

    def test_zip_refuses_traversal_and_symlink(self):
        for filename, mode in [('../outside', 0o100644), ('folder/symlink', 0o120777)]:
            mem = io.BytesIO()
            with zipfile.ZipFile(mem, 'w') as z:
                i = zipfile.ZipInfo(filename)
                i.create_system = 3
                i.external_attr = mode << 16
                z.writestr(i, 'contents')
            mem.seek(0)
            with zipfile.ZipFile(mem) as z:
                with self.assertRaises(RuntimeError): u.archive_validate(z)

    def test_sha256_release_apply_and_rollback_simulated(self):
        import hashlib
        import os
        import shutil
        for force_failure in (False, True):
            with self.subTest(rollback=force_failure), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                data_dir, backups, current = (root / n for n in ('data', 'backups', 'current'))
                for folder in (data_dir, backups, current): folder.mkdir()
                (data_dir / 'updates-config.json').write_text(json.dumps({'repo': 'owner/repo'}))
                (data_dir / 'admin.json').write_text('{"passwordHash":"test"}')
                (current / 'package.json').write_text(json.dumps({'version': '2.0.4'}))
                helper, unit, sudoers = (root / name for name in ('helper', 'unit', 'sudoers'))
                for f in (helper, unit, sudoers): f.write_text('original')
                mem = io.BytesIO()
                with zipfile.ZipFile(mem, 'w') as z:
                    for name, content in {
                        'instalar.sh': '#!/usr/bin/env bash\n',
                        'vps/src/server.js': 'const VERSION = "2.0.5";',
                        'vps/admin/helper.py': '# test helper',
                        'vps/package.json': json.dumps({'version': '2.0.5'})
                    }.items(): z.writestr(name, content)
                zipped = mem.getvalue()
                manifest = json.dumps({'schema': 1, 'version': '2.0.5', 'asset': 'AL-Sistemas-v2.0.5-VPS.zip', 'sha256': hashlib.sha256(zipped).hexdigest()}, separators=(',', ':')).encode()
                asset = 'AL-Sistemas-v2.0.5-VPS.zip'
                urls = {n: f'https://github.com/owner/repo/releases/download/v2.0.5/{n}' for n in (asset, 'update-manifest.json')}
                def fake_fetch(url, repo, limit, asset=None):
                    if url.startswith('https://api.github.com/'):
                        return json.dumps({'tag_name': 'v2.0.5', 'assets': [{'name': k, 'browser_download_url': v} for k,v in urls.items()]}).encode()
                    return {urls['update-manifest.json']: manifest, urls['AL-Sistemas-v2.0.5-VPS.zip']: zipped}[url]
                events = []
                def fake_installer(unpack):
                    (current / 'package.json').write_text(json.dumps({'version': '2.0.5'}))
                    helper.write_text('modified')
                    if force_failure: raise RuntimeError('simulated failure')
                real_run = subprocess.run
                with patch.multiple(u, DATA=data_dir, BACKUP=backups, TARGET=current, HELPER=helper, UNIT=unit, SUDOERS=sudoers), \
                     patch.object(u, 'fetch', fake_fetch), patch.object(u, 'status', lambda name, message, **kwargs: events.append(name)), \
                     patch.object(u, 'run_installer', fake_installer), patch.object(u, 'health', lambda: True), patch.object(u.os, 'geteuid', lambda: 0), \
                     patch.object(u.subprocess, 'run', wraps=subprocess.run) as mocked_run:
                    # Evita iniciar ou reiniciar serviços reais no teste de rollback.
                    actual_run = real_run
                    def safe_run(args, *a, **kw):
                        if args[0] == '/usr/bin/systemctl': return subprocess.CompletedProcess(args, 0)
                        return actual_run(args, *a, **kw)
                    mocked_run.side_effect = safe_run
                    if force_failure:
                        with self.assertRaisesRegex(RuntimeError, 'revertida'): u.apply()
                        self.assertEqual(json.loads((current / 'package.json').read_text())['version'], '2.0.4')
                        self.assertEqual(helper.read_text(), 'original')
                        self.assertIn('rolling_back', events)
                        self.assertTrue(any((x / 'data' / 'admin.json').exists() for x in backups.iterdir() if x.is_dir()))
                    else:
                        u.apply()
                        self.assertEqual(json.loads((current / 'package.json').read_text())['version'], '2.0.5')
                        self.assertIn('completed', events)
                        self.assertTrue(any((x / 'data' / 'admin.json').exists() for x in backups.iterdir() if x.is_dir()))

    def test_rejects_tampered_zip_before_install(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data, backup, current = (root / n for n in ('data', 'backup', 'current'))
            for p in (data, backup, current): p.mkdir()
            (data / 'updates-config.json').write_text(json.dumps({'repo': 'owner/repo'}))
            (current / 'package.json').write_text(json.dumps({'version': '2.0.5'}))
            names = ['AL-Sistemas-v2.0.12-VPS.zip', 'update-manifest.json']
            urls = {name: f'https://github.com/owner/repo/releases/download/v2.0.12/{name}' for name in names}
            manifest = json.dumps({'schema': 1, 'version': '2.0.12', 'asset': names[0], 'sha256': hashlib.sha256(b'original').hexdigest()}).encode()
            called = []
            def fake_fetch(url, repo, limit, asset=None):
                if url.startswith('https://api.github.com/'):
                    return json.dumps({'tag_name': 'v2.0.12', 'assets': [{'name': name, 'browser_download_url': urls[name]} for name in names]}).encode()
                return manifest if url == urls[names[1]] else b'tampered'
            with patch.multiple(u, DATA=data, BACKUP=backup, TARGET=current), \
                 patch.object(u, 'fetch', fake_fetch), patch.object(u, 'status', lambda *a, **k: None), \
                 patch.object(u, 'run_installer', lambda *a: called.append(a)), \
                 patch.object(u.os, 'geteuid', lambda: 0):
                with self.assertRaisesRegex(RuntimeError, 'SHA-256'):
                    u.apply()
            self.assertEqual(called, [])
            self.assertEqual(json.loads((current / 'package.json').read_text())['version'], '2.0.5')

    def test_rejects_manifest_from_other_version(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data, backup, current = (root / n for n in ('data', 'backup', 'current'))
            for p in (data, backup, current): p.mkdir()
            (data / 'updates-config.json').write_text(json.dumps({'repo': 'owner/repo'}))
            (current / 'package.json').write_text(json.dumps({'version': '2.0.5'}))
            names = ['AL-Sistemas-v2.0.12-VPS.zip', 'update-manifest.json']
            urls = {name: f'https://github.com/owner/repo/releases/download/v2.0.12/{name}' for name in names}
            manifest = json.dumps({'schema': 1, 'version': '9.9.9', 'asset': names[0], 'sha256': hashlib.sha256(b'bad').hexdigest()}).encode()
            def fake_fetch(url, repo, limit, asset=None):
                if url.startswith('https://api.github.com/'):
                    return json.dumps({'tag_name': 'v2.0.12', 'assets': [{'name': name, 'browser_download_url': urls[name]} for name in names]}).encode()
                if url == urls[names[1]]: return manifest
                raise AssertionError('ZIP must not download after version mismatch')
            with patch.multiple(u, DATA=data, BACKUP=backup, TARGET=current), \
                 patch.object(u, 'fetch', fake_fetch), patch.object(u, 'status', lambda *a, **k: None), \
                 patch.object(u.os, 'geteuid', lambda: 0):
                with self.assertRaisesRegex(RuntimeError, 'Manifesto SHA-256'):
                    u.apply()


if __name__ == '__main__': unittest.main()

