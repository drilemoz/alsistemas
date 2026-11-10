import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'vps' / 'admin' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


inbox = load('al_inbox', 'inbox.py')
updater = load('al_updater_223', 'updater.py')


class InboxTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.paths = {name: root / name for name in ('inbox', 'backup', 'data', 'etc')}
        for folder in self.paths.values(): folder.mkdir()
        self.statuses = []
        self.calls = []
        def fake_run(args, *a, **kw):
            self.calls.append(list(args))
            return subprocess.CompletedProcess(args, self.systemctl_code)
        self.systemctl_code = 3  # is-active: inativo; start: 3 seria falha, ajustado por teste
        self.patches = patch.multiple(inbox, INBOX=self.paths['inbox'], BACKUP=self.paths['backup'],
                                      REJECTED=self.paths['backup'] / 'inbox-rejected', DATA=self.paths['data'],
                                      REQUEST=self.paths['etc'] / 'update-request.json', STABLE_INTERVAL=0.01)
        self.patches.start()
        self.run_patch = patch.object(inbox.subprocess, 'run', side_effect=fake_run)
        self.run_patch.start()
        self.status_patch = patch.object(inbox, 'write_status', lambda token: self.statuses.append(token))
        self.status_patch.start()

    def tearDown(self):
        patch.stopall()
        self.tmp.cleanup()

    def fake_systemctl(self, active):
        def run(args, *a, **kw):
            self.calls.append(list(args))
            code = (0 if active else 3) if 'is-active' in args else 0
            return subprocess.CompletedProcess(args, code)
        return patch.object(inbox.subprocess, 'run', side_effect=run)

    def drop(self, name, data=b'PK' + b'x' * 1024):
        (self.paths['inbox'] / name).write_bytes(data)

    def test_valid_zip_is_staged_and_updater_started(self):
        self.drop('AL-Sistemas-v2.0.23-VPS.zip')
        with self.fake_systemctl(active=False):
            inbox.process()
        request = json.loads((self.paths['etc'] / 'update-request.json').read_text())
        self.assertEqual(set(request), {'id', 'mode', 'archive', 'sha256'})
        self.assertEqual(request['mode'], 'file')
        self.assertRegex(request['archive'], r'^upload-[0-9a-f]{24}\.zip$')
        self.assertTrue((self.paths['backup'] / request['archive']).is_file())
        self.assertEqual(list(self.paths['inbox'].iterdir()), [])
        self.assertIn(['/usr/bin/systemctl', 'start', '--no-block', 'alsistemas-updater.service'], self.calls)
        self.assertEqual(self.statuses, [request['id']])

    def test_bad_name_and_directories_are_rejected_without_request(self):
        self.drop('qualquer.zip')
        (self.paths['inbox'] / 'pasta').mkdir()
        with self.fake_systemctl(active=False):
            inbox.process()
        self.assertFalse((self.paths['etc'] / 'update-request.json').exists())
        self.assertEqual(list(self.paths['inbox'].iterdir()), [])
        rejected = list((self.paths['backup'] / 'inbox-rejected').glob('*.motivo.txt'))
        self.assertEqual(len(rejected), 2)

    def test_busy_updater_rejects_instead_of_looping(self):
        self.drop('AL-Sistemas-v2.0.23-VPS.zip')
        with self.fake_systemctl(active=True):
            inbox.process()
        self.assertFalse((self.paths['etc'] / 'update-request.json').exists())
        self.assertEqual(list(self.paths['inbox'].iterdir()), [])

    def test_failed_start_cleans_request_and_staged_copy(self):
        self.drop('AL-Sistemas-v2.0.23-VPS.zip')
        def run(args, *a, **kw):
            code = 3 if 'is-active' in args else 1
            return subprocess.CompletedProcess(args, code)
        with patch.object(inbox.subprocess, 'run', side_effect=run):
            inbox.process()
        self.assertFalse((self.paths['etc'] / 'update-request.json').exists())
        self.assertEqual(list(self.paths['backup'].glob('upload-*.zip')), [])
        self.assertEqual(list(self.paths['inbox'].iterdir()), [])

    def test_symlink_is_never_followed(self):
        target = self.paths['data'] / 'segredo.zip'
        target.write_bytes(b'PK' + b'y' * 1024)
        (self.paths['inbox'] / 'AL-Sistemas-v2.0.23-VPS.zip').symlink_to(target)
        with self.fake_systemctl(active=False):
            inbox.process()
        self.assertFalse((self.paths['etc'] / 'update-request.json').exists())
        self.assertTrue(target.exists())


class RegressionTests(unittest.TestCase):
    def test_updater_main_reports_real_error_instead_of_nameerror(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seen = []
            with patch.multiple(updater, DATA=root, BACKUP=root / 'b', REQUEST=root / 'nada.json'), \
                 patch.object(updater, 'apply', side_effect=RuntimeError('boom real')), \
                 patch.object(updater, 'status', lambda stage, message, **kw: seen.append((stage, message))):
                with self.assertRaises(SystemExit) as caught: updater.main()
            self.assertEqual(caught.exception.code, 1)
            self.assertEqual(seen, [('failed', 'boom real')])

    def test_service_can_write_update_request_directory(self):
        contents = (ROOT / 'instalar.sh').read_text()
        line = next(l for l in contents.splitlines() if l.startswith('ReadWritePaths='))
        self.assertIn('/etc/alsistemas-vps', line.split())
        self.assertIn('ProtectSystem=strict', contents)
        for needle in ('alsistemas-inbox.path', 'DirectoryNotEmpty=/var/lib/alsistemas-inbox',
                       'install -d -o root -g root -m 0700 /var/lib/alsistemas-inbox',
                       'vps/admin/inbox.py', 'systemctl enable --now alsistemas-inbox.path'):
            self.assertIn(needle, contents)

    def test_manual_script_ships_and_validates(self):
        script = (ROOT / 'atualizar-vps.sh').read_text()
        for needle in ('--allow-existing-host --core-upgrade', 'unzip -tq', '/api/health', 'não é superior'):
            self.assertIn(needle, script)


if __name__ == '__main__':
    unittest.main()
