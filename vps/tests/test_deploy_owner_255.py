import importlib.util
import os
import pwd
import tempfile
import unittest
import zipfile
import fcntl
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('maintenance255', Path(__file__).resolve().parents[1] / 'admin/project_maintenance.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

class DeployOwnerTests(unittest.TestCase):
    @unittest.skipUnless(os.geteuid() == 0, 'teste de ownership exige root no ambiente isolado')
    def test_dedicated_owner_and_lock(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / 'iguatamaonline'; root.mkdir()
            uid, gid = 12345, 12345
            os.chown(root, uid, gid)
            for rel in ('app', 'public', 'storage/updater/vps/private'):
                d = root / rel; d.mkdir(parents=True); os.chown(d, uid, gid)
            lock = root / 'storage/updater/vps/private/.code.lock'; lock.touch(mode=0o600); os.chown(lock, uid, gid)
            account = SimpleNamespace(pw_uid=uid, pw_gid=gid, pw_name=p.DEPLOY_ACCOUNT)
            original = pwd.getpwnam
            def lookup(name):
                if name == p.DEPLOY_ACCOUNT: return account
                return original(name)
            with patch.object(p, 'PROJECT_ROOT', root), patch.object(p.pwd, 'getpwnam', side_effect=lookup), patch.object(p, 'php_account', return_value=('www-data',33,33)):
                p.guard_mutation_ownership(root)
                import io
                p.install_code(root, 'app/new/feature.php', io.BytesIO(b'new'), uid, gid, 0o644)
                self.assertEqual((root/'app/new').stat().st_uid, uid)
                self.assertEqual((root/'app/new/feature.php').stat().st_uid, uid)
                self.assertEqual(p.read_code(root,'app/new/feature.php'), b'new')
                with p.site_worker_lock(root):
                    with self.assertRaisesRegex(p.ProjectError, 'em execução'):
                        with p.site_worker_lock(root): pass
                (lock.parent/'maintenance').touch()
                with self.assertRaisesRegex(p.ProjectError, 'Recuperação pendente'):
                    with p.site_worker_lock(root): pass
                (lock.parent/'maintenance').unlink()
                (root/'app/evil').symlink_to('/etc', target_is_directory=True)
                with self.assertRaises(OSError):
                    p.install_code(root,'app/evil/feature.php',io.BytesIO(b'x'),uid,gid,0o644)
                with patch.object(p, 'php_account', return_value=('php',uid,gid)):
                    with self.assertRaises(p.ProjectError): p.guard_mutation_ownership(root)
                os.chown(root, uid+1, gid)
                with self.assertRaisesRegex(p.ProjectError,'Proprietário não autorizado'):
                    p.guard_mutation_ownership(root)

if __name__ == '__main__': unittest.main()
