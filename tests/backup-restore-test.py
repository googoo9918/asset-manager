import hashlib, importlib.util, json, tempfile, unittest, zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('restore',Path(__file__).resolve().parents[1]/'src/main/resources/backup/restore-backup.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class RestoreTests(unittest.TestCase):
 def archive(self,root,files,corrupt=False):
  target=Path(root)/'backup.zip'
  manifest={'format':'asset-manager-backup','version':1,'createdAt':'test','files':[{'path':n,'bytes':len(v),'sha256':hashlib.sha256(v).hexdigest()} for n,v in files.items()]}
  with zipfile.ZipFile(target,'w') as z:
   for name,data in files.items():z.writestr(name,data+b'bad' if corrupt else data)
   z.writestr('manifest.json',json.dumps(manifest))
  return target
 def test_good_and_corrupt(self):
  with tempfile.TemporaryDirectory() as root:
   files={'database.dump':b'PGDMPtest','data/kb-card/test.json':b'{}'}
   self.assertEqual(len(module.verify(self.archive(root,files))['files']),2)
   with self.assertRaises(ValueError):module.verify(self.archive(root,files,True))
 def test_paths_and_missing_dump(self):
  with tempfile.TemporaryDirectory() as root:
   for name in ['../outside.json','data/kb-card/../../evil.json','data/kb-card/CON.json','data/kb-card/a:bad.json','application-local.yml']:
    with self.assertRaises(ValueError):module.verify(self.archive(root,{'database.dump':b'PGDMPtest',name:b'{}'}))
   with self.assertRaises(ValueError):module.verify(self.archive(root,{'data/kb-card/test.json':b'{}'}))
if __name__=='__main__':unittest.main()
