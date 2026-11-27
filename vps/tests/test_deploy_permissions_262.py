import fcntl
import os
import pwd
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'admin'))
import project_diagnostics as d

class RepairRoutingTests(unittest.TestCase):
    def test_protected_scope(self):
        for action in d.DEPLOY_REPAIR_IDS:
            with self.assertRaisesRegex(ValueError,'exclusivo'):
                d.repair_project(Path('/tmp/other'),action)
    def test_no_arbitrary_action(self):
        with self.assertRaises(ValueError): d.repair_project(Path('/tmp/iguatamaonline'),['chmod'])
    def test_flock_refuses_busy(self):
        with tempfile.TemporaryFile() as a:
            with open('/proc/self/fd/'+str(a.fileno()),'rb') as b:
                fcntl.flock(a,fcntl.LOCK_EX|fcntl.LOCK_NB)
                with self.assertRaisesRegex(ValueError,'ocupado'): d._assert_idle(b.fileno())

@unittest.skipUnless(os.geteuid()==0,'Teste real de chown requer root')
class DeploymentPermissionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'iguatamaonline'
        self.deploy=pwd.getpwnam('nobody'); self.web=pwd.getpwnam('www-data')
        for path,uid,gid,mode in [
            ('',self.deploy.pw_uid,self.deploy.pw_gid,0o755),
            ('storage',self.web.pw_uid,self.web.pw_gid,0o750),
            ('storage/updater',self.deploy.pw_uid,self.web.pw_gid,0o3770),
            ('storage/updater/vps',self.deploy.pw_uid,self.web.pw_gid,0o3770),
            ('storage/updater/vps/private',self.deploy.pw_uid,self.web.pw_gid,0o750)]:
            p=self.root/path;p.mkdir();os.chown(p,uid,gid);p.chmod(mode)
        self.vps=self.root/'storage/updater/vps';self.private=self.vps/'private';self.code=self.private/'.code.lock'
        self.dispatch=self.vps/'.dispatch.lock';self.dispatch.touch();os.chown(self.dispatch,self.deploy.pw_uid,self.web.pw_gid);self.dispatch.chmod(0o660)
        self.code.touch();os.chown(self.code,0,0);self.code.chmod(0o644)
    def repair(self):
        return d.repair_control_permissions(self.root,deploy=self.deploy,web=self.web)
    def test_corrects_existing_lock_and_directory_idempotently(self):
        inode=self.code.stat().st_ino
        result=self.repair();self.assertTrue(result['changed'])
        self.assertEqual(result['after']['lock']['mode'],'0600');self.assertEqual(result['after']['lock']['uid'],self.deploy.pw_uid)
        self.assertEqual(result['after']['private']['mode'],'2750');self.assertEqual(self.code.stat().st_ino,inode)
        self.assertFalse(self.repair()['changed'])
    def test_pending_and_held_lock_block(self):
        marker=self.vps/'request.json';marker.touch()
        with self.assertRaisesRegex(ValueError,'pendente'): self.repair()
        marker.unlink()
        with self.code.open('rb') as handle:
            fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with self.assertRaisesRegex(ValueError,'ocupado'): self.repair()
        self.assertEqual(stat.S_IMODE(self.code.stat().st_mode),0o644)
    def test_symlink_and_hardlink_and_missing_not_changed(self):
        other=self.root/'other';other.write_text('keep');self.code.unlink();self.code.symlink_to(other)
        with self.assertRaises(OSError): self.repair()
        self.assertEqual(other.read_text(),'keep');self.code.unlink()
        other.write_text('');os.link(other,self.code)
        with self.assertRaises(ValueError): self.repair()
        self.code.unlink()
        with self.assertRaisesRegex(ValueError,'ausente'): self.repair()
        self.assertFalse(self.code.exists())
    def test_wrong_owner_and_shared_private_rejected(self):
        os.chown(self.code,self.web.pw_uid,self.web.pw_gid)
        with self.assertRaises(ValueError): self.repair()
        self.private.chmod(0o770)
        with self.assertRaisesRegex(ValueError,'compartilhada'): self.repair()
    def test_rollback_if_lock_chmod_fails(self):
        original=os.fchmod
        def fail(fd,mode):
            if mode==0o600: raise OSError('simulated')
            original(fd,mode)
        with patch.object(d.os,'fchmod',side_effect=fail):
            with self.assertRaises(OSError): self.repair()
        self.assertEqual(self.code.stat().st_uid,0)
        self.assertEqual(stat.S_IMODE(self.private.stat().st_mode),0o750)
    def test_backup_create_repair_and_reject_symlink(self):
        with tempfile.TemporaryDirectory(dir='/root') as tmp:
            folder=Path(tmp)/'iguatamaonline'
            first=d.repair_backup_permissions(self.root,folder);self.assertTrue(first['created'])
            folder.chmod(0o755); data=folder/'database.sql';data.write_text('keep')
            result=d.repair_backup_permissions(self.root,folder);self.assertTrue(result['changed']);self.assertEqual(data.read_text(),'keep')
            self.assertFalse(d.repair_backup_permissions(self.root,folder)['changed'])
            data.unlink();folder.rmdir();folder.symlink_to('/tmp',target_is_directory=True)
            with self.assertRaises(OSError): d.repair_backup_permissions(self.root,folder)
