import unittest
from pathlib import Path
ROOT = Path(__file__).parents[2]

class SelfUpdatePolicyTests(unittest.TestCase):
    def test_service_allows_only_specific_backup_directory(self):
        contents = (ROOT / 'instalar.sh').read_text()
        self.assertIn('ReadWritePaths=/run/alsistemas-vps /var/lib/alsistemas /var/backups/alsistemas-vps /var/backups/alsistemas ', contents)
        self.assertIn('ProtectSystem=strict', contents)
        self.assertIn('core_switch.py" stage', contents)
        self.assertIn('core_switch.py" activate', contents)
        self.assertIn('core_switch.py" restore', contents)

    def test_interface_no_longer_requests_password_for_self_upgrade(self):
        html = (ROOT / 'vps/public/index.html').read_text()
        start = html.index('<dialog aria-labelledby="update-title"')
        end = html.index('</dialog>', start)
        self.assertNotIn('name="password"', html[start:end])
        script = (ROOT / 'vps/public/app.js').read_text()
        self.assertNotIn("'X-Update-Password'", script[script.index("function sendZip(file,"):script.index("$('update-apply-form').addEventListener")])
        self.assertIn("api('/api/updates/apply', 'POST', {})", script)

if __name__ == '__main__':
    unittest.main()
