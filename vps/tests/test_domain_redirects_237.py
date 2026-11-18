import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'admin'))
from domain_redirects import RedirectError, execute_redirect

ZONE = 'example.com'
HOST = 'ir.example.com'

class Redirects237(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name).resolve()
        self.available = root / 'available'
        self.enabled = root / 'enabled'
        self.certs = root / 'certs'
        self.available.mkdir()
        self.enabled.mkdir()
        self.certs.mkdir()
        self.calls = []
        self.dump = ''
        self.reload_fails = 0
        self.invalid = False

    def runner(self,args,**kwargs):
        self.calls.append(args)
        fail = False
        if args[-1]=='-t' and self.invalid:
            fail = True
            self.invalid = False
        if args[-2:] == ['reload','nginx'] and self.reload_fails:
            self.reload_fails -= 1
            fail = True
        return SimpleNamespace(returncode=1 if fail else 0,stdout=self.dump if args[-1]=='-T' else '',stderr='')

    def run_task(self,request):
        return execute_redirect(request,self.available,self.enabled,self.runner,self.certs)

    def new(self,host=HOST,revision=None,**fields):
        data={'destination':'https://www.example.net/base','code':302,'enabled':True,'https':False,'preserve':True}
        data.update(fields)
        return {'action':'save_domain_redirect','zone':ZONE,'host':host,'revision':revision,'rule':data}

    def list(self,zone=ZONE):
        return self.run_task({'action':'list_domain_redirects','zone':zone})['items']

    def test_create_edit_delete_modes_are_scoped_and_hash_guarded(self):
        item = self.run_task(self.new())['item']
        source = self.available / f'als-redirect-{HOST}.conf'
        link = self.enabled / source.name
        self.assertTrue(link.is_symlink())
        self.assertIn('https://www.example.net/base$request_uri',source.read_text())
        self.assertIn('/.well-known/acme-challenge/', source.read_text())
        self.assertEqual(self.list()[0]['revision'],item['revision'])
        self.assertEqual(self.list('unrelated.com'),[])
        with self.assertRaisesRegex(RedirectError,'mudou'):
            self.run_task(self.new(code=301))
        newer=self.run_task(self.new(revision=item['revision'],enabled=False,code=301))['item']
        self.assertFalse(link.exists())
        self.assertEqual(self.list()[0]['code'],301)
        self.run_task({'action':'delete_domain_redirect','zone':ZONE,'host':HOST,'revision':newer['revision']})
        self.assertFalse(source.exists())

    def test_failed_reload_rolls_back_previous_rule(self):
        item=self.run_task(self.new())['item']
        self.reload_fails=1
        with self.assertRaisesRegex(RedirectError,'anterior restaurada'):
            self.run_task(self.new(revision=item['revision'],code=301))
        self.assertEqual(self.list()[0]['code'],302)
        self.assertTrue((self.enabled / f'als-redirect-{HOST}.conf').is_symlink())

    def test_validation_failure_does_not_leave_new_rule(self):
        self.invalid=True
        with self.assertRaisesRegex(RedirectError,'anterior restaurada'):
            self.run_task(self.new())
        self.assertEqual(self.list(),[])
        self.assertEqual(list(self.enabled.iterdir()),[])

    def test_reserved_injection_external_wildcard_and_cycles(self):
        with self.assertRaisesRegex(RedirectError,'reservado'):
            self.run_task(self.new('www.example.com'))
        with self.assertRaisesRegex(RedirectError,'URL'):
            self.run_task(self.new(destination='https://example.net/$host'))
        self.dump='# configuration file /etc/nginx/sites-enabled/outer.conf:\nserver_name\n  *.example.com multi.example.com;'
        with self.assertRaisesRegex(RedirectError,'curinga'):
            self.run_task(self.new())
        self.dump=''
        self.run_task(self.new(destination='https://go.example.com'))
        with self.assertRaisesRegex(RedirectError,'ciclo'):
            self.run_task(self.new('go.example.com',destination='https://ir.example.com'))

    def test_https_requires_source_certificate(self):
        with self.assertRaisesRegex(RedirectError,'certificado'):
            self.run_task(self.new(https=True))
        folder=self.certs / HOST
        folder.mkdir()
        for name in ('fullchain.pem','privkey.pem'):
            (folder / name).write_text('fixture')
        rule=self.run_task(self.new(https=True,preserve=False))['item']
        self.assertTrue(rule['https'])
        self.assertIn('listen 443 ssl', (self.available / f'als-redirect-{HOST}.conf').read_text())

    def test_non_owned_path_not_overwritten(self):
        p=self.available / f'als-redirect-{HOST}.conf'
        p.write_text('configuração externa')
        with self.assertRaises(RedirectError):
            self.run_task(self.new())
        self.assertEqual(p.read_text(),'configuração externa')

if __name__ == '__main__':
    unittest.main()
