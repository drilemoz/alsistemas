import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).parents[1] / 'admin' / 'core_switch.py'
spec = importlib.util.spec_from_file_location('core_switch_221', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class CoreSwitchTests(unittest.TestCase):
    def test_stage_activate_and_recover_previous(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'release'
            active = root / 'install/current'
            for name in ('src', 'public'):
                (source / name).mkdir(parents=True)
                (active / name).mkdir(parents=True)
            (source / 'src/server.js').write_text('new server')
            (source / 'public/index.html').write_text('new html')
            (source / 'public/app.js').write_text('new app')
            (source / 'package.json').write_text('{"version":"2.0.21"}')
            (active / 'src/server.js').write_text('old server')
            (active / 'package.json').write_text('{"version":"2.0.20"}')
            staged = mod.stage_core(source, active.parent)
            self.assertEqual((active / 'src/server.js').read_text(), 'old server')
            previous = mod.activate_core(staged, active)
            self.assertEqual((active / 'src/server.js').read_text(), 'new server')
            self.assertEqual((previous / 'src/server.js').read_text(), 'old server')
            failed = mod.restore_core(active, previous)
            self.assertEqual((active / 'src/server.js').read_text(), 'old server')
            self.assertEqual((failed / 'src/server.js').read_text(), 'new server')

    def test_stage_failure_preserves_current(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'release'
            active = root / 'install/current'
            active.mkdir(parents=True)
            (active / 'package.json').write_text('{"version":"2.0.20"}')
            (source / 'src').mkdir(parents=True)
            (source / 'src/server.js').write_text('new server')
            with self.assertRaises(Exception):
                mod.stage_core(source, active.parent)
            self.assertEqual((active / 'package.json').read_text(), '{"version":"2.0.20"}')
            self.assertFalse(any(p.name.startswith('.stage-core-') for p in active.parent.iterdir()))

    def test_activation_failure_restores_current(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            active = root / 'current'
            staged = root / '.stage-core-test'
            for directory in (active, staged):
                (directory / 'src').mkdir(parents=True)
                (directory / 'public').mkdir()
                (directory / 'src/server.js').write_text('old' if directory == active else 'new')
                (directory / 'public/index.html').write_text('a')
                (directory / 'public/app.js').write_text('b')
                (directory / 'package.json').write_text('{"version":"2.0.21"}')
            import os
            real = os.rename
            def break_staged(src, dst):
                if str(src) == str(staged):
                    raise OSError('simulated failed atomic rename')
                return real(src, dst)
            with patch.object(mod.os, 'rename', side_effect=break_staged):
                with self.assertRaises(OSError):
                    mod.activate_core(staged, active)
            self.assertEqual((active / 'src/server.js').read_text(), 'old')

    def test_source_or_destination_symlinks_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            alias = root / 'current'
            (root / 'other').mkdir()
            alias.symlink_to(root / 'other')
            with self.assertRaises(RuntimeError):
                mod.activate_core(root / '.stage-core-fake', alias)


if __name__ == '__main__':
    unittest.main()
