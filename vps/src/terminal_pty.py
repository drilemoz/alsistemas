#!/usr/bin/python3
"""Socket systemd -> PTY Bash, exclusivamente sob usuário separado sem sudo."""
import errno
import fcntl
import os
import pty
import select
import signal
import socket
import struct
import termios
import time

LIMIT = 65536

def serve(conn):
    if os.geteuid() == 0:
        raise RuntimeError('Terminal não pode executar como root')
    pid, fd = pty.fork()
    if pid == 0:
        conn.close() if conn.fileno() > 2 else None
        home = os.environ.get('STATE_DIRECTORY', '/var/lib/alsistemas-terminal')
        os.chdir(home)
        os.execve('/bin/bash', ['bash', '--noprofile', '--norc', '-i'], {
            'HOME':home, 'PATH':'/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
            'TERM':'dumb', 'LANG':'C.UTF-8', 'PS1':'als-terminal:\\w\\$ ',
            'HISTFILE':'/dev/null', 'PAGER':'cat', 'SYSTEMD_PAGER':'cat', 'SYSTEMD_COLORS':'0',
        })
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 100, 0, 0))
        conn.setblocking(False); os.set_blocking(fd, False)
        to_pty, to_client = bytearray(), bytearray()
        eof = False
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            if eof and not to_client: break
            readers = [conn] if not eof and len(to_pty)<LIMIT else []
            if not eof and len(to_client)<LIMIT: readers.append(fd)
            writers = ([conn] if to_client else []) + ([fd] if to_pty and not eof else [])
            r,w,_ = select.select(readers,writers,[],1)
            if conn in r:
                data=conn.recv(4096)
                if not data: break
                to_pty.extend(data)
            if fd in r:
                try: data=os.read(fd,8192)
                except OSError as exc:
                    if exc.errno!=errno.EIO: raise
                    data=b''
                if not data: eof=True
                else: to_client.extend(data)
            if conn in w: del to_client[:conn.send(to_client)]
            if fd in w and not eof:
                try: del to_pty[:os.write(fd,to_pty)]
                except OSError as exc:
                    if exc.errno!=errno.EIO: raise
                    eof=True
    finally:
        os.close(fd)
        try: os.kill(pid,signal.SIGHUP)
        except ProcessLookupError: pass
        # O systemd encerra também os descendentes restantes (KillMode=control-group).
        try: os.waitpid(pid,os.WNOHANG)
        except ChildProcessError: pass

if __name__=='__main__':
    # Duplica o socket para não fechar stdin/stdout do filho após pty.fork().
    with socket.socket(fileno=os.dup(0)) as connection:
        serve(connection)
