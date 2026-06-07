export interface ErrorCopy {
  headline: string
  message: string
}

const ERROR_MESSAGES: Record<number, ErrorCopy> = {
  400: {
    headline: 'Bad jump solution',
    message: 'That request did not parse in this system. Double-check the route and try again.',
  },
  403: {
    headline: 'Port authority denied',
    message: 'You do not have clearance for this hangar. Head back or contact an officer.',
  },
  404: {
    headline: 'Dead Space',
    message:
      'You seemed to have jumped to Dead Space. Pretty safe here, but nothing to see really.',
  },
  408: {
    headline: 'Quantum link timed out',
    message: 'The handshake took too long. Refresh and try the jump one more time.',
  },
  500: {
    headline: 'Quantum depleted',
    message:
      'Looks like you ran out of Quantum. Try a refresh — if the verse is still broken, head back to base.',
  },
  502: {
    headline: 'Relay offline',
    message: 'Upstream comms are down. Give it a minute, then punch it again.',
  },
  503: {
    headline: 'Station under maintenance',
    message: 'Services are temporarily offline. The crew is probably patching a hull breach.',
  },
}

export function getErrorCopy(statusCode: number): ErrorCopy {
  if (ERROR_MESSAGES[statusCode]) return ERROR_MESSAGES[statusCode]
  if (statusCode >= 500) return ERROR_MESSAGES[500]
  if (statusCode === 404) return ERROR_MESSAGES[404]
  if (statusCode >= 400) return ERROR_MESSAGES[400]
  return {
    headline: 'Signal lost',
    message: 'Something went wrong out there. Best course is to return to a known route.',
  }
}

export function resolveErrorStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { status?: number; statusCode?: number; code?: number }
    if (typeof maybe.status === 'number') return maybe.status
    if (typeof maybe.statusCode === 'number') return maybe.statusCode
    if (typeof maybe.code === 'number' && maybe.code >= 400 && maybe.code < 600) {
      return maybe.code
    }
  }
  return 500
}
