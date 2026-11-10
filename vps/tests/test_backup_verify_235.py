import importlib.util
import hashlib
import json
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).parents[1] / 'admin' / 'helper.py'
spec = importlib.util.spec_from_file_location('helper235', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class BackupVerificationTests(unittest.TestCase):
    def setup_backup(self, temp):
        backup = Path(temp) / 'backups'
        backup.mkdir(mode=0o700)
        name = 'meusite'
        filename = 'meusite-20261110T111111Z-abcdef12.tar.gpg'
        archive = backup / filename
        archive.write_bytes(b'encrypted backup example fixture')
        archive.chmod(0o600)
        meta = {'name': name, 'archive': filename, 'encrypted': True,
                'scope': 'public-only', 'bytes': archive.stat().st_size,
                'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
        (backup / (filename + '.json')).write_text(json.dumps(meta))
        (backup / (filename + '.json')).chmod(0o600)
        return backup, archive, meta

    def test_checksum_matches_and_is_read_only(self):
        with TemporaryDirectory() as temp:
            backup, archive, meta = self.setup_backup(temp)
            task = {'action': 'verify_backup', 'name': 'meusite', 'archive': meta['archive']}
            result = mod.verify_backup(task, backup)
            self.assertTrue(result['ok'])
            self.assertEqual(result['integrity'], 'verified')
            self.assertEqual(result['bytes'], archive.stat().st_size)
            self.assertEqual(archive.read_bytes(), b'encrypted backup example fixture')

    def test_per_project_inventory_filters_out_other_projects(self):
        with TemporaryDirectory() as temp:
            backup, archive, meta = self.setup_backup(temp)
            other = backup / 'outrasite-20261110T111111Z-abcdef12.tar.gpg'
            other.write_bytes(b'other')
            other.chmod(0o600)
            other_meta = {'name': 'outrasite', 'archive': other.name, 'encrypted': True,
                          'scope': 'public-only', 'bytes': other.stat().st_size,
                          'sha256': hashlib.sha256(other.read_bytes()).hexdigest()}
            (backup / (other.name + '.json')).write_text(json.dumps(other_meta))
            (backup / (other.name + '.json')).chmod(0o600)
            items = mod.list_backups({'action': 'list_backups', 'name': 'meusite'}, backup)['backups']
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]['name'], 'meusite')
            with self.assertRaises(mod.TaskError):
                mod.list_backups({'action': 'list_backups', 'name': '../../outrasite'}, backup)

    def test_detects_tampering_and_does_not_delete_original(self):
        with TemporaryDirectory() as temp:
            backup, archive, meta = self.setup_backup(temp)
            archive.write_bytes(b'corrupted backup example fixture')
            result = mod.verify_backup({'action': 'verify_backup', 'name': 'meusite', 'archive': meta['archive']}, backup)
            self.assertFalse(result['ok'])
            self.assertEqual(result['integrity'], 'mismatch')
            self.assertTrue(archive.exists())

    def test_rejects_cross_project_traversal_and_insecure_objects(self):
        with TemporaryDirectory() as temp:
            backup, archive, meta = self.setup_backup(temp)
            for task in (
                {'action': 'verify_backup', 'name': 'outrosite', 'archive': meta['archive']},
                {'action': 'verify_backup', 'name': 'meusite', 'archive': '../' + meta['archive']},
                {'action': 'verify_backup', 'name': 'meusite', 'archive': meta['archive'], 'file': '/etc/shadow'},
            ):
                with self.subTest(task=task), self.assertRaises(mod.TaskError):
                    mod.verify_backup(task, backup)
            archive.unlink()
            archive.symlink_to(Path(temp) / 'other')
            with self.assertRaises(OSError):
                mod.verify_backup({'action': 'verify_backup', 'name': 'meusite', 'archive': meta['archive']}, backup)

    def test_rejects_insecure_manifest_and_size_mismatch(self):
        with TemporaryDirectory() as temp:
            backup, archive, meta = self.setup_backup(temp)
            metadata = backup / (meta['archive'] + '.json')
            metadata.chmod(0o644)
            with self.assertRaises(mod.TaskError):
                mod.verify_backup({'action': 'verify_backup', 'name': 'meusite', 'archive': meta['archive']}, backup)
            metadata.chmod(0o600)
            archive.write_bytes(archive.read_bytes() + b'change size')
            with self.assertRaises(mod.TaskError):
                mod.verify_backup({'action': 'verify_backup', 'name': 'meusite', 'archive': meta['archive']}, backup)

if __name__ == '__main__':
    unittest.main()
