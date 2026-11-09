import { lazyWithRetry } from '../../utils/lazyWithRetry'
import { Suspense } from 'react'
import { Spin } from '../../components/admin/infra/InfraBase'

const AbaMongoDB = lazyWithRetry(() => import('../../components/admin/infra/AbaMongoDB'))

export default function AdminMongoDB() {
  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <h1 className="adm-page-title">MongoDB</h1>
        <p className="adm-page-sub">Coleções, estatísticas e índices do banco de dados</p>
      </div>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size={24} /></div>}>
        <AbaMongoDB />
      </Suspense>
    </div>
  )
}
