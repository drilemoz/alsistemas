import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

SIGNER = Path(__file__).resolve().parents[2] / 'tools/assinar-release.sh'

class SigningTests(unittest.TestCase):
    def test_release_assets_signature_valid_and_tampering_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            priv, pub = root/'key.pem', root/'pub.pem'
            subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(priv)],check=True,capture_output=True)
            subprocess.run(['openssl','pkey','-in',str(priv),'-pubout','-out',str(pub)],check=True,capture_output=True)
            filename = root/'AL-Sistemas-v2.0.6-VPS.zip'
            with zipfile.ZipFile(filename,'w') as z:
                z.writestr('vps/package.json', json.dumps({'version':'2.0.6'}))
            r = subprocess.run(['bash',str(SIGNER),str(priv),str(filename),str(root/'assets')],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
            files = root/'assets'
            m = files/'update-manifest.json'; sig = files/'update-manifest.json.sig'
            self.assertTrue((files/filename.name).exists())
            body = json.loads(m.read_text()); self.assertEqual(body['version'],'2.0.6')
            args=['openssl','pkeyutl','-verify','-pubin','-inkey',str(pub),'-rawin','-in',str(m),'-sigfile',str(sig)]
            self.assertEqual(subprocess.run(args,capture_output=True).returncode,0)
            m.write_bytes(m.read_bytes()+b'\n')
            self.assertNotEqual(subprocess.run(args,capture_output=True).returncode,0)

    def test_does_not_sign_wrong_internal_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            priv=root/'private.pem'
            subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(priv)],check=True,capture_output=True)
            archive=root/'AL-Sistemas-v2.0.6-VPS.zip'
            with zipfile.ZipFile(archive,'w') as z:
                z.writestr('vps/package.json',json.dumps({'version':'2.0.5'}))
            proc=subprocess.run(['bash',str(SIGNER),str(priv),str(archive),str(root/'release')],capture_output=True,text=True)
            self.assertNotEqual(proc.returncode,0)
            self.assertFalse((root/'release'/'update-manifest.json.sig').exists())

if __name__ == '__main__': unittest.main()
