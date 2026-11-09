import { lazyWithRetry } from '../../utils/lazyWithRetry'
import { Suspense } from 'react'
import { Spin } from '../../components/admin/infra/InfraBase'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'

const AbaConfiguracoes = lazyWithRetry(() => import('../../components/admin/infra/AbaConfiguracoes'))

export default function AdminConfiguracoes() {
  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <h1 className="adm-page-title">Configurações</h1>
        <p className="adm-page-sub">Credenciais e conexões — MongoDB e Cloudinary</p>
      </div>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size={24} /></div>}>
        <AbaConfiguracoes />
      </Suspense>
    </div>
  )
}
