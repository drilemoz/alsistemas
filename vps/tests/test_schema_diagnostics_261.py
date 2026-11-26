import sys
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'admin'))
import project_maintenance as p

class SchemaDiagnosticsTests(unittest.TestCase):
    def test_schema_match_and_mismatch_are_read_only(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'site'
            backups = Path(folder) / 'absent'
            for actual in ('38', '39'):
                with patch.object(p,'verify_project'), patch.object(p,'guard_mutation_ownership'), patch.object(p,'installed_schema',return_value=38), patch.object(p,'php_job',return_value=actual) as job:
                    result = p.schema_diagnostics(root, backups)
                    job.assert_called_once_with(root,'probe',timeout=8)
                self.assertEqual(result[1]['code'], int(actual != '38'))
                self.assertIn(actual, result[1]['output'])
                self.assertFalse(backups.exists())

    def test_failed_probe_keeps_backup_diagnostic(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'site'
            backups = Path(folder) / 'absent'
            with patch.object(p,'verify_project'), patch.object(p,'guard_mutation_ownership'), patch.object(p,'installed_schema',return_value=38), patch.object(p,'php_job',side_effect=p.ProjectError('PHP indisponível')):
                result = p.schema_diagnostics(root, backups)
            self.assertIn('PHP indisponível', result[1]['output'])
            self.assertEqual(result[2]['label'],'Pasta privada de backup')

    def test_invalid_schema_does_not_execute_php(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'site'
            backups = Path(folder) / 'absent'
            with patch.object(p,'verify_project'), patch.object(p,'guard_mutation_ownership'), patch.object(p,'installed_schema',side_effect=p.ProjectError('inválido')), patch.object(p,'php_job') as job:
                result = p.schema_diagnostics(root, backups)
                job.assert_not_called()
            self.assertEqual(result[1]['code'],1)

    def test_private_backup_error_reports_errno(self):
        with patch.object(Path,'mkdir',side_effect=PermissionError(13,'denied')):
            with self.assertRaisesRegex(p.ProjectError,'errno 13'):
                p.private_backup_root(Path('/tmp/backup-not-created'))

class WorkerStatusTests(unittest.TestCase):
    def test_failure_keeps_schema_and_original_stage(self):
        import hashlib
        import json
        import project_updater as worker
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            op = 'a' * 24
            archive = base / ('project-upload-' + op + '.zip')
            archive.write_bytes(b'example'); archive.chmod(0o600)
            request = base / 'request.json'
            request.write_text(json.dumps(dict(id=op,name=p.PROJECT_NAME,mode='file',archive=archive.name,sha256=hashlib.sha256(b'example').hexdigest())))
            request.chmod(0o600)
            def fail_deploy(archive, update_status):
                update_status('backup','backup')
                update_status('installing','installing')
                update_status('rolling_back','rollback')
                raise p.ProjectError('Falha de teste')
            # Simulate root-owned request/archive without requiring root in CI.
            original_stat = Path.stat
            def fake_stat(path, *args, **kwargs):
                st = original_stat(path,*args,**kwargs)
                if path in (archive, request):
                    return SimpleNamespace(st_mode=st.st_mode,st_uid=0)
                return st
            with patch.object(Path,'stat',fake_stat), patch.object(worker.os,'geteuid',return_value=0), patch.object(worker,'REQUEST',request), patch.object(worker,'BACKUP_ROOT',base), patch.object(worker,'private_backup_root'), patch.object(worker,'verify_project'), patch.object(worker,'guard_mutation_ownership'), patch.object(worker,'installed_schema',return_value=38), patch.object(worker,'validate_archive',return_value=dict(version='1.0.161',schema=39,manifestVerified=True)), patch.object(worker,'deploy_archive',side_effect=fail_deploy), patch.object(worker,'status') as status:
                with self.assertRaisesRegex(p.ProjectError,'Falha de teste'):
                    worker.main()
            args, kw = status.call_args
            self.assertEqual(args[1],'failed')
            self.assertEqual(kw['failedStage'],'installing')
            self.assertTrue(kw['rollbackAttempted'])
            self.assertEqual((kw['schemaFrom'],kw['schemaTo']),(38,39))
            self.assertFalse(archive.exists())
