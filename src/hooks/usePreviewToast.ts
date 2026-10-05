import { useOutletContext } from 'react-router-dom'
import type { ToastApi } from '../types/app'

export function usePreviewToast() {
  return useOutletContext<ToastApi>()
}
