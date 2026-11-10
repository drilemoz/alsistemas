import json
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[2]

class IdentityTests(unittest.TestCase):
    def test_root_metadata_recognizable_to_github_manager(self):
        version = (ROOT / 'VERSION').read_text().strip()
        self.assertEqual(version, '2.0.33')
        for name in ('github-manager.json', 'app_identity.json'):
            meta = json.loads((ROOT / name).read_text())
            self.assertEqual(meta['displayName'], 'AL Sistemas VPS')
            self.assertEqual(meta['name'], 'al-sistemas-vps')
            self.assertEqual(meta['version'], version)
        for name in ('vps', 'backend', 'alsistemas'):
            self.assertEqual(json.loads((ROOT / name / 'package.json').read_text())['version'], version)

if __name__ == '__main__':
    unittest.main()
