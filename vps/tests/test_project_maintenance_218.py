import importlib.util
import io
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

MODULE = Path(__file__).resolve().parents[1] / 'admin' / 'project_maintenance.py'
spec = importlib.util.spec_from_file_location('project_maintenance', MODULE)
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class ProjectMaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name)
        self.root = self.parent / 'iguatamaonline'
        (self.root / 'public').mkdir(parents=True)
        (self.root / 'app').mkdir()
        self.files = {'VERSION': b'1.0.0\n', 'app/updater.php': b'<?php echo "old";',
                      'public/admin.php': b'<?php echo "old admin";'}
        for name, content in self.files.items():
            dest = self.root / name
            dest.write_bytes(content)
            dest.chmod(0o644)
        self.sibling = self.parent / 'iguatama-teste'
        self.sibling.mkdir()
        (self.sibling / 'VERSION').write_text('TESTE')
        self.zip = self.parent / 'update.zip'
        self.backups = self.parent / 'backups'

    def package(self, additions=None, wrapper=''):
        files = {'VERSION': b'1.0.1\n', 'app/updater.php': b'<?php echo "new"; /*' + b'x' * 1024 + b'*/',
                 'public/admin.php': b'<?php echo "new admin";'}
        files.update(additions or {})
        with zipfile.ZipFile(self.zip, 'w') as z:
            for name, data in files.items(): z.writestr(wrapper + name, data)

    def test_inspection_fixed_project_and_missing_files(self):
        report = p.inspect_project(root=self.root)
        self.assertEqual(report['version'], '1.0.0')
        self.assertEqual(len(report['files']), 3)
        self.assertIn('rootOwner', report)
        self.assertIn('parentOwner', report)
        self.assertIn('mutationAllowed', report)
        self.assertTrue(report['mutationAllowed'])
        with self.assertRaises(p.ProjectError): p.verify_project('iguatama-teste', self.root)
        (self.root / 'app/updater.php').unlink()
        report = p.inspect_project(root=self.root)
        self.assertFalse(report['files'][1]['safePath'])

    def test_inspection_reports_unsafe_php_owner_without_changing_permissions(self):
        with patch.object(p, 'php_account', return_value=('site-php', self.root.stat().st_uid, self.root.stat().st_gid)):
            report = p.inspect_project(root=self.root)
        self.assertFalse(report['mutationAllowed'])
        self.assertIn('controlado pelo usuário do PHP-FPM', report['mutationBlocker'])
        self.assertEqual((self.root / 'VERSION').read_bytes(), self.files['VERSION'])

    def test_accepts_safe_zip_deploy_and_restore_without_test_mutation(self):
        self.package()
        result = p.deploy_archive(self.zip, root=self.root, backups=self.backups)
        self.assertEqual(result['version'], '1.0.1')
        self.assertEqual((self.root / 'VERSION').read_text().strip(), '1.0.1')
        self.assertEqual((self.sibling / 'VERSION').read_text(), 'TESTE')
        backups = p.backup_list(backups=self.backups)
        self.assertEqual(len(backups), 1)
        restored = p.restore_code(result['backup'], root=self.root, backups=self.backups)
        self.assertEqual(restored['restored'], '1.0.0')
        for name, content in self.files.items():
            self.assertEqual((self.root / name).read_bytes(), content)

    def test_rejects_zip_traversal_symlinks_protected_dirs_duplicates_and_wrong_versions(self):
        for bad in ('../outside', '/etc/passwd', 'public/storage/secret.txt',
                    'app/../../elsewhere.php', 'public/.env', 'public/uploads/photo.jpg'):
            with self.subTest(bad=bad):
                self.package({bad: b'bad'})
                with self.assertRaises(p.ProjectError): p.validate_archive(self.zip)
        self.package({'index.php': b'hello'})
        self.assertEqual(p.validate_archive(self.zip)['files'], 4)
        self.package(wrapper='release/')
        self.assertEqual(p.validate_archive(self.zip)['version'], '1.0.1')
        self.package({'VERSION': b'1.0.0\n'})
        with self.assertRaises(p.ProjectError): p.deploy_archive(self.zip, root=self.root, backups=self.backups)
        self.package()
        with zipfile.ZipFile(self.zip, 'a') as z: z.writestr('VERSION', b'1.0.9')
        with self.assertRaises(p.ProjectError): p.validate_archive(self.zip)
        self.package()
        with zipfile.ZipFile(self.zip, 'a') as z:
            symlink = zipfile.ZipInfo('public/link.php')
            symlink.create_system = 3
            symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(symlink, 'index.php')
        with self.assertRaises(p.ProjectError): p.validate_archive(self.zip)

    def test_install_failure_rolls_back_changed_files(self):
        self.package()
        def interrupt(stage, message):
            if stage == 'verifying':
                raise RuntimeError('simulated failure')
        with self.assertRaises(RuntimeError):
            p.deploy_archive(self.zip, root=self.root, backups=self.backups, update_status=interrupt)
        for name, content in self.files.items():
            self.assertEqual((self.root / name).read_bytes(), content)
        self.assertEqual((self.sibling / 'VERSION').read_text(), 'TESTE')

    def test_no_symlinks_in_existing_code(self):
        (self.root / 'public/admin.php').unlink()
        (self.root / 'public/admin.php').symlink_to(self.sibling / 'VERSION')
        self.package()
        with self.assertRaises(p.ProjectError): p.deploy_archive(self.zip, root=self.root, backups=self.backups)
        self.assertEqual((self.sibling / 'VERSION').read_text(), 'TESTE')

    def test_manual_code_backup_can_restore_without_touching_database(self):
        (self.root / 'storage').mkdir()
        (self.root / 'storage' / 'database.sql').write_text('SECRET DATA')
        result = p.backup_code(root=self.root, backups=self.backups)
        self.assertEqual(result['files'], 3)
        self.assertEqual(result['version'], '1.0.0')
        self.assertFalse((self.backups / result['backup'] / 'storage').exists())
        (self.root / 'app/updater.php').write_text('<?php changed();')
        restored = p.restore_code(result['backup'], root=self.root, backups=self.backups)
        self.assertEqual(restored['restored'], '1.0.0')
        self.assertEqual((self.root / 'app/updater.php').read_bytes(), self.files['app/updater.php'])
        self.assertEqual((self.root / 'storage' / 'database.sql').read_text(), 'SECRET DATA')

    def test_undo_refuses_when_current_version_changes(self):
        self.package()
        result = p.deploy_archive(self.zip, root=self.root, backups=self.backups)
        (self.root / 'VERSION').write_text('1.0.5')
        with self.assertRaises(p.ProjectError): p.restore_code(result['backup'], root=self.root, backups=self.backups)


if __name__ == '__main__': unittest.main()
