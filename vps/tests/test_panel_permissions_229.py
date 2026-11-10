"""Gerenciador visual de perfis, com diretórios temporários e sem tocar na VPS."""
import importlib.util
import json
import os
from pathlib import Path
import pwd
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('other_project_permissions',Path(__file__).resolve().parents[1]/'admin'/'other_project_permissions.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

class PanelPermissions(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name)/'projetos';self.base.mkdir()
        self.project=self.base/'iguatamaonline';self.project.mkdir()
        (self.project/'app').mkdir();(self.project/'public').mkdir();(self.project/'private').mkdir()
        (self.project/'VERSION').write_text('1.0.1\n')
        (self.project/'app/updater.php').write_text('<?php echo 1;')
        (self.project/'public/admin.php').write_text('<?php echo 2;')
        (self.project/'private/secret.php').write_text('NÃO MOSTRAR')
        (self.project/'.env').write_text('SEGREDO')
        self.policy=Path(self.tmp.name)/'policy.json';self.backups=Path(self.tmp.name)/'backups'
        owner=pwd.getpwuid(os.getuid()).pw_name
        self.other=next((x.pw_name for x in pwd.getpwall() if x.pw_uid not in (os.getuid(),0)),'nobody')
        self.ctx=patch.object(p,'_php_accounts',return_value=[self.other]);self.ctx.start();self.addCleanup(self.ctx.stop)
    def discover(self):
        return p.discover_files('iguatamaonline',root_base=self.base,require_root=False)
    def configure(self,files=None,php_user=None):
        return p.configure_profile('iguatamaonline',php_user or self.other,files if files is not None else ['VERSION','app/updater.php'],policy_file=self.policy,root_base=self.base,backup_base=self.backups,require_root=False)
    def test_catalog_only_returns_safe_project_files(self):
        view=self.discover()
        files=[x['path'] for x in view['files']]
        self.assertEqual(view['name'],'iguatamaonline')
        self.assertIn('VERSION',files);self.assertIn('app/updater.php',files)
        self.assertNotIn('private/secret.php',files);self.assertNotIn('.env',files)
    def test_save_profile_uses_real_owner_and_does_not_change_permissions(self):
        before=(self.project/'app/updater.php').stat()
        result=self.configure(['VERSION','app/updater.php'])
        self.assertEqual(result['files'],['VERSION','app/updater.php'])
        profile=json.loads(self.policy.read_text())['projects']['iguatamaonline']
        self.assertEqual(profile['owner'],pwd.getpwuid(os.getuid()).pw_name)
        self.assertEqual(profile['phpUser'],self.other)
        self.assertEqual(self.policy.stat().st_mode & 0o777,0o600)
        after=(self.project/'app/updater.php').stat()
        self.assertEqual((before.st_uid,before.st_gid,before.st_mode & 0o777),(after.st_uid,after.st_gid,after.st_mode & 0o777))
    def test_rejects_unsafe_browser_inputs(self):
        for names in [['../etc/passwd'],['/etc/passwd'],['.env'],['private/secret.php'],['app/updater.php','app/updater.php'],[],['app/missing.php'],['app/../../etc']]:
            with self.subTest(names=names),self.assertRaises(p.ProfileError):self.configure(names)
        with self.assertRaises(p.ProfileError):self.configure(['VERSION'],php_user='root')
    def test_refuses_symlink_and_group_writable_root(self):
        (self.project/'app/updater.php').unlink()
        (self.project/'app/updater.php').symlink_to('/etc/passwd')
        self.assertNotIn('app/updater.php',[x['path'] for x in self.discover()['files']])
        with self.assertRaises(p.ProfileError):self.configure(['app/updater.php'])
        self.project.chmod(0o775)
        with self.assertRaises(p.ProfileError):self.discover()
    def test_active_permissions_block_profile_change(self):
        self.configure()
        folder=self.backups/'iguatamaonline';folder.mkdir(parents=True)
        (folder/'permissions-original.json').write_text('{}')
        with self.assertRaises(p.ProfileError):self.configure(['VERSION'])

if __name__=='__main__':unittest.main()
