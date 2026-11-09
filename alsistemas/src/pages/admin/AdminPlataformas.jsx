import { lazyWithRetry } from '../../utils/lazyWithRetry'
import { Suspense } from 'react'
import { Spin } from '../../components/admin/infra/InfraBase'

const AbaPlataformas = lazyWithRetry(() => import('../../components/admin/infra/AbaPlataformas'))

export default function AdminPlataformas() {
  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <h1 className="adm-page-title">Plataformas</h1>
        <p className="adm-page-sub">Status Render e Vercel — serviços, deploys e incidentes</p>
      </div>
      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size={24} />
        </div>
      }>
        <AbaPlataformas />
      </Suspense>
    </div>
  )
}
