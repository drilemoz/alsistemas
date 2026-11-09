import importlib.util
from pathlib import Path
import unittest

FILE = Path(__file__).resolve().parents[1] / 'admin' / 'nginx_upload.py'
spec = importlib.util.spec_from_file_location('nginx_upload_219', FILE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class NginxUploadTest(unittest.TestCase):
    def setUp(self):
        self.owned = '''# AL-SISTEMAS-MANAGED
server {
 listen 443 ssl;
 server_name painel.iguatama.online;
 client_max_body_size 64k;
 location / {
   proxy_pass http://127.0.0.1:8181;
 }
}
'''

    def test_inserts_only_two_specific_locations(self):
        updated = mod.new_config(self.owned)
        self.assertEqual(updated.count('client_max_body_size 32m;'), 2)
        self.assertEqual(updated.count('client_max_body_size 64k;'), 1)
        for endpoint in mod.ENDPOINTS:
            self.assertIn(f'location = {endpoint} {{', updated)
        self.assertEqual(mod.new_config(updated), updated)

    def test_rejects_unmanaged_or_unknown_configs(self):
        for config in ('# NOT-MANAGED\n' + self.owned, self.owned.replace('64k', '20m'), self.owned.replace(' listen 443 ssl;', ' listen 80;')):
            with self.assertRaises(ValueError):
                mod.new_config(config)

    def test_rejects_partial_change(self):
        updated = mod.new_config(self.owned)
        partial = updated.replace(' location = /api/projects/iguatamaonline/update/upload {', ' location = /unknown/upload {')
        with self.assertRaises(ValueError):
            mod.new_config(partial)


if __name__ == '__main__':
    unittest.main()
