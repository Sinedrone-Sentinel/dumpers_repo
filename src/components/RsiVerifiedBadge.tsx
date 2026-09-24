import React from 'react'

interface RsiVerifiedBadgeProps {
  size?: 'sm' | 'md'
  className?: string
  /** Citizen iD links use gold. Legacy RSI verification stays cyan. */
  tone?: 'legacy' | 'citizenid'
}

export default function RsiVerifiedBadge({
  size = 'sm',
  className = '',
  tone = 'legacy',
}: RsiVerifiedBadgeProps) {
  const sizeClasses = size === 'sm' 
    ? 'text-[9px] px-1 py-0.5 gap-0.5' 
    : 'text-[10px] px-1.5 py-0.5 gap-1'
  
  const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
  const toneClasses = tone === 'citizenid'
    ? 'bg-amber-950/70 border border-amber-400/55 text-amber-300'
    : 'bg-cyan-900/50 border border-cyan-500/30 text-cyan-400'

  return (
    <span 
      className={`inline-flex items-center rounded font-semibold ${toneClasses} ${sizeClasses} ${className}`}
      title={tone === 'citizenid' ? 'Verified with Citizen iD' : 'Verified RSI Handle'}
    >
      <span className="italic">RSI</span>
      <svg className={iconSize} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </span>
  )
}
