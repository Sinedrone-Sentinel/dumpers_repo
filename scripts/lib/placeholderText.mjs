/**
 * CIG ships unfinished strings as `@LOC_PLACEHOLDER` ("<= PLACEHOLDER =>"),
 * `@LOC_UNINITIALIZED`, or "... Placeholder text". None of them may reach a member.
 */

const PLACEHOLDER_PATTERNS = [
  /<=\s*PLACEHOLDER\s*=>/i,
  /@LOC_(PLACEHOLDER|UNINITIALIZED|EMPTY)\b/i,
  /^LOC_(PLACEHOLDER|UNINITIALIZED|EMPTY)$/i,
  /\bplaceholder text\b/i,
  /^\s*placeholder\s*$/i,
]

/** Fields that hold ids, keys or file names, never text a member reads. */
const INTERNAL_FIELDS = new Set([
  'id',
  'uuid',
  'file',
  'name',
  'internalName',
  'entityClass',
  'defaultEntityClass',
  'debugName',
  'slotDebugName',
  'recordName',
  'path',
  'tags',
  'requiredTags',
])

export function isPlaceholderText(value) {
  if (typeof value !== 'string') return false
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value))
}

function isInternalField(key) {
  return INTERNAL_FIELDS.has(key) || /Key$/.test(key) || /Path$/.test(key)
}

/**
 * Walk parsed JSON and return `path: value` for every member-facing string that is
 * still a localization placeholder.
 */
export function findPlaceholderLeaks(root, rootLabel = '') {
  const leaks = []
  const stack = [[root, rootLabel]]
  while (stack.length) {
    const [node, path] = stack.pop()
    if (Array.isArray(node)) {
      node.forEach((item, i) => stack.push([item, `${path}[${i}]`]))
      continue
    }
    if (!node || typeof node !== 'object') continue
    for (const [key, value] of Object.entries(node)) {
      if (isInternalField(key)) continue
      const childPath = path ? `${path}.${key}` : key
      if (typeof value === 'string') {
        if (isPlaceholderText(value)) leaks.push({ path: childPath, value })
      } else if (value && typeof value === 'object') {
        stack.push([value, childPath])
      }
    }
  }
  return leaks
}
