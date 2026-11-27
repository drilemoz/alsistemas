import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
import test_project_schema_253 as fixtures
import project_maintenance as p


class CumulativeSchemaTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.SchemaUpdateTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.f = self.fixture

    def package(self, policy=None, *, revision=41, verifier=True):
        self.f.package(revision)
        with zipfile.ZipFile(self.f.archive) as z:
            files = {n:z.read(n) for n in z.namelist()}
        manifest = json.loads(files.pop('release.json'))
        if policy is not None:
            manifest['schema_migration'] = policy
        if verifier:
            key = 'app/schema_migrations.php'
            files[key] += b' function igua_verify_schema($db): bool { return true; }'
            for d in manifest['files']:
                if d['path'] == key:
                    d.update(size=len(files[key]),sha256=hashlib.sha256(files[key]).hexdigest())
        with zipfile.ZipFile(self.f.archive,'w') as z:
            z.writestr('release.json',json.dumps(manifest))
            for k,v in files.items(): z.writestr(k,v)

    def job(self, root, name, output=None):
        if name == 'migrate-verified':
            self.f.calls.append(name)
            self.f.revision = 41
            return '41'
        return self.f.job(root,name,output)

    def test_cumulative_jump_uses_backup_and_verification(self):
        self.package({'mode':'cumulative','min_from':37})
        with patch.object(p,'php_job',side_effect=self.job):
            result = self.f.deploy()
        self.assertEqual(self.f.calls,['probe','maintenance-on','dump','migrate-verified','probe','maintenance-off'])
        self.assertEqual((result['schemaFrom'],result['schemaTo']),(37,41))
        self.assertTrue(result['databaseBackup'])
        self.assertEqual(result['migrationPolicy']['min_from'],37)
        self.assertFalse(self.f.maintenance)

    def test_rejects_invalid_policy(self):
        for policy in ({'mode':'cumulative','min_from':True},{'mode':'unknown','min_from':37},{'mode':'cumulative','min_from':42},[],{'mode':'cumulative','min_from':0}):
            with self.subTest(policy=policy):
                self.package(policy)
                with self.assertRaisesRegex(p.ProjectError,'Manifesto'):
                    p.validate_archive(self.f.archive)

    def test_rejects_unsupported_source_downgrade_and_missing_verifier(self):
        for policy,rev,verifier,msg in [({'mode':'cumulative','min_from':38},41,True,'schema inicial'),({'mode':'cumulative','min_from':35},36,True,'Downgrade'),({'mode':'cumulative','min_from':37},41,False,'igua_verify_schema')]:
            with self.subTest(msg=msg):
                self.package(policy,revision=rev,verifier=verifier)
                with patch.object(p,'php_job') as job, self.assertRaisesRegex(p.ProjectError,msg):
                    self.f.deploy()
                job.assert_not_called()
                self.assertFalse(self.f.backups.exists())

    def test_verification_failure_keeps_backup_and_recovery(self):
        self.package({'mode':'cumulative','min_from':37})
        def fail(root,name,output=None):
            if name=='migrate-verified': raise p.ProjectError('verificação estrutural falhou')
            return self.job(root,name,output)
        with patch.object(p,'php_job',side_effect=fail), self.assertRaisesRegex(p.ProjectError,'Recuperação assistida'):
            self.f.deploy()
        self.assertTrue(self.f.maintenance)
        self.assertTrue((self.f.backups/'schema-recovery.json').is_file())
        self.assertEqual(len(list(self.f.backups.glob('code-*/database.sql'))),1)

    @unittest.skipUnless(shutil.which('php'),'PHP CLI indisponível')
    def test_php_contract_execution(self):
        # PHP real, banco simulado: testa o protocolo, não DDL MariaDB.
        root = self.f.root
        app = root/'app'
        (app/'bootstrap.php').write_text('<?php function db(){return new stdClass();}')
        for name in ('ads.php','news_editor.php','schema.php','article_workflow.php','analytics.php'):
            (app/name).write_text('<?php')
        base = '<?php const IGUA_SCHEMA_REVISION=41; function igua_schema_revision($db){return $db->rev ?? 37;} function igua_migrate_schema($db){$db->rev=41;}'
        for hook, expected in [('',7),('function igua_verify_schema($db){return false;}',8),('function igua_verify_schema($db){return $db->rev===41;}',0)]:
            (app/'schema_migrations.php').write_text(base+hook)
            run = subprocess.run(['php','--',str(root),'migrate-verified'],input=p.PHP_JOB.encode(),capture_output=True,timeout=10)
            self.assertEqual(run.returncode,expected,run.stderr)
            if not expected: self.assertEqual(run.stdout,b'41')
