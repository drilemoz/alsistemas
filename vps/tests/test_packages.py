import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from contextlib import nullcontext
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('als_packages',Path(__file__).parents[1]/'admin/packages.py')
pkg=importlib.util.module_from_spec(spec);spec.loader.exec_module(pkg)
spec2=importlib.util.spec_from_file_location('als_helper_packages',Path(__file__).parents[1]/'admin/helper.py')
helper=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(helper)

class PackageTests(unittest.TestCase):
    def test_read_request_rejects_unknown_and_unsafe_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'request.json'
            p.write_text(json.dumps({'package':'php-curl'}));p.chmod(0o600)
            # GitHub Actions runs as a regular user. Emulate the required root
            # owner on the opened FD without weakening the production check.
            real_fstat = os.fstat
            def owner_is_root(fd):
                st = real_fstat(fd)
                return SimpleNamespace(st_mode=st.st_mode, st_uid=0,
                                       st_nlink=st.st_nlink, st_size=st.st_size)
            with patch.object(pkg.os, 'fstat', side_effect=owner_is_root):
                self.assertEqual(pkg.read_request(p),'php-curl')
                p.write_text(json.dumps({'package':'shell-command'}))
                with self.assertRaises(ValueError): pkg.read_request(p)
                p.write_text(json.dumps({'package':'composer'}));p.chmod(0o644)
                with self.assertRaises(ValueError): pkg.read_request(p)
            p.chmod(0o600)
            if os.getuid() != 0:
                # Real non-root file ownership must still be rejected.
                with self.assertRaisesRegex(ValueError, 'inseguro'):
                    pkg.read_request(p)

    def test_helper_rejects_any_package_outside_allowlist(self):
        for name in ['nodejs','curl;rm -rf /','../tmp','php9.0-curl',None]:
            with self.subTest(name=name), self.assertRaises(helper.TaskError):
                helper.execute_task({'action':'install_package','package':name})

    def test_helper_enqueues_approved_package_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'request.json'
            actual_Path=Path
            def fixed_path(pathname):
                return path if pathname=='/run/alsistemas-vps/package-request.json' else actual_Path(pathname)
            calls=[]
            def runner(args,*a,**kw):
                calls.append(args)
                return SimpleNamespace(returncode=3 if 'is-active' in args else 0)
            with patch.object(helper,'Path',side_effect=fixed_path),patch.object(helper.subprocess,'run',side_effect=runner),patch.object(helper,'package_status'),patch.object(helper,'package_gate',return_value=nullcontext()),patch.object(helper,'write_job'):
                result=helper.execute_task({'action':'install_package','package':'php-intl'})
            self.assertTrue(result['started'])
            self.assertEqual(json.loads(path.read_text())['package'],'php-intl')
            self.assertEqual(calls[-1], ['/bin/systemctl','start','--no-block','alsistemas-package-installer.service'])

    def test_apt_refuses_removals_and_changes_to_runtime(self):
        for blocked in ('Remv libfoo [1.2]', 'Purg libfoo [1.2]', 'Inst nodejs:amd64 [22] (24)', 'Inst npm (11)', 'Conf nginx (1.24)'):
            calls = []
            def run(cmd,**opts):
                calls.append(cmd)
                return SimpleNamespace(returncode=0,stdout='nodejs\tinstall ok installed\t24.22.1-1nodesource1\n' if len(calls)==1 else blocked)
            with self.subTest(blocked=blocked), self.assertRaisesRegex(RuntimeError,'bloqueada'):
                pkg.install_allowed('node-build',run)
            self.assertEqual(len(calls),2)
            self.assertIn('--simulate',calls[-1])

    def test_apt_uses_same_pins_in_simulation_and_installation(self):
        calls = []
        def run(cmd,**opts):
            calls.append(cmd)
            return SimpleNamespace(returncode=0,stdout='nodejs\tinstall ok installed\t24.22.1-1nodesource1\n' if len(calls)==1 else 'Inst sqlite3 (3.4)')
        with patch.object(pkg,'status') as status:
            pkg.install_allowed('sqlite3',run)
            status.assert_called_once()
        self.assertEqual(len(calls),3)
        for cmd in calls[1:]:
            self.assertIn('--no-remove',cmd)
            self.assertIn('sqlite3',cmd)
            self.assertIn('nodejs=24.22.1-1nodesource1',cmd)
        self.assertIn('--simulate',calls[1])
        self.assertIn('-y',calls[2])

    def test_cancel_is_only_registered_in_safe_phases(self):
        job='9'*24
        for phase in ('queued','checking','applying','done'):
            with self.subTest(phase=phase), patch.object(helper,'package_gate',return_value=nullcontext()), patch.object(helper,'read_job',return_value={'job':job,'phase':phase}), patch.object(helper,'write_job') as store:
                task={'action':'cancel_package','job':job}
                if phase in ('queued','checking'):
                    self.assertTrue(helper.execute_task(task)['requested'])
                    self.assertTrue(store.call_args.args[0]['cancel'])
                else:
                    with self.assertRaises(helper.TaskError): helper.execute_task(task)
                    store.assert_not_called()

    def test_removal_rejects_protected_or_dependent_packages(self):
        for name in ('python3','curl','unzip'):
            with self.assertRaisesRegex(ValueError,'necessário'): pkg.install_allowed(name,operation='remove')
        calls=[]
        def run(cmd,**opts):
            calls.append(cmd)
            output='Remv sqlite3 [1.2]\nRemv other [1.2]' if len(calls)>1 else ''
            return SimpleNamespace(returncode=0,stdout=output)
        with self.assertRaisesRegex(RuntimeError,'bloqueada'): pkg.install_allowed('sqlite3',run,operation='remove')
        self.assertEqual(len(calls),2)
        self.assertIn('--simulate',calls[-1])
        self.assertNotIn('purge',calls[-1])

    def test_worker_stream_sanitizes_and_cancel_gate_prevents_apply(self):
        sanitized=pkg.redact('senha=demo https://user:pass@example.net/\r[ok]')
        self.assertNotIn('demo',sanitized)
        self.assertNotIn('user:pass',sanitized)
        self.assertIn('example.net',sanitized)
        calls=[]
        def run(cmd,**opts):
            calls.append(cmd)
            return SimpleNamespace(returncode=0,stdout='')
        def cancel(): raise pkg.Canceled()
        with self.assertRaises(pkg.Canceled):
            pkg.install_allowed('sqlite3',run,report=lambda *a:None,gate=cancel)
        self.assertEqual(len(calls),2)

    def test_control_only_supported_units_and_nginx_validates(self):
        calls=[]
        def run(cmd,**opts):
            calls.append(cmd)
            return SimpleNamespace(returncode=int(cmd[0].endswith('/nginx')),stdout='loaded\n')
        with self.assertRaises(helper.ServiceError):
            helper.execute_task({'action':'control_service','unit':'ssh','operation':'stop'},runner=run)
        self.assertEqual(calls,[])
        with self.assertRaises(helper.ServiceError):
            helper.execute_task({'action':'control_service','unit':'nginx','operation':'restart'},runner=run)
        self.assertEqual(calls[-1],['/usr/sbin/nginx','-t'])
        self.assertTrue(helper.execute_task({'action':'control_service','unit':'mongod','operation':'restart'},runner=run)['submitted'])
        self.assertEqual(calls[-1],['/bin/systemctl','--no-block','restart','mongod.service'])

if __name__=='__main__':unittest.main()
