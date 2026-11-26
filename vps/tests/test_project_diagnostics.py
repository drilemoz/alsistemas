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

class RecoveryTests(unittest.TestCase):
    def test_active_no_change(self):
        from project_diagnostics import repair_project
        calls=[]
        def runner(args,**kw):
            calls.append(args)
            return CompletedProcess(args,0,'LoadState=loaded\nActiveState=active\nUnitFileState=enabled\n','')
        result=repair_project(Path('/tmp/project'),'nginx-start',runner)
        self.assertFalse(result['changed']);self.assertEqual(len(calls),1)
    def test_invalid_config_blocks_start(self):
        from project_diagnostics import repair_project
        calls=[]
        def runner(args,**kw):
            calls.append(args)
            if args[0]=='/usr/sbin/nginx': return CompletedProcess(args,1,'','bad config')
            return CompletedProcess(args,0,'LoadState=loaded\nActiveState=failed\n','')
        with self.assertRaisesRegex(ValueError,'Configuração inválida'): repair_project(Path('/tmp/project'),'nginx-start',runner)
        self.assertEqual(len(calls),2)
    def test_start_inactive_and_check_state(self):
        from project_diagnostics import repair_project
        calls=[]
        def runner(args,**kw):
            calls.append(args)
            if '--no-block' in args: return CompletedProcess(args,0,'','')
            return CompletedProcess(args,0,'LoadState=loaded\nActiveState='+('inactive' if len(calls)==1 else 'activating')+'\n','')
        result=repair_project(Path('/tmp/project'),'mariadb-start',runner)
        self.assertTrue(result['submitted']);self.assertEqual(result['after']['ActiveState'],'activating')
        self.assertEqual(calls[1],['/bin/systemctl','--no-block','start','mariadb.service'])
    def test_reject_unlisted_and_masked(self):
        from project_diagnostics import repair_project
        with self.assertRaises(ValueError): repair_project(Path('/tmp/project'),'ssh-start',lambda *a,**k:self.fail('unexpected command'))
        with self.assertRaises(ValueError): repair_project(Path('/tmp/project'),'php-start',lambda args,**kw:CompletedProcess(args,0,'LoadState=loaded\nActiveState=inactive\nUnitFileState=masked\n',''))
