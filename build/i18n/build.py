import json, importlib.util, sys
D = {}
for f in ['tr1.py', 'tr2.py']:
    spec = importlib.util.spec_from_file_location(f[:-3], f); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); D.update(m.TR)
sv = {k: v[0] for k, v in D.items()}; ar = {k: v[1] for k, v in D.items()}
open('../../src/renderer/i18n-data.js', 'w').write('// UI translations (Swedish, Arabic). Keys are the English source strings. Generated from build/i18n/*.py\nexport const DICT = ' + json.dumps({'sv': sv, 'ar': ar}, ensure_ascii=False, indent=0) + ';\n')
print(len(D))
