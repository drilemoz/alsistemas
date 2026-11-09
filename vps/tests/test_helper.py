import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

source = Path(__file__).resolve().parents[1] / 'admin/helper.py'
spec = importlib.util.spec_from_file_location('als_helper', source)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

class HelperTests(unittest.TestCase):
    def test_rejects_traversal(self):
        for name in ('../site', 'iguatamaonline', 'alsistemas', 'aaa/../bbb', 'hello_world', 'UPPER', '-bad', 'a'):
            with self.subTest(name=name), self.assertRaises(helper.TaskError):
                helper.valid_name(name)

    def test_rejects_domain_injection(self):
        for value in ('evil.com; include /etc/passwd;', 'a..com', 'a.local', '*.example.com', 'https://example.com'):
            with self.subTest(value=value), self.assertRaises(helper.TaskError):
                helper.valid_domain(value)

    def test_new_static_project_and_never_overwrite(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)/'projetos'; root.mkdir()
            available = Path(tmp)/'available'; available.mkdir()
            enabled = Path(tmp)/'enabled'; enabled.mkdir()
            calls = []
            def runner(cmd, **kwargs):
                calls.append(cmd)
                return SimpleNamespace(returncode=0)
            task = {'action':'create_project', 'name':'site-novo', 'type':'static', 'domain':'site-novo.example.com'}
            result = helper.create_project(task, root, available, enabled, runner)
            self.assertTrue(result['ok'])
            self.assertTrue((root/'site-novo/public/index.html').exists())
            self.assertTrue((enabled/'als-site-novo.conf').is_symlink())
            self.assertEqual(len(calls), 2)
            self.assertEqual((root/'site-novo/.alsistemas.json').stat().st_mode & 0o777, 0o644)
            self.assertTrue((available/'als-site-novo.conf').read_text().startswith('# AL-SISTEMAS-MANAGED-SITE'))
            with self.assertRaises(helper.TaskError):
                helper.create_project(task, root, available, enabled, runner)
            self.assertEqual(len(calls), 2)

    def test_php_config_only_uses_fixed_socket(self):
        generated = helper.nginx_config('site-php', 'site-php.example.org', 'php')
        self.assertIn('unix:/run/php/php8.3-fpm.sock', generated)
        self.assertIn('server_name site-php.example.org;', generated)
        self.assertNotIn('sudo', generated)

    def test_nginx_failure_rolls_back(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)/'projetos'; root.mkdir()
            av=Path(tmp)/'available'; av.mkdir()
            en=Path(tmp)/'enabled'; en.mkdir()
            bad=lambda *a, **kw: SimpleNamespace(returncode=1)
            with self.assertRaises(helper.TaskError):
                helper.create_project({'action':'create_project','name':'site-errou','type':'static','domain':'test.example.org'},root,av,en,bad)
            self.assertFalse((root/'site-errou').exists())
            self.assertFalse((av/'als-site-errou.conf').exists())
            self.assertFalse((en/'als-site-errou.conf').exists())

    def test_toggle_only_managed_site_without_touching_project(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)/'projetos'; root.mkdir()
            av = Path(tmp)/'available'; av.mkdir()
            en = Path(tmp)/'enabled'; en.mkdir()
            calls = []
            def ok(cmd, **kwargs):
                calls.append(cmd)
                return SimpleNamespace(returncode=0)
            task = {'action':'create_project','name':'meu-blog','type':'static','domain':'meu-blog.example.org'}
            helper.execute_task(task, root, av, en, ok)
            link = en/'als-meu-blog.conf'
            self.assertTrue(link.is_symlink())
            self.assertTrue((root/'meu-blog/public/index.html').exists())
            disabled = helper.execute_task({'action':'set_site_state','name':'meu-blog','enabled':False}, root, av, en, ok)
            self.assertFalse(disabled['enabled'])
            self.assertFalse(link.is_symlink())
            self.assertTrue((root/'meu-blog/public/index.html').exists())
            before = len(calls)
            again = helper.execute_task({'action':'set_site_state','name':'meu-blog','enabled':False}, root, av, en, ok)
            self.assertTrue(again['unchanged'])
            self.assertEqual(len(calls), before)
            enabled = helper.execute_task({'action':'set_site_state','name':'meu-blog','enabled':True}, root, av, en, ok)
            self.assertTrue(enabled['enabled'])
            self.assertTrue(link.is_symlink())
            self.assertEqual(link.readlink(), av/'als-meu-blog.conf')
            self.assertTrue((root/'meu-blog/public/index.html').exists())

    def test_failed_toggle_restores_previous_state(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)/'projetos'; root.mkdir()
            av=Path(tmp)/'available'; av.mkdir()
            en=Path(tmp)/'enabled'; en.mkdir()
            good=lambda *a, **kw: SimpleNamespace(returncode=0)
            helper.create_project({'action':'create_project','name':'site-novo','type':'static','domain':'novo.example.org'},root,av,en,good)
            link=en/'als-site-novo.conf'
            failing=lambda cmd, **kw: SimpleNamespace(returncode=1 if cmd[1] == 'reload' else 0)
            with self.assertRaises(helper.TaskError):
                helper.set_site_state({'action':'set_site_state','name':'site-novo','enabled':False},root,av,en,failing)
            self.assertTrue(link.is_symlink())
            self.assertTrue((root/'site-novo/public/index.html').exists())

    def test_never_toggle_unmanaged_or_poisoned_links(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)/'projetos'; root.mkdir()
            av=Path(tmp)/'available'; av.mkdir()
            en=Path(tmp)/'enabled'; en.mkdir()
            (root/'outsider').mkdir()
            (root/'outsider/public').mkdir()
            (av/'als-outsider.conf').write_text('server { listen 80; }')
            good=lambda *a, **kw: SimpleNamespace(returncode=0)
            with self.assertRaises(helper.TaskError):
                helper.set_site_state({'action':'set_site_state','name':'outsider','enabled':True},root,av,en,good)
            self.assertFalse((en/'als-outsider.conf').exists())
            helper.create_project({'action':'create_project','name':'site-novo','type':'static','domain':'novo.example.org'},root,av,en,good)
            link=en/'als-site-novo.conf'
            link.unlink()
            link.symlink_to(av/'als-outsider.conf')
            with self.assertRaises(helper.TaskError):
                helper.set_site_state({'action':'set_site_state','name':'site-novo','enabled':False},root,av,en,good)
            self.assertEqual(link.readlink(), av/'als-outsider.conf')

    def test_nginx_validation_runs_outside_web_sandbox(self):
        commands = []
        def ok(cmd, **kwargs):
            commands.append(cmd)
            return SimpleNamespace(returncode=0)
        good = helper.validate_nginx({'action': 'validate_nginx'}, ok)
        self.assertTrue(good['valid'])
        self.assertEqual(commands, [['/usr/bin/systemctl', 'start', 'alsistemas-nginx-check.service']])
        bad = helper.validate_nginx({'action': 'validate_nginx'},
                                   lambda *_args, **_kw: SimpleNamespace(returncode=1))
        self.assertFalse(bad['valid'])
        self.assertIn('journalctl', bad['diagnostic'])
        with self.assertRaises(helper.TaskError):
            helper.validate_nginx({'action': 'validate_nginx', 'command': 'sh'}, ok)

    def test_task_allowlist_schema(self):
        for task in ({'action':'run_shell','command':'id'}, {'action':'set_site_state','name':'site-novo','enabled':1},
                     {'action':'set_site_state','name':'site-novo','enabled':True,'extra':'bad'},
                     {'action':'create_project','name':'../etc','type':'static'}):
            with self.subTest(task=task), self.assertRaises(helper.TaskError):
                with TemporaryDirectory() as tmp:
                    root=Path(tmp)/'root';root.mkdir()
                    av=Path(tmp)/'av';av.mkdir()
                    en=Path(tmp)/'en';en.mkdir()
                    helper.execute_task(task, root, av, en)

if __name__ == '__main__': unittest.main()
