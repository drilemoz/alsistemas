import os
import pwd
import socket
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parents[1]/'src'/'terminal_pty.py'

class TerminalPtyTests(unittest.TestCase):
    def test_real_bash_and_interrupt(self):
        with tempfile.TemporaryDirectory() as home:
            kwargs={}
            if os.geteuid()==0:
                user=pwd.getpwnam('nobody');os.chown(home,user.pw_uid,user.pw_gid)
                kwargs={'user':user.pw_uid,'group':user.pw_gid,'extra_groups':[]}
            client,server=socket.socketpair()
            client.settimeout(5)
            p=subprocess.Popen(['/usr/bin/python3',str(SCRIPT)],stdin=server,stdout=server,stderr=subprocess.PIPE,env={'STATE_DIRECTORY':home},**kwargs)
            server.close()
            def read_until(expected):
                data=b'';deadline=time.monotonic()+6
                while expected not in data and time.monotonic()<deadline:
                    chunk=client.recv(8192)
                    if not chunk:break
                    data+=chunk
                self.assertIn(expected,data)
            try:
                read_until(b'als-terminal:')
                client.sendall(b'printf "%s\\n" "$((17+25))"\n')
                read_until(b'42\r\nals-terminal:')
                client.sendall(b'sleep 60\n');time.sleep(.3);client.sendall(b'\x03')
                read_until(b'als-terminal:')
                client.sendall(b'echo PTY_OK\n');read_until(b'\r\nPTY_OK\r\n')
                client.sendall(b'exit\n');p.wait(timeout=6);self.assertEqual(p.returncode,0)
            finally:
                client.close()
                if p.poll() is None:p.kill();p.wait()
                p.stderr.close()
