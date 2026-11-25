import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'admin'))
import project_maintenance as p


class SchemaUpdateTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.base = Path(tmp.name)
        self.root = self.base / 'site'
        self.root.mkdir()
        self.backups = self.base / 'backups'
        self.archive = self.base / 'official.zip'
        for path, data in self.files('1.0.154', 37).items():
            dest = self.root / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        self.revision = 37
        self.maintenance = False
        self.calls = []

    @staticmethod
    def files(version, revision):
        return {'VERSION': version.encode(), 'app/updater.php': b'<?php // updater\n' + b'x'*900,
                'public/admin.php': b'<?php // admin', 'public/.user.ini': b'upload_max_filesize=8M',
                'app/schema_migrations.php': f'<?php const IGUA_SCHEMA_REVISION = {revision};'.encode()}

    def package(self, revision=38, tamper=False, bad_manifest=False):
        files = self.files('1.0.155', revision)
        manifest = {'format':'meu-site-update-v2','version':'1.0.155','min_php':'8.1.0',
                    'schema_revision': revision+int(bad_manifest),
                    'files':[{'path':k,'size':len(v),'sha256':hashlib.sha256(v).hexdigest()} for k,v in files.items()]}
        if tamper:
            files['public/admin.php'] = b'<?php // admin hacked'
        with zipfile.ZipFile(self.archive,'w') as z:
            z.writestr('release.json', json.dumps(manifest))
            for name, data in files.items():
                z.writestr(name,data)

    def job(self, root, name, output=None):
        self.calls.append(name)
        if name=='probe': return str(self.revision)
        if name=='maintenance-on': self.maintenance=True
        if name=='maintenance-off': self.maintenance=False
        if name=='dump': output.write(b'-- MariaDB dump\n-- Dump completed on 2026-11-25\n')
        if name=='migrate':
            self.revision=38
            return '38'

    def deploy(self):
        return p.deploy_archive(self.archive,root=self.root,backups=self.backups)

    def test_manifest_and_migration_dump_restore_guard(self):
        self.package()
        with patch.object(p,'php_job',side_effect=self.job):
            result=self.deploy()
            self.assertEqual(self.calls,['probe','maintenance-on','dump','migrate','probe','maintenance-off'])
            self.assertFalse(self.maintenance)
            self.assertEqual(result['schemaTo'],38)
            self.assertTrue(result['databaseBackup'])
            folder=self.backups/result['backup']
            meta=json.loads((folder/'metadata.json').read_text())
            self.assertEqual(meta['database']['sha256'],hashlib.sha256((folder/'database.sql').read_bytes()).hexdigest())
            self.assertEqual((folder/'database.sql').stat().st_mode & 0o777,0o600)
            with self.assertRaisesRegex(p.ProjectError,'schema atual'):
                p.restore_code(result['backup'],root=self.root,backups=self.backups)
            self.assertEqual((self.root/'VERSION').read_text(),'1.0.155')

    def test_tampered_and_mismatched_manifest(self):
        for kwargs in ({'tamper':True},{'bad_manifest':True}):
            self.package(**kwargs)
            with self.assertRaisesRegex(p.ProjectError,'Manifesto'):
                p.validate_archive(self.archive)

    def test_schema_jump_and_database_mismatch_before_install(self):
        self.package(39)
        with self.assertRaisesRegex(p.ProjectError,'salto'):
            self.deploy()
        self.package()
        self.revision=36
        with patch.object(p,'php_job',side_effect=self.job), self.assertRaisesRegex(p.ProjectError,'difere'):
            self.deploy()
        self.assertEqual((self.root/'VERSION').read_text(),'1.0.154')

    def test_failed_dump_no_code_change(self):
        self.package()
        def bad_dump(root, name, output=None):
            if name=='dump': output.write(b'partial dump'); return
            return self.job(root,name,output)
        with patch.object(p,'php_job',side_effect=bad_dump), self.assertRaisesRegex(p.ProjectError,'incompleto'):
            self.deploy()
        self.assertFalse(self.maintenance)
        self.assertEqual((self.root/'VERSION').read_text(),'1.0.154')
        self.assertFalse((self.backups/'schema-recovery.json').exists())

    def test_failed_migration_preserves_code_and_recovery(self):
        self.package()
        def broken(root,name,output=None):
            if name=='migrate': raise p.ProjectError('DDL failed')
            return self.job(root,name,output)
        with patch.object(p,'php_job',side_effect=broken), self.assertRaisesRegex(p.ProjectError,'Recuperação assistida'):
            self.deploy()
        self.assertTrue(self.maintenance)
        self.assertEqual((self.root/'VERSION').read_text(),'1.0.155')
        self.assertTrue((self.backups/'schema-recovery.json').is_file())
        with self.assertRaisesRegex(p.ProjectError,'Recuperação de schema pendente'):
            self.deploy()

    def test_legacy_zip_without_manifest_blocked_for_real_schema(self):
        with zipfile.ZipFile(self.archive,'w') as z:
            for name, data in self.files('1.0.155',38).items(): z.writestr(name,data)
        with self.assertRaisesRegex(p.ProjectError,'ZIP oficial'):
            self.deploy()

if __name__=='__main__': unittest.main()
