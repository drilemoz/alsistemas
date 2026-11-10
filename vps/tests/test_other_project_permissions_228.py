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

class OtherProjects(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name)/'projects';self.base.mkdir()
        self.root=self.base/'site-a';self.root.mkdir()
        (self.root/'public').mkdir()
        (self.root/'public'/'update.php').write_text('<?php')
        self.policy=Path(self.tmp.name)/'policy.json'
        current=pwd.getpwuid(os.getuid()).pw_name
        other=next((x.pw_name for x in pwd.getpwall() if x.pw_uid not in (os.getuid(),0) and x.pw_name != current),'nobody')
        self.profile={'owner':current,'phpUser':other,'files':['public/update.php']}
        self.backups=Path(self.tmp.name)/'backups'
        self.write_policy()
    def write_policy(self):
        self.policy.write_text(json.dumps({'projects':{'site-a':self.profile}}))
        self.policy.chmod(0o600)
    def inspect(self):
        return p.handle_permissions('site-a','inspect',policy_file=self.policy,root_base=self.base,backup_base=self.backups,require_root=False)
    def test_readonly_profile(self):
        r=self.inspect()
        self.assertEqual(r['name'],'site-a');self.assertTrue(r['configured']);self.assertFalse(r['active'])
        self.assertEqual(len(r['files']),1)
        self.assertEqual(r['files'][0]['path'],'public/update.php')
        self.assertEqual((self.root/'public/update.php').read_text(),'<?php')
    def test_missing_profile_does_not_allow_write(self):
        self.profile=None
        self.policy.write_text(json.dumps({'projects':{}}))
        self.assertFalse(self.inspect()['configured'])
        with self.assertRaises(p.ProfileError):p.handle_permissions('site-a','allow',policy_file=self.policy,root_base=self.base,backup_base=self.backups,require_root=False)
    def test_rejects_traversal_special_files_and_untrusted_owner(self):
        for rel in ['../passwd','/etc/passwd','public/.env','storage/data.php','public/private-key.pem','public/../../../etc','public/secret.php']:
            with self.subTest(rel=rel):
                self.profile['files']=[rel];self.write_policy()
                with self.assertRaises(p.ProfileError):self.inspect()
        self.profile['files']=['public/update.php'];self.profile['owner']='nobody' if self.profile['owner']!='nobody' else 'root';self.write_policy()
        with self.assertRaises(p.ProfileError):self.inspect()
    def test_rejects_symlinks_and_group_writable_tree(self):
        (self.root/'public/update.php').unlink();(self.root/'public/update.php').symlink_to('/etc/hosts')
        with self.assertRaises(p.ProfileError):self.inspect()
        (self.root/'public/update.php').unlink();(self.root/'public/update.php').write_text('<?php')
        self.root.chmod(0o777)
        with self.assertRaises(p.ProfileError):self.inspect()
    def test_chown_failure_keeps_original_and_discards_snapshot(self):
        original=(self.root/'public/update.php').stat()
        with patch.object(p.os,'fchown',side_effect=PermissionError('no root')):
            with self.assertRaises(PermissionError):
                p.handle_permissions('site-a','allow',policy_file=self.policy,root_base=self.base,backup_base=self.backups,require_root=False)
        new=(self.root/'public/update.php').stat()
        self.assertEqual((new.st_uid,new.st_gid,new.st_mode & 0o777),(original.st_uid,original.st_gid,original.st_mode & 0o777))
        self.assertFalse((self.backups/'site-a'/'permissions-original.json').exists())

    def test_rejects_unsafe_policy_mode(self):
        self.policy.chmod(0o666)
        with self.assertRaises(p.ProfileError):self.inspect()
    def test_rejects_other_names(self):
        for name in ['iguatama-teste','../site-a','alsistemas','site--a']:
            with self.subTest(name=name),self.assertRaises(p.ProfileError):p.project_name(name)
