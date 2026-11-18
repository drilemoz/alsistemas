import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[2]
RULE = ROOT / 'vps/systemd/alsistemas-vps.conf'


class RuntimeBootTests(unittest.TestCase):
    def test_runtime_created_before_unit_mount_namespace(self):
        installer = (ROOT / 'instalar.sh').read_text()
        start = installer.index("cat > /etc/systemd/system/alsistemas-vps.service <<'EOF'")
        section = installer[start:].split('\nEOF', 1)[0]
        self.assertNotIn('ExecStartPre=', section)
        self.assertIn('Wants=systemd-tmpfiles-setup.service', section)
        self.assertRegex(section, r'After=[^\n]*systemd-tmpfiles-setup.service')
        self.assertIn('ReadWritePaths=/run/alsistemas-vps ', section)
        self.assertIn('User=alsistemas', section)
        self.assertIn('ProtectSystem=strict', section)
        self.assertIn('systemd-tmpfiles --create "$RUNTIME_RULE"', installer[:start])
        rules = [line.split() for line in RULE.read_text().splitlines() if line and not line.startswith('#')]
        self.assertEqual(rules, [['d', '/run/alsistemas-vps', '0700', 'root', 'root', '-']])

    def test_tmpfiles_recreates_volatile_dir_on_cold_start_and_preserves_content(self):
        tmpfiles = shutil.which('systemd-tmpfiles')
        if not tmpfiles:
            self.skipTest('systemd-tmpfiles não disponível neste host')
        prefix = []
        uid, gid = 0, 0
        if os.geteuid() != 0:
            unshare = shutil.which('unshare')
            if not unshare or subprocess.run([unshare, '-Ur', 'true'], capture_output=True).returncode:
                self.skipTest('sem root ou namespace de usuário disponível')
            prefix = [unshare, '-Ur']
            uid, gid = os.geteuid(), os.getegid()
        with tempfile.TemporaryDirectory() as directory:
            fake_root = Path(directory)
            (fake_root / 'run').mkdir()
            runtime = fake_root / 'run/alsistemas-vps'
            command = [*prefix, tmpfiles, '--create', '--boot', '--root=' + directory, str(RULE)]
            for _ in range(2):
                self.assertFalse(runtime.exists())
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                metadata = runtime.stat()
                self.assertEqual(stat.S_IMODE(metadata.st_mode), 0o700)
                self.assertEqual((metadata.st_uid, metadata.st_gid), (uid, gid))
                marker = runtime / 'test-lock'
                marker.write_text('preserve')
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(marker.read_text(), 'preserve')
                # Modelo de um boot novo, somente dentro da raiz temporária do teste.
                shutil.rmtree(runtime)
