import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
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
            with patch.object(helper,'Path',side_effect=fixed_path),patch.object(helper.subprocess,'run',side_effect=runner):
                result=helper.execute_task({'action':'install_package','package':'php-intl'})
            self.assertTrue(result['started'])
            self.assertEqual(json.loads(path.read_text())['package'],'php-intl')
            self.assertEqual(calls[-1], ['/usr/bin/systemctl','start','--no-block','alsistemas-package-installer.service'])

if __name__=='__main__':unittest.main()
