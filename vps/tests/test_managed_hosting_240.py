import hashlib
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'admin'))
import helper
import managed_hosting as host

class ManagedHosting(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.project = self.base / 'uai-cortes'
        self.uid = os.getuid()
        self.upload = self.base / ('upload-'+'a'*24+'.zip')
        helper.create_project({'action':'create_project','name':'uai-cortes','type':'static','displayName':'Uai Cortes'},self.base)

    def zip(self,files):
        with zipfile.ZipFile(self.upload,'w',zipfile.ZIP_DEFLATED) as z:
            for path,content in files: z.writestr(path,content)
        return {'action':'publish_project_zip','name':'uai-cortes','upload':self.upload.name,
                'sha256':hashlib.sha256(self.upload.read_bytes()).hexdigest()}

    def test_atomic_release_and_previous(self):
        data = self.zip([('public/index.html','Primeira versão'),('public/assets/site.css','body {}')])
        result = host.deploy(data,self.project,self.base,self.uid,self.uid)
        self.assertEqual(result['files'],2)
        self.assertEqual((self.project/'public/index.html').read_text(),'Primeira versão')
        self.assertEqual(stat.S_IMODE((self.project/'.als-release-previous').stat().st_mode),0o700)
        host.deploy(self.zip([('index.html','Segunda versão')]),self.project,self.base,self.uid,self.uid)
        self.assertEqual((self.project/'public/index.html').read_text(),'Segunda versão')
        self.assertEqual((self.project/'.als-release-previous/index.html').read_text(),'Primeira versão')
        self.assertFalse((self.project/'public/assets/site.css').exists())

    def test_invalid_zip_never_publishes(self):
        old = (self.project/'public/index.html').read_bytes()
        link = zipfile.ZipInfo('link')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK|0o777) << 16
        for additions in [[('../fora','x')],[('public/.env','segredo')], [('script.php','php')],
                          [('assets','arquivo'),('assets/test.txt','filho')], [(link,'/etc/passwd')],
                          [('INDEX.HTML','dup')],[('key.pem','não publicar')]]:
            with self.subTest(additions=additions), self.assertRaises(host.HostingError):
                host.deploy(self.zip([('index.html','nova'),*additions]),self.project,self.base,self.uid,self.uid)
        self.assertEqual(old,(self.project/'public/index.html').read_bytes())

    def test_digest_and_legacy_are_rejected(self):
        data=self.zip([('index.html','novo')])
        with self.assertRaises(host.HostingError):
            host.deploy({**data,'sha256':'0'*64},self.project,self.base,self.uid,self.uid)
        helper.create_project({'action':'create_project','name':'legacy-site','type':'static'},self.base)
        with self.assertRaises(host.HostingError):
            host.deploy(data,self.base/'legacy-site',self.base,self.uid,self.uid)

    def test_managed_nginx_and_rollback(self):
        available,enabled = self.base/'available',self.base/'enabled'
        available.mkdir(); enabled.mkdir()
        task={'action':'create_project','name':'new-portal','domain':'portal.example.com','type':'static','displayName':'Portal'}
        def failed(cmd,**opts): return subprocess.CompletedProcess(cmd,1,'','invalid')
        with self.assertRaises(helper.TaskError): helper.create_project(task,self.base,available,enabled,failed)
        self.assertFalse((self.base/'new-portal').exists())
        def passed(cmd,**opts): return subprocess.CompletedProcess(cmd,0,'','')
        helper.create_project(task,self.base,available,enabled,passed)
        self.assertIn('acme-challenge',(available/'als-new-portal.conf').read_text())
        self.assertIn('listen 443 ssl',helper.nginx_config('new-portal','portal.example.com','static',self.base,hosting=True,tls=True))
