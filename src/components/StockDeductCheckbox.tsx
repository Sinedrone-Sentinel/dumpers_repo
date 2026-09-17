interface StockDeductCheckboxProps {
  checked: boolean
  enabled: boolean
  fits: boolean
  hint: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export default function StockDeductCheckbox({
  checked,
  enabled,
  fits,
  hint,
  disabled = false,
  onChange,
}: StockDeductCheckboxProps) {
  const canToggle = enabled && !disabled
  return (
    <label
      className={`mt-2 flex items-start gap-2 ${canToggle ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        className="site-checkbox mt-0.5"
        checked={checked}
        disabled={!canToggle}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="text-slate-200 text-xs font-medium">Deduct from Tracked Resources</span>
        {hint ? <span className="site-hint block !mt-0.5">{hint}</span> : null}
        {!fits && checked ? (
          <span className="site-error-text block mt-0.5">
            Tracked Resources no longer covers this line at these qualities.
          </span>
        ) : null}
        {!enabled && !checked ? (
          <span className="site-hint block !mt-0.5">
            Not enough Tracked Resources at these qualities.
          </span>
        ) : null}
      </span>
    </label>
  )
}
