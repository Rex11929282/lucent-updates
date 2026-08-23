import { memo } from 'react'

function GlassSheen({ cfg }) {
  const mode = ['oval', 'droplet', 'arc'].includes(cfg.sheenMode) ? cfg.sheenMode : 'none'
  if (mode === 'none') return null
  return <div className={`glass-sheen sheen-${mode} sheen-${cfg.sheenDirection === 'rtl' ? 'rtl' : 'ltr'}`} aria-hidden><i /></div>
}

export default memo(GlassSheen)
