import React, { useEffect, useState } from 'react'
import AppModal from '../layout/AppModal'
import {
  type AnswerMap,
  type FillQuestionnaire,
  adminGetQuestionnaire,
  declineQuestionnaire,
  getQuestionnaireForFill,
  submitQuestionnaireResponse,
} from '../../lib/questionnaires'

type Props = {
  questionnaireId: string
  isGuest: boolean
  /** Super-admin WYSIWYG: same UI as members, no submit/decline side effects. */
  previewMode?: boolean
  onClose: () => void
  onResolved?: () => void
}

export default function QuestionnaireModal({
  questionnaireId,
  isGuest,
  previewMode = false,
  onClose,
  onResolved,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FillQuestionnaire | null>(null)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [confirmDecline, setConfirmDecline] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setAnswers({})

    const load = previewMode
      ? adminGetQuestionnaire(questionnaireId).then((result) => {
          if (result.error || !result.data) {
            return { data: null as FillQuestionnaire | null, error: result.error || 'Unable to load' }
          }
          const d = result.data
          return {
            data: {
              id: d.id,
              title: d.title,
              description: d.description,
              available_until: d.available_until,
              questions: d.questions,
            } satisfies FillQuestionnaire,
            error: undefined as string | undefined,
          }
        })
      : getQuestionnaireForFill(questionnaireId, isGuest)

    void load.then((result) => {
      if (cancelled) return
      if (result.error || !result.data) {
        setError(result.error || 'Unable to load questionnaire')
        setData(null)
      } else {
        setData(result.data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [questionnaireId, isGuest, previewMode])

  const validate = (): string | null => {
    if (!data) return 'Not loaded'
    for (const q of data.questions) {
      const a = answers[q.id!]
      if (q.question_type === 'text') {
        const text = (a?.text ?? '').trim()
        if (q.required && !text) return `Please answer: ${q.prompt}`
        const max = q.config.maxLength ?? 5000
        const min = q.config.minLength ?? 0
        if (text && (text.length < min || text.length > max)) {
          return `Text length for “${q.prompt}” must be between ${min} and ${max}`
        }
      } else if (q.question_type === 'radio') {
        if (q.required && !a?.option) return `Please select an option for: ${q.prompt}`
      } else if (q.question_type === 'checkbox') {
        const selected = a?.options ?? []
        const min = q.config.minSelected ?? (q.required ? 1 : 0)
        const max = q.config.maxSelected ?? 100
        if (selected.length < min || selected.length > max) {
          return `Select between ${min} and ${max} options for: ${q.prompt}`
        }
      }
    }
    return null
  }

  const handleSubmit = async () => {
    if (previewMode) {
      const validationError = validate()
      setError(
        validationError
          ? `Preview validation: ${validationError}`
          : 'Preview only — answers are not saved.'
      )
      return
    }
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    const result = await submitQuestionnaireResponse(questionnaireId, answers, isGuest)
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onResolved?.()
    onClose()
  }

  const handleDecline = async () => {
    if (previewMode) {
      setConfirmDecline(false)
      setError('Preview only — Decline is not recorded.')
      return
    }
    setSaving(true)
    setError(null)
    const result = await declineQuestionnaire(questionnaireId, isGuest)
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onResolved?.()
    onClose()
  }

  return (
    <AppModal
      title={data?.title || 'Questionnaire'}
      subtitle={
        previewMode
          ? 'Preview — same UI members/guests see. Answers are not saved.'
          : 'Your answers are anonymous.'
      }
      onClose={onClose}
      size="xl"
      zIndex={80}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => setConfirmDecline(true)}
            className="site-btn-ghost px-3 py-2 text-sm disabled:opacity-50"
          >
            Decline
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="site-btn-secondary px-3 py-2 text-sm"
            >
              {previewMode ? 'Close preview' : 'Close'}
            </button>
            <button
              type="button"
              disabled={saving || loading || !data}
              onClick={() => void handleSubmit()}
              className="site-btn-success px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : previewMode ? 'Try Submit' : 'Submit'}
            </button>
          </div>
        </div>
      }
    >
      {loading && <p className="text-slate-400 text-sm">Loading…</p>}
      {error && (
        <div className="mb-3 site-banner-error p-2 text-sm">
          {error}
        </div>
      )}
      {data && (
        <div className="space-y-5">
          {data.description ? (
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{data.description}</p>
          ) : null}
          <p className="text-xs text-slate-500">
            {previewMode
              ? 'Super-admin preview of the member/guest fill experience. Try the controls; nothing is stored.'
              : 'Answers are anonymous. Decline if you do not want to participate — you will not be asked again for this questionnaire.'}
          </p>
          {data.questions.map((q) => {
            const qid = q.id!
            const options = q.config.options ?? []
            return (
              <div key={qid} className="site-surface p-3">
                <p className="text-sm text-slate-100 font-medium mb-2">
                  {q.prompt}
                  {q.required ? <span className="text-red-400 ml-1">*</span> : null}
                </p>
                {q.question_type === 'text' && (
                  <textarea
                    value={answers[qid]?.text ?? ''}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [qid]: { text: e.target.value },
                      }))
                    }
                    rows={3}
                    maxLength={q.config.maxLength ?? 5000}
                    className="site-textarea w-full px-3 py-2 text-sm"
                  />
                )}
                {q.question_type === 'radio' && (
                  <div className="space-y-1.5">
                    {options.map((opt, optIndex) => (
                      <label
                        key={`${qid}-r-${optIndex}`}
                        className="flex items-center gap-2 text-sm text-slate-300"
                      >
                        <input
                          type="radio"
                          name={`q-${qid}`}
                          checked={answers[qid]?.option === opt}
                          onChange={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              [qid]: { option: opt },
                            }))
                          }
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
                {q.question_type === 'checkbox' && (
                  <div className="space-y-1.5">
                    {options.map((opt, optIndex) => {
                      const selected = answers[qid]?.options ?? []
                      const checked = selected.includes(opt)
                      return (
                        <label
                          key={`${qid}-c-${optIndex}`}
                          className="flex items-center gap-2 text-sm text-slate-300"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? selected.filter((x) => x !== opt)
                                : [...selected, opt]
                              setAnswers((prev) => ({
                                ...prev,
                                [qid]: { options: next },
                              }))
                            }}
                          />
                          {opt}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {confirmDecline && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
          <div className="site-modal-shell max-w-md w-full p-4 space-y-3">
            <p className="text-slate-100 font-medium">Decline this questionnaire?</p>
            <p className="text-sm text-slate-400">
              You will not be asked about this questionnaire again.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="site-btn-secondary px-3 py-1.5 text-sm"
                onClick={() => setConfirmDecline(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="site-btn-danger px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={() => void handleDecline()}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </AppModal>
  )
}
