import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'admin'))
import package_policy as policy

class PackageHistoryTests(unittest.TestCase):
    def test_history_keeps_latest_20_terminal_jobs(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            account=SimpleNamespace(pw_uid=os.getuid(),pw_gid=os.getgid())
            def write(stage,job,log=''):
                policy.package_status(stage,'sqlite3','Teste',root,job=f'{job:024x}',operation='remove',log=log)
            with patch.object(policy.pwd,'getpwnam',return_value=account):
                for i in range(22):
                    write('completed',i)
                write('installing',25,'não é final')
                write('canceled',21,'x'*19000)
            records=json.loads((root/policy.HISTORY_FILE).read_text())
            self.assertEqual(len(records),20)
            self.assertEqual(records[0]['stage'],'canceled')
            self.assertEqual(len(records[0]['log']),18000)
            self.assertEqual(len({record['job'] for record in records}),20)
            self.assertEqual(records[-1]['job'],f'{2:024x}')
            self.assertEqual((root/policy.HISTORY_FILE).stat().st_mode & 0o777,0o600)

if __name__=='__main__':unittest.main()
