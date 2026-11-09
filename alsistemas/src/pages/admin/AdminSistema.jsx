import { lazyWithRetry } from '../../utils/lazyWithRetry'
import { Suspense } from 'react'
import { Spin } from '../../components/admin/infra/InfraBase'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'

const AbaSistema = lazyWithRetry(() => import('../../components/admin/infra/AbaSistema'))

export default function AdminSistema() {
  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <h1 className="adm-page-title">Sistema</h1>
        <p className="adm-page-sub">CPU, memória, cache e saúde do servidor</p>
      </div>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size={24} /></div>}>
        <AbaSistema />
      </Suspense>
    </div>
  )
}
