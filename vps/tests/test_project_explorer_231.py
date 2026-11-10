"""O explorador não faz mudanças fora dos diretórios temporários de teste."""
import importlib.util
import os
import pwd
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / 'admin'
import sys
sys.path.insert(0, str(ROOT))
import project_explorer as exp

class Explorer(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name)/'projetos'; self.base.mkdir()
        self.p=self.base/'site-a'; self.p.mkdir()
        self.dir=self.p/'public'; self.dir.mkdir()
        self.file=self.dir/'index.php'; self.file.write_text('<?php echo "ok";')
        self.file.chmod(0o644)
        self.saved=Path(self.tmp.name)/'backups'
    def list(self,directory='',offset=0):
        return exp.browse_project('site-a',directory,offset,root_base=self.base,require_root=False)
    def mode(self,path='public/index.php',mode=0o640,expected=None):
        target=self.p/path
        st=target.lstat()
        return exp.update_mode('site-a',path,mode,str(st.st_ino), stat.S_IMODE(st.st_mode) if expected is None else expected, root_base=self.base, backup_base=self.saved, require_root=False)
    def test_navigation_and_metadata(self):
        root=self.list()
        self.assertEqual(root['items'][0]['name'],'public')
        self.assertTrue(root['items'][0]['enterable'])
        content=self.list('public')
        self.assertEqual(content['items'][0]['name'],'index.php')
        self.assertEqual(content['items'][0]['mode'],'644')
        self.assertTrue(content['items'][0]['editable'])
    def test_mode_applies_only_to_selected_file(self):
        result=self.mode()
        self.assertEqual(result['previousMode'],'644')
        self.assertEqual(result['mode'],'640')
        self.assertEqual(stat.S_IMODE(self.file.stat().st_mode),0o640)
        self.assertEqual(self.file.read_text(),'<?php echo "ok";')
    def test_unsafe_modes(self):
        for value in [0o777,0o666,0o642,0o1000,-1,0o1777]:
            with self.subTest(mode=value),self.assertRaises(exp.ProfileError):
                self.mode(mode=value)
        with self.assertRaises(exp.ProfileError):self.mode('public',0o777)
        with self.assertRaises(exp.ProfileError):self.mode('public',0o775)
        with self.assertRaises(exp.ProfileError):self.mode('public',0o600)
        self.assertEqual(self.mode('public',0o750)['mode'],'750')
    def test_rejects_path_escape_and_symlinks(self):
        for path in ['../passwd','/etc/passwd','public/../../etc','public//index.php','public/./index.php', 'public\\index.php']:
            with self.subTest(path=path),self.assertRaises(exp.ProfileError):
                exp.browse_project('site-a',path,root_base=self.base,require_root=False)
        (self.dir/'linked').symlink_to('/etc/passwd')
        entries=self.list('public')['items']
        self.assertEqual(next(i for i in entries if i['name']=='linked')['kind'],'link')
        with self.assertRaises(exp.ProfileError):self.mode('public/linked')
    def test_protected_and_active(self):
        (self.dir/'.env').write_text('SECRET')
        (self.dir/'private-key.pem').write_text('SECRET')
        names={x['name']:x for x in self.list('public')['items']}
        self.assertFalse(names['.env']['editable'])
        self.assertFalse(names['private-key.pem']['editable'])
        with self.assertRaises(exp.ProfileError):self.mode('public/.env')
        snapshot=self.saved/'site-a'/'permissions-original.json'
        snapshot.parent.mkdir(parents=True)
        snapshot.write_text('{}')
        with self.assertRaises(exp.ProfileError):self.mode()
    def test_stale_inode_mode_and_reserved_project(self):
        with self.assertRaises(exp.ProfileError): self.mode(expected=0o600)
        with self.assertRaises(exp.ProfileError):
            exp.update_mode('site-a','public/index.php',0o600,'999',0o644,root_base=self.base,backup_base=self.saved,require_root=False)
        with self.assertRaises(exp.ProfileError):self.list('iguatama-teste')
    def test_paginated_and_no_outside(self):
        for i in range(130): (self.dir/f'file-{i:03}.php').write_text('ok')
        first=self.list('public');self.assertEqual(len(first['items']),120)
        self.assertEqual(first['nextOffset'],120)
        second=self.list('public',120)
        self.assertTrue(len(second['items'])>=11)
        with self.assertRaises(exp.ProfileError):self.list('public',-1)
        with self.assertRaises(exp.ProfileError):self.list('public',4001)

if __name__ == '__main__':unittest.main()
