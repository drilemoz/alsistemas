import { useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './detail-dialog.css'

function OpenDetailDialog({ title, onClose, children, footer }) {
  const ref = useRef(null)
  const titleId = useId()

  useLayoutEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [])

  return createPortal(
    <dialog ref={ref} className="adm-detail-dialog" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose() }}>
      <div className="adm-detail-shell">
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="adm-btn adm-btn-ghost" onClick={onClose} autoFocus>Fechar</button>
        </header>
        <div className="adm-detail-content">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </dialog>,
    document.querySelector('.admin-shell') || document.body,
  )
}

export default function DetailDialog({ open, ...props }) {
  return open ? <OpenDetailDialog {...props} /> : null
}
