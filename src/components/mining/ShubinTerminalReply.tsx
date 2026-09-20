import React from 'react'
import {
  parseShubinTerminalLine,
  shubinLineTagSlug,
  type ShubinLinePart,
} from '../../lib/shubinTerminalReply'

function renderParts(parts: ShubinLinePart[]): React.ReactNode {
  return parts.map((part, index) => {
    if (part.kind === 'tag') {
      return (
        <span key={index} className={`advisor-shubin-tag advisor-shubin-tag-${part.slug}`}>
          {part.tag}
        </span>
      )
    }
    return (
      <span key={index} className="advisor-shubin-body">
        {part.text}
      </span>
    )
  })
}

export default function ShubinTerminalReply({ text }: { text: string }) {
  const lines = String(text ?? '').split('\n')
  return (
    <div className="advisor-shubin-reply">
      {lines.map((line, index) => {
        const slug = line ? shubinLineTagSlug(line) : null
        const lineClass = slug
          ? `advisor-shubin-line advisor-shubin-line-${slug}`
          : 'advisor-shubin-line'
        return (
          <div key={index} className={lineClass}>
            {line ? renderParts(parseShubinTerminalLine(line)) : '\u00a0'}
          </div>
        )
      })}
    </div>
  )
}
