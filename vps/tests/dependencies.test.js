import test from 'node:test'
import assert from 'node:assert/strict'
import { validPackageId, PACKAGE_CATALOG, dependencyInfo } from '../src/dependencies.js'

test('catálogo contém as seis categorias e impede troca do próprio runtime', () => {
  for (const id of ['php-curl','php-zip','composer','certbot','mariadb-server','php-pgsql','node-build','git']) assert.equal(validPackageId(id),true)
  for (const id of ['../etc','nginx;rm','nodejs','npm','sudo','php8.3-curl',null,[]]) assert.equal(validPackageId(id),false)
  assert.deepEqual(new Set(PACKAGE_CATALOG.map(p=>p.group)),new Set(['node','php','database','tools','ruby','mail']))
  assert.equal(new Set(PACKAGE_CATALOG.map(p=>p.id)).size,PACKAGE_CATALOG.length)
})
test('inventário usa dpkg-query em lote e reconhece npm mesmo incluído no pacote nodejs', () => {
  const seen = []
  const result = dependencyInfo((cmd,args,options) => {
    seen.push({cmd,args,options})
    if (cmd.endsWith('/npm')) return {status:0,stdout:'11.18.0\n'}
    return {status:1,stdout:'nodejs\tinstall ok installed\t24.22.1-1nodesource1\nphp8.3-curl:amd64\tinstall ok installed\t8.3.6\nnginx\tinstall ok installed\t1.24.0\n'}
  })
  assert.equal(seen.length,2)
  assert.equal(seen[0].cmd,'/usr/bin/dpkg-query')
  assert.ok(seen[0].args.includes('php8.3-curl'))
  assert.equal(seen[0].options.shell,false)
  assert.equal(seen[1].cmd,'/usr/bin/npm')
  assert.equal(seen[1].options.cwd,'/')
  assert.notEqual(seen[1].options.env.NPM_CONFIG_USERCONFIG,seen[1].options.env.NPM_CONFIG_GLOBALCONFIG)
  assert.equal(result.runtime.node.version,process.versions.node)
  assert.equal(result.runtime.npm.version,'11.18.0')
  assert.equal(result.runtime.npm.packageVersion,null)
  const curl = result.packages.find(p=>p.id==='php-curl')
  assert.equal(curl.installed,true)
  assert.equal(curl.version,'8.3.6')
  assert.equal(result.packages.find(p=>p.id==='mariadb-server').installed,false)
})
test('npm ausente é distinto de inventário que falhou', () => {
  const result = dependencyInfo(cmd => cmd.endsWith('/npm')
    ? {status:null,error:{code:'ENOENT'}} : {status:null,error:{code:'ETIMEDOUT'}})
  assert.equal(result.runtime.npm.state,'missing')
  assert.equal(result.inventoryAvailable,false)
  assert.ok(result.packages.every(p=>p.installed===null && !p.installable))
})
