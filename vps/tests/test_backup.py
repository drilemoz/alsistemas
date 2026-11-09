import hashlib
import importlib.util
import io
import json
import os
import subprocess
import tarfile
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('helper203', Path(__file__).resolve().parents[1] / 'admin/helper.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class BackupTests(unittest.TestCase):
    def setup_temp(self, temp):
        root = Path(temp) / 'projects'; root.mkdir()
        backup = Path(temp) / 'backups'; backup.mkdir(mode=0o700)
        project = root / 'site-novo'; project.mkdir()
        public = project / 'public'; public.mkdir()
        (public / 'index.html').write_text('AL Sistemas backup de teste', encoding='utf-8')
        (project / '.alsistemas.json').write_text(json.dumps({'managedBy': 'AL Sistemas', 'type': 'static'}), encoding='utf-8')
        return root, backup, project, public

    def test_gpg_backup_decrypt_manifest_and_sha256(self):
        with TemporaryDirectory() as temp:
            root, backup, _, public = self.setup_temp(temp)
            result = helper.backup_project({'action': 'backup_project', 'name': 'site-novo', 'passphrase': 'Frase-secreta-12345678'}, root, backup)
            meta = result['backup']
            encrypted = backup / meta['archive']
            self.assertTrue(encrypted.is_file())
            self.assertFalse(encrypted.read_bytes().startswith(b'ustar'))
            self.assertEqual(hashlib.sha256(encrypted.read_bytes()).hexdigest(), meta['sha256'])
            self.assertEqual(meta['files'], 1)
            self.assertEqual(meta['scope'], 'public-only')
            listing = helper.list_backups({'action': 'list_backups'}, backup)['backups']
            self.assertEqual(listing[0]['archive'], meta['archive'])
            decrypt = subprocess.run(['gpg', '--homedir', str(backup / '.gnupg'), '--batch',
                '--pinentry-mode', 'loopback', '--passphrase', 'Frase-secreta-12345678',
                '--decrypt', str(encrypted)], capture_output=True, check=True)
            with tarfile.open(fileobj=io.BytesIO(decrypt.stdout)) as archive:
                self.assertIn('public/index.html', archive.getnames())
                manifest = json.load(archive.extractfile('alsistemas-manifest.json'))
                self.assertEqual(manifest['project'], 'site-novo')
                self.assertEqual(manifest['scope'], 'public-only')
                self.assertEqual(manifest['entries'][0]['sha256'], hashlib.sha256((public / 'index.html').read_bytes()).hexdigest())
                self.assertNotIn('alsistemas-admin.json', archive.getnames())

    def test_rejects_outsiders_and_unsafe_passphrase(self):
        with TemporaryDirectory() as temp:
            root, backup, project, _ = self.setup_temp(temp)
            (project / '.alsistemas.json').unlink()
            with self.assertRaises(helper.TaskError):
                helper.backup_project({'action': 'backup_project', 'name': 'site-novo', 'passphrase': 'Frase-secreta-12345678'}, root, backup)
            self.assertEqual(list(backup.glob('*.tar.gpg')), [])
            (project / '.alsistemas.json').write_text(json.dumps({'managedBy': 'AL Sistemas', 'type': 'static'}))
            for passphrase in ['curta', 'abc\ndefghijklmno123', 'A' * 129]:
                with self.subTest(passphrase=passphrase), self.assertRaises(helper.TaskError):
                    helper.backup_project({'action': 'backup_project', 'name': 'site-novo', 'passphrase': passphrase}, root, backup)

    def test_refuses_symlinks_no_external_data_is_read(self):
        with TemporaryDirectory() as temp:
            root, backup, _, public = self.setup_temp(temp)
            outside = Path(temp) / 'private.txt'
            outside.write_text('INFORMACAO-PRIVADA')
            (public / 'exfiltrate').symlink_to(outside)
            with self.assertRaises(helper.TaskError):
                helper.backup_project({'action': 'backup_project', 'name': 'site-novo', 'passphrase': 'Frase-secreta-12345678'}, root, backup)
            self.assertEqual(list(backup.glob('*.tar.gpg')), [])
            self.assertEqual(list(backup.glob('*.part')), [])

    def test_rejects_insecure_backup_location_and_extra_task_parameters(self):
        with TemporaryDirectory() as temp:
            root, backup, _, _ = self.setup_temp(temp)
            backup.chmod(0o755)
            with self.assertRaises(helper.TaskError):
                helper.backup_project({'action': 'backup_project', 'name': 'site-novo', 'passphrase': 'Frase-secreta-12345678'}, root, backup)
            backup.chmod(0o700)
            for payload in [
                {'action': 'backup_project', 'name': 'site-novo', 'passphrase': 'Frase-secreta-12345678', 'shell': 'id'},
                {'action': 'validate_nginx', 'command': 'cat /etc/shadow'},
                {'action': 'list_backups', 'path': '/etc'},
            ]:
                with self.subTest(payload=payload), self.assertRaises(helper.TaskError):
                    if payload['action'] == 'backup_project':
                        helper.backup_project(payload, root, backup)
                    elif payload['action'] == 'validate_nginx':
                        helper.validate_nginx(payload)
                    else:
                        helper.list_backups(payload, backup)

    def test_limit_snapshots_without_auto_deletion(self):
        with TemporaryDirectory() as temp:
            root, backup, _, _ = self.setup_temp(temp)
            for i in range(5):
                (backup / f'site-novo-20260101T01010{i}Z-abcdef00.tar.gpg.json').write_text('{}')
            with self.assertRaises(helper.TaskError):
                helper.backup_project({'action': 'backup_project', 'name': 'site-novo', 'passphrase': 'Frase-secreta-12345678'}, root, backup)
            self.assertEqual(len(list(backup.glob('*.json'))), 5)

    def test_nginx_validation_whitelist_reports_only_result(self):
        received = []
        def fake(cmd, **kwargs):
            received.append(cmd)
            return SimpleNamespace(returncode=1, stderr='sensitive config path')
        result = helper.validate_nginx({'action': 'validate_nginx'}, fake)
        self.assertFalse(result['valid'])
        self.assertEqual(received, [['/usr/bin/systemctl', 'start', 'alsistemas-nginx-check.service']])
        self.assertNotIn('sensitive', json.dumps(result))
        self.assertTrue(helper.validate_nginx({'action': 'validate_nginx'}, lambda *a, **kw: SimpleNamespace(returncode=0))['valid'])

if __name__ == '__main__':
    unittest.main()
