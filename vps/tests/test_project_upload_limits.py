import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'admin'))
from project_upload_limits import transform
RAW='''server {
    server_name iguatama.online www.iguatama.online;
    root /var/www/projetos/iguatamaonline/public;
    location ~ \\.php$ {
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }
}
server {
    server_name iguatama.online www.iguatama.online;
    return 301 https://$host$request_uri;
}
'''
class UploadLimits(unittest.TestCase):
    def test_apply_and_repeat(self):
        result=transform(RAW,'iguatamaonline',(80,64,80))
        self.assertEqual(result.count('client_max_body_size 80m;'),2)
        self.assertIn('upload_max_filesize=64M\\npost_max_size=80M',result)
        self.assertEqual(transform(result,'iguatamaonline')['upload'],'64M')
        self.assertEqual(transform(result,'iguatamaonline',(80,64,80)),result)
    def test_invalid(self):
        with self.assertRaises(ValueError): transform(RAW,'iguatamaonline',(64,64,80))
        with self.assertRaises(ValueError): transform(RAW,'other',(80,64,80))
