import sys
import tempfile
import unittest
from pathlib import Path
from subprocess import CompletedProcess
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'admin'))
from project_diagnostics import collect, repair_timer, safe_read

class DiagnosticsTests(unittest.TestCase):
    def test_missing_lock_and_command_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'iguatamaonline'; root.mkdir()
            result=collect(root,lambda args,**kw: CompletedProcess(args,1,'','failed'))
            self.assertTrue(result['ok'])
            self.assertTrue(any(x['label'].endswith('.code.lock') and x['code']==2 for x in result['checks']))
            self.assertTrue(any(x['label']=='Nginx' and x['code']==1 for x in result['checks']))
    def test_group_and_general_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            result=collect(Path(tmp),lambda args,**kw: CompletedProcess(args,0,'ok',''), 'database')
            self.assertEqual(len(result['checks']),2)
            self.assertTrue(all('MariaDB' in x['label'] for x in result['checks']))
            with self.assertRaises(ValueError): collect(Path(tmp), group='shell')
    def test_no_symlink_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'VERSION').symlink_to('/etc/passwd')
            with self.assertRaises(OSError): safe_read(root,'VERSION')
    def test_repair_rejects_pending(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'iguatamaonline'; (root/'storage/updater/vps/private').mkdir(parents=True)
            (root/'storage/updater/vps/request.json').touch()
            with self.assertRaises(ValueError): repair_timer(root,lambda *a,**k:self.fail('não deve executar'))
    def test_repair_installed_timer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/'iguatamaonline'; (root/'storage/updater/vps/private').mkdir(parents=True)
            calls=[]
            def runner(args,**kw):
                calls.append(args);return CompletedProcess(args,0,'loaded\n','')
            self.assertTrue(repair_timer(root,runner)['ok'])
            self.assertEqual(calls[-1],['systemctl','enable','--now','iguatama-deploy.timer'])
