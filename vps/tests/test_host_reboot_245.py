import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from contextlib import nullcontext
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'admin'))
import host_reboot as reboot

class HostRebootTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir=Path(self.tmp.name)
        self.boot=self.dir/'boot_id'
        self.boot.write_text('38bd4f0a-447a-11f1-83e7-624aeb0e1de2\n')
        self.state=self.dir/'reboot.json'
        self.calls=[]
        self.apt=False
        self.use_mock_reader = patch.object(reboot,'read_request',side_effect=lambda path: json.loads(path.read_text()) if path.exists() else None)
        self.use_mock_lock = patch.object(reboot,'reboot_lock',return_value=nullcontext())
        for mock in (self.use_mock_reader,self.use_mock_lock):
            mock.start()
            self.addCleanup(mock.stop)

    def runner(self,args,**opts):
        self.calls.append(args)
        out=''
        if args[1]=='show':
            out='\n\n'.join(f'Id={name}\nLoadState=loaded\nActiveState='+('activating' if self.apt and name.startswith('alsistemas-package') else 'inactive') for name in reboot.UNITS)
        return subprocess.CompletedProcess(args,0,out,'')

    def test_timer_explicit_and_dispatch_is_nonforced(self):
        args={'runtime':self.dir,'state':self.state,'boot':self.boot}
        reboot.schedule({'action':'schedule_host_reboot'},self.runner,**args)
        self.assertEqual(self.calls[-1],['/bin/systemctl','start','--',reboot.TIMER])
        self.assertFalse(any(cmd[1]=='reboot' for cmd in self.calls))
        with self.assertRaises(reboot.RebootError): reboot.schedule({'action':'schedule_host_reboot'},self.runner,**args)
        reboot.dispatch(self.runner,**args)
        self.assertEqual(self.calls[-1],['/bin/systemctl','reboot'])
        self.assertEqual(json.loads(self.state.read_text())['phase'],'dispatching')

    def test_refuses_if_apt_was_started_before_dispatch(self):
        args={'runtime':self.dir,'state':self.state,'boot':self.boot}
        reboot.schedule({'action':'schedule_host_reboot'},self.runner,**args)
        self.apt=True
        reboot.dispatch(self.runner,**args)
        self.assertFalse(any(cmd[1]=='reboot' for cmd in self.calls))
        self.assertEqual(json.loads(self.state.read_text())['phase'],'blocked')

    def test_rejects_pending_queue_and_extra_arguments(self):
        args={'runtime':self.dir,'state':self.state,'boot':self.boot}
        (self.dir/'package-request.json').touch()
        with self.assertRaisesRegex(reboot.RebootError,'fila'):
            reboot.schedule({'action':'schedule_host_reboot'},self.runner,**args)
        with self.assertRaises(reboot.RebootError):
            reboot.schedule({'action':'schedule_host_reboot','command':'poweroff'},self.runner,**args)
        self.assertFalse(self.state.exists())

if __name__=='__main__': unittest.main()
