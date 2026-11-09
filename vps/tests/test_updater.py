import importlib.util
import io
import json
import tempfile
import zipfile
import subprocess
import stat
from types import SimpleNamespace
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('al_updater', Path(__file__).parents[1] / 'admin' / 'updater.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)


class UpdaterTests(unittest.TestCase):
    def test_public_key_requires_regular_root_owned_private_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'test.pem'
            path.write_text('test')
            path.chmod(0o644)
            def with_properties(*, mode=0o100644, uid=0, links=1, size=4):
                return SimpleNamespace(st_mode=mode, st_uid=uid,
                                       st_nlink=links, st_size=size)
            with patch.object(u.Path, 'lstat', return_value=with_properties()):
                self.assertTrue(u.trusted_public_key(path))
            for info in [
                with_properties(uid=1000),
                with_properties(mode=0o100666),
                with_properties(mode=stat.S_IFLNK | 0o777),
                with_properties(mode=stat.S_IFDIR | 0o755),
                with_properties(links=2),
                with_properties(size=0),
                with_properties(size=9000),
            ]:
                with self.subTest(info=info), patch.object(u.Path, 'lstat', return_value=info):
                    self.assertFalse(u.trusted_public_key(path))
            with self.assertRaisesRegex(RuntimeError, 'Chave pública'):
                with patch.object(u, 'KEY', path), patch.object(u.Path, 'lstat', return_value=with_properties(uid=1000)):
                    u.verify_signature(b'in', b'sig', Path(tmp))

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

    def test_ed25519_signing_real_positive_and_tampered(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            priv, pub = directory / 'private.pem', directory / 'public.pem'
            subprocess.run(['openssl', 'genpkey', '-algorithm', 'ED25519', '-out', str(priv)], check=True, capture_output=True)
            subprocess.run(['openssl', 'pkey', '-in', str(priv), '-pubout', '-out', str(pub)], check=True, capture_output=True)
            data = b'{"schema":1,"version":"2.0.5","asset":"archive.zip","sha256":"abcd"}\n'
            mf, sg = directory / 'in.json', directory / 'in.sig'
            mf.write_bytes(data)
            subprocess.run(['openssl', 'pkeyutl', '-sign', '-inkey', str(priv), '-rawin', '-in', str(mf), '-out', str(sg)], check=True, capture_output=True)
            with patch.object(u, 'KEY', pub), patch.object(u, 'trusted_public_key', return_value=True):
                u.verify_signature(data, sg.read_bytes(), directory)
                with self.assertRaises(RuntimeError): u.verify_signature(data + b'!', sg.read_bytes(), directory)

    def test_signed_release_apply_and_rollback_simulated(self):
        import hashlib
        import os
        import shutil
        for force_failure in (False, True):
            with self.subTest(rollback=force_failure), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                data_dir, backups, current = (root / n for n in ('data', 'backups', 'current'))
                for folder in (data_dir, backups, current): folder.mkdir()
                (data_dir / 'updates-config.json').write_text(json.dumps({'repo': 'owner/repo'}))
                (current / 'package.json').write_text(json.dumps({'version': '2.0.4'}))
                helper, unit, sudoers = (root / name for name in ('helper', 'unit', 'sudoers'))
                for f in (helper, unit, sudoers): f.write_text('original')
                private, public = root / 'private.pem', root / 'public.pem'
                subprocess.run(['openssl', 'genpkey', '-algorithm', 'ED25519', '-out', str(private)], check=True, capture_output=True)
                subprocess.run(['openssl', 'pkey', '-in', str(private), '-pubout', '-out', str(public)], check=True, capture_output=True)
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
                mf, sig = root / 'manifest', root / 'signature'
                mf.write_bytes(manifest)
                subprocess.run(['openssl', 'pkeyutl', '-sign', '-inkey', str(private), '-rawin', '-in', str(mf), '-out', str(sig)], check=True, capture_output=True)
                asset = 'AL-Sistemas-v2.0.5-VPS.zip'
                urls = {n: f'https://github.com/owner/repo/releases/download/v2.0.5/{n}' for n in (asset, 'update-manifest.json', 'update-manifest.json.sig')}
                def fake_fetch(url, repo, limit, asset=None):
                    if url.startswith('https://api.github.com/'):
                        return json.dumps({'tag_name': 'v2.0.5', 'assets': [{'name': k, 'browser_download_url': v} for k,v in urls.items()]}).encode()
                    return {urls['update-manifest.json']: manifest, urls['update-manifest.json.sig']: sig.read_bytes(), urls['AL-Sistemas-v2.0.5-VPS.zip']: zipped}[url]
                events = []
                def fake_installer(unpack):
                    (current / 'package.json').write_text(json.dumps({'version': '2.0.5'}))
                    helper.write_text('modified')
                    if force_failure: raise RuntimeError('simulated failure')
                real_run = subprocess.run
                with patch.multiple(u, DATA=data_dir, BACKUP=backups, TARGET=current, KEY=public, HELPER=helper, UNIT=unit, SUDOERS=sudoers), \
                     patch.object(u, 'fetch', fake_fetch), patch.object(u, 'status', lambda name, message, **kwargs: events.append(name)), \
                     patch.object(u, 'run_installer', fake_installer), patch.object(u, 'health', lambda: True), patch.object(u, 'trusted_public_key', return_value=True), patch.object(u.os, 'geteuid', lambda: 0), \
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
                    else:
                        u.apply()
                        self.assertEqual(json.loads((current / 'package.json').read_text())['version'], '2.0.5')
                        self.assertIn('completed', events)


if __name__ == '__main__': unittest.main()
