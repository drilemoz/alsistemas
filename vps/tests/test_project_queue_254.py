import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('queue_helper', Path(__file__).resolve().parents[1] / 'admin/helper.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

class QueueTests(TestCase):
    def test_github_queue_creates_timestamp_and_pins_version(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            request = root / 'project-request.json'
            data = root / 'data'; data.mkdir()
            backups = root / 'backups'; backups.mkdir()
            def map_path(value):
                return request if value == '/run/alsistemas-vps/project-request.json' else Path(value)
            with patch.object(helper, 'DATA', data), patch.object(helper, 'PROJECT_BACKUPS', backups), \
                 patch.object(helper, 'Path', side_effect=map_path), patch.object(helper, 'inspect_project', return_value={'mutationAllowed': True}), \
                 patch.object(helper.subprocess, 'run', side_effect=[SimpleNamespace(returncode=3), SimpleNamespace(returncode=0)]), \
                 patch.object(helper.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1000,pw_gid=1000)), patch.object(helper.os, 'fchown'):
                result = helper.execute_task({'action':'start_project_update','name':'iguatamaonline','mode':'github','repo':'drilemoz/Meu-Site','expectedVersion':'1.0.156'})
            self.assertTrue(result['started'])
            self.assertEqual(json.loads(request.read_text())['expectedVersion'],'1.0.156')
            status = json.loads((data/'project-update-status.json').read_text())
            self.assertEqual(status['stage'],'queued')
            self.assertIn('+00:00',status['updatedAt'])
