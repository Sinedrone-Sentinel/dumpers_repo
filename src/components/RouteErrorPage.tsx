import React from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import ErrorLandingPage from './ErrorLandingPage'
import { resolveErrorStatusCode } from '../lib/errorMessages'

export function RouteNotFoundPage() {
  return <ErrorLandingPage statusCode={404} />
}

export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  return (
    <ErrorLandingPage statusCode={resolveErrorStatusCode(error)} onRetry={() => reset()} />
  )
}
