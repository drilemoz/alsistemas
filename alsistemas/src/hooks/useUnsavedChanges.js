import React from 'react'
import { useEffect, useCallback } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * useUnsavedChanges(isDirty)
 *
 * Bloqueia navegação in-app e fechamento de aba quando há alterações não salvas.
 *
 * Retorna:
 *   - showPrompt  : boolean — true quando o usuário tentou navegar com alterações pendentes
 *   - confirm()   : avança para a rota destino (descarta alterações)
 *   - cancel()    : cancela a navegação (mantém o usuário na página)
 *
 * Uso:
 *   const { showPrompt, confirm, cancel } = useUnsavedChanges(isDirty)
 *
 *   // No JSX, exibir modal quando showPrompt=true
 */
export function useUnsavedChanges(isDirty) {
  // Intercepta navegação pelo React Router
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  )

  // Intercepta fechamento/atualização da aba
  useEffect(() => {
    if (!isDirty) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = '' // exige para Chrome/Edge mostrarem o diálogo nativo
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const confirm = useCallback(() => {
    if (blocker.state === 'blocked') blocker.proceed()
  }, [blocker])

  const cancel = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  return {
    showPrompt: blocker.state === 'blocked',
    confirm,
    cancel,
  }
}
