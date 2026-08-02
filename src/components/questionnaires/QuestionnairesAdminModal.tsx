import React, { useCallback, useEffect, useState } from 'react'
import AppModal from '../layout/AppModal'
import QuestionnaireModal from './QuestionnaireModal'
import {
  type AnonymousResponseRow,
  type AvailabilityUnit,
  type QuestionnaireListItem,
  type QuestionnaireQuestion,
  type QuestionType,
  adminActivateQuestionnaire,
  adminArchiveQuestionnaire,
  adminDeleteQuestionnaire,
  adminGetQuestionnaire,
  adminListQuestionnaireResponses,
  adminListQuestionnaires,
  adminSaveQuestionnaire,
} from '../../lib/questionnaires'

type View = 'list' | 'edit' | 'responses'

type EditorState = {
  id: string | null
  title: string
  description: string
  audience_guest: boolean
  audience_registered: boolean
  audience_rsi_verified: boolean
  public_results: boolean
  results_published_at: string | null
  availability_value: number
  availability_unit: AvailabilityUnit
  questions: QuestionnaireQuestion[]
  status?: string
}

function emptyEditor(): EditorState {
  return {
    id: null,
    title: '',
    description: '',
    audience_guest: false,
    audience_registered: true,
    audience_rsi_verified: false,
    public_results: false,
    results_published_at: null,
    availability_value: 7,
    availability_unit: 'days',
    questions: [
      {
        prompt: '',
        required: true,
        question_type: 'text',
        config: { minLength: 0, maxLength: 500 },
      },
    ],
  }
}

type OptionTally = {
  questionId: string
  prompt: string
  questionType: 'radio' | 'checkbox'
  counts: Array<{ option: string; count: number }>
}

function buildOptionTallies(rows: AnonymousResponseRow[]): OptionTally[] {
  const byQuestion = new Map<
    string,
    { prompt: string; questionType: 'radio' | 'checkbox'; counts: Map<string, number> }
  >()

  for (const row of rows) {
    for (const answer of row.answers) {
      if (answer.question_type !== 'radio' && answer.question_type !== 'checkbox') continue
      let entry = byQuestion.get(answer.question_id)
      if (!entry) {
        entry = {
          prompt: answer.prompt,
          questionType: answer.question_type,
          counts: new Map(),
        }
        byQuestion.set(answer.question_id, entry)
      }
      if (answer.question_type === 'radio') {
        const opt = String(answer.value.option ?? '')
        if (!opt) continue
        entry.counts.set(opt, (entry.counts.get(opt) ?? 0) + 1)
      } else {
        const opts = Array.isArray(answer.value.options)
          ? (answer.value.options as string[])
          : []
        for (const opt of opts) {
          entry.counts.set(opt, (entry.counts.get(opt) ?? 0) + 1)
        }
      }
    }
  }

  return [...byQuestion.entries()].map(([questionId, entry]) => ({
    questionId,
    prompt: entry.prompt,
    questionType: entry.questionType,
    counts: [...entry.counts.entries()]
      .map(([option, count]) => ({ option, count }))
      .sort((a, b) => b.count - a.count || a.option.localeCompare(b.option)),
  }))
}

export default function QuestionnairesAdminModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>('list')
  const [items, setItems] = useState<QuestionnaireListItem[]>([])
  const [editor, setEditor] = useState<EditorState>(emptyEditor)
  const [responses, setResponses] = useState<AnonymousResponseRow[]>([])
  const [responsesTitle, setResponsesTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const refreshList = useCallback(async () => {
    setLoading(true)
    const result = await adminListQuestionnaires()
    setLoading(false)
    if (result.error) {
      setMessage({ type: 'err', text: result.error })
      return
    }
    setItems(result.data)
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  const openNew = () => {
    setEditor(emptyEditor())
    setView('edit')
    setMessage(null)
  }

  const openEdit = async (id: string) => {
    setLoading(true)
    const result = await adminGetQuestionnaire(id)
    setLoading(false)
    if (result.error || !result.data) {
      setMessage({ type: 'err', text: result.error || 'Failed to load' })
      return
    }
    const d = result.data
    setEditor({
      id: d.id,
      title: d.title,
      description: d.description,
      audience_guest: d.audience_guest,
      audience_registered: d.audience_registered,
      audience_rsi_verified: d.audience_rsi_verified,
      public_results: d.public_results ?? false,
      results_published_at: d.results_published_at ?? null,
      availability_value: d.availability_value,
      availability_unit: d.availability_unit,
      questions: d.questions.length
        ? d.questions
        : emptyEditor().questions,
      status: d.status,
    })
    setView('edit')
  }

  const openResponses = async (item: QuestionnaireListItem) => {
    setLoading(true)
    setResponsesTitle(item.title)
    const result = await adminListQuestionnaireResponses(item.id)
    setLoading(false)
    if (result.error) {
      setMessage({ type: 'err', text: result.error })
      return
    }
    setResponses(result.data)
    setView('responses')
  }

  /** Drop blank choice labels before save; require at least two for radio/checkbox. */
  const questionsForSave = (): QuestionnaireQuestion[] | null => {
    const cleaned = editor.questions.map((q) => {
      if (q.question_type !== 'radio' && q.question_type !== 'checkbox') return q
      const options = (q.config.options ?? []).map((o) => o.trim()).filter(Boolean)
      return { ...q, config: { ...q.config, options } }
    })
    for (const q of cleaned) {
      if (
        (q.question_type === 'radio' || q.question_type === 'checkbox') &&
        (q.config.options?.length ?? 0) < 2
      ) {
        setMessage({
          type: 'err',
          text: `“${q.prompt || 'Untitled question'}” needs at least two choices.`,
        })
        return null
      }
    }
    return cleaned
  }

  const saveDraft = async (opts?: { quiet?: boolean }): Promise<string | null> => {
    setMessage(null)
    const questions = questionsForSave()
    if (!questions) return null
    setLoading(true)
    const result = await adminSaveQuestionnaire({
      id: editor.id,
      title: editor.title,
      description: editor.description,
      audience_guest: editor.audience_guest,
      audience_registered: editor.audience_registered,
      audience_rsi_verified: editor.audience_rsi_verified,
      public_results: editor.public_results,
      availability_value: editor.availability_value,
      availability_unit: editor.availability_unit,
      questions,
    })
    if (result.error) {
      setLoading(false)
      setMessage({ type: 'err', text: result.error })
      return null
    }
    const id = result.id ?? editor.id
    if (!id) {
      setLoading(false)
      setMessage({ type: 'err', text: 'Save failed — no questionnaire id returned' })
      return null
    }
    setEditor((e) => ({
      ...e,
      id,
      status: e.status === 'active' ? 'active' : 'draft',
      questions,
    }))
    if (!opts?.quiet) {
      setMessage({
        type: 'ok',
        text: editor.status === 'active' ? 'Public poll setting saved' : 'Saved draft',
      })
      setLoading(false)
      await refreshList()
    }
    return id
  }

  const save = async () => {
    await saveDraft()
  }

  const activate = async () => {
    // Persist current editor state first (new drafts or unsaved edits).
    const id = await saveDraft({ quiet: true })
    if (!id) return

    const result = await adminActivateQuestionnaire(id)
    setLoading(false)
    if (result.error) {
      setMessage({ type: 'err', text: result.error })
      await refreshList()
      return
    }
    setMessage({ type: 'ok', text: 'Saved, activated, and notified eligible users' })
    setView('list')
    await refreshList()
  }

  const updateQuestion = (index: number, patch: Partial<QuestionnaireQuestion>) => {
    setEditor((prev) => {
      const questions = [...prev.questions]
      questions[index] = { ...questions[index], ...patch }
      return { ...prev, questions }
    })
  }

  const updateChoiceOption = (questionIndex: number, optionIndex: number, value: string) => {
    setEditor((prev) => {
      const questions = [...prev.questions]
      const q = questions[questionIndex]
      const options = [...(q.config.options ?? [])]
      options[optionIndex] = value
      questions[questionIndex] = { ...q, config: { ...q.config, options } }
      return { ...prev, questions }
    })
  }

  const addChoiceOption = (questionIndex: number) => {
    setEditor((prev) => {
      const questions = [...prev.questions]
      const q = questions[questionIndex]
      const options = [...(q.config.options ?? []), '']
      questions[questionIndex] = { ...q, config: { ...q.config, options } }
      return { ...prev, questions }
    })
  }

  const removeChoiceOption = (questionIndex: number, optionIndex: number) => {
    setEditor((prev) => {
      const questions = [...prev.questions]
      const q = questions[questionIndex]
      const options = (q.config.options ?? []).filter((_, i) => i !== optionIndex)
      questions[questionIndex] = {
        ...q,
        config: { ...q.config, options: options.length > 0 ? options : [''] },
      }
      return { ...prev, questions }
    })
  }

  const moveQuestion = (index: number, dir: -1 | 1) => {
    setEditor((prev) => {
      const next = index + dir
      if (next < 0 || next >= prev.questions.length) return prev
      const questions = [...prev.questions]
      const tmp = questions[index]
      questions[index] = questions[next]
      questions[next] = tmp
      return { ...prev, questions }
    })
  }

  return (
    <AppModal
      title="Questionnaires"
      subtitle="Super-admin · responses are anonymous"
      onClose={onClose}
      size="3xl"
      zIndex={70}
      headerExtra={
        view !== 'list' ? (
          <button
            type="button"
            onClick={() => {
              setView('list')
              setMessage(null)
              void refreshList()
            }}
            className="text-xs text-cyan-300 hover:text-cyan-200"
          >
            ← Back to list
          </button>
        ) : (
          <button
            type="button"
            onClick={openNew}
            className="site-btn-danger !px-2.5 !py-1 text-xs"
          >
            New
          </button>
        )
      }
    >
      {message && (
        <div
          className={`mb-3 ${
            message.type === 'ok'
              ? 'site-banner-success'
              : 'site-banner-error'
          }`}
        >
          {message.text}
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-2">
          {loading && items.length === 0 ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-slate-400 text-sm">No questionnaires yet.</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="site-surface p-3 flex flex-wrap gap-2 justify-between"
              >
                <div className="min-w-0">
                  <p className="text-slate-100 font-medium">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {item.status}
                    {item.public_results ? ' · public poll' : ''}
                    {item.results_published_at ? ' · results on ticker' : ''}
                    {' · '}
                    {item.availability_value} {item.availability_unit}
                    {item.available_until
                      ? ` · until ${new Date(item.available_until).toLocaleString()}`
                      : ''}
                    {' · '}
                    {item.question_count} q · {item.response_count} anon responses ·{' '}
                    {item.declined_count} declined
                  </p>
                  <p className="text-xs text-slate-500">
                    Audience:{' '}
                    {[
                      item.audience_guest ? 'guest' : null,
                      item.audience_registered ? 'registered' : null,
                      item.audience_rsi_verified ? 'RSI verified' : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 items-start">
                  <button
                    type="button"
                    className="site-btn-secondary !px-2 !py-1 text-xs"
                    onClick={() => void openEdit(item.id)}
                  >
                    {item.status === 'active' ? 'Public flag' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="site-btn-accent !px-2 !py-1 text-xs !text-cyan-200 !border-cyan-700/50"
                    onClick={() => setPreviewId(item.id)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className="site-btn-secondary !px-2 !py-1 text-xs"
                    onClick={() => void openResponses(item)}
                  >
                    Responses
                  </button>
                  {item.status === 'active' && (
                    <button
                      type="button"
                      className="site-btn-secondary !px-2 !py-1 text-xs !text-amber-200 !border-amber-700/50"
                      onClick={async () => {
                        const ok = confirm(
                          item.public_results
                            ? 'Archive this public poll? Option tallies will post to the Updates ticker.'
                            : 'Archive this questionnaire? Members can no longer fill it.'
                        )
                        if (!ok) return
                        const r = await adminArchiveQuestionnaire(item.id)
                        if (r.error) setMessage({ type: 'err', text: r.error })
                        else {
                          setMessage({
                            type: 'ok',
                            text: item.public_results
                              ? 'Archived — results posted to the Updates ticker'
                              : 'Archived',
                          })
                          void refreshList()
                        }
                      }}
                    >
                      Archive
                    </button>
                  )}
                  {item.status !== 'active' && (
                    <button
                      type="button"
                      className="site-btn-danger !px-2 !py-1 text-xs"
                      onClick={async () => {
                        if (!confirm('Delete this questionnaire?')) return
                        const r = await adminDeleteQuestionnaire(item.id)
                        if (r.error) setMessage({ type: 'err', text: r.error })
                        else void refreshList()
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {view === 'edit' && (
        <div className="space-y-4">
          {editor.status === 'active' && (
            <p className="site-banner-warn">Active questionnaires cannot be edited.</p>
          )}
          <label className="block">
            <span className="site-label">Title</span>
            <input
              value={editor.title}
              disabled={editor.status === 'active'}
              onChange={(e) => setEditor((p) => ({ ...p, title: e.target.value }))}
              className="site-input w-full px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="site-label">Description</span>
            <textarea
              value={editor.description}
              disabled={editor.status === 'active'}
              onChange={(e) => setEditor((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="site-textarea w-full px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            {(
              [
                ['audience_guest', 'Guests'],
                ['audience_registered', 'Registered'],
                ['audience_rsi_verified', 'RSI verified'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="site-checkbox"
                  disabled={editor.status === 'active'}
                  checked={editor[key]}
                  onChange={(e) => setEditor((p) => ({ ...p, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="site-surface px-3 py-2 space-y-1">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="site-checkbox"
                disabled={Boolean(editor.results_published_at)}
                checked={editor.public_results}
                onChange={(e) =>
                  setEditor((p) => ({ ...p, public_results: e.target.checked }))
                }
              />
              Public poll
            </label>
            <p className="site-hint !mt-0 pl-6">
              When the window ends or you archive it, option tallies post to the Updates ticker.
              Written answers stay private (counts only). Off by default.
              {editor.status === 'active'
                ? ' On an active poll you can still toggle this and Save draft — other fields stay locked.'
                : ''}
              {editor.results_published_at
                ? ' Results already posted — Public can no longer change.'
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-sm text-slate-300">
            <label>
              Available for
              <input
                type="number"
                min={1}
                max={3650}
                disabled={editor.status === 'active'}
                value={editor.availability_value}
                onChange={(e) =>
                  setEditor((p) => ({
                    ...p,
                    availability_value: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
                className="site-input mt-1 block w-24 px-2 py-1.5"
              />
            </label>
            <select
              disabled={editor.status === 'active'}
              value={editor.availability_unit}
              onChange={(e) =>
                setEditor((p) => ({
                  ...p,
                  availability_unit: e.target.value as AvailabilityUnit,
                }))
              }
              className="site-input px-2 py-1.5"
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
            </select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-200">Questions</p>
              {editor.status !== 'active' && (
                <button
                  type="button"
                  className="text-xs text-cyan-300"
                  onClick={() =>
                    setEditor((p) => ({
                      ...p,
                      questions: [
                        ...p.questions,
                        {
                          prompt: '',
                          required: true,
                          question_type: 'text',
                          config: { minLength: 0, maxLength: 500 },
                        },
                      ],
                    }))
                  }
                >
                  + Add question
                </button>
              )}
            </div>
            {editor.questions.map((q, index) => (
              <div
                key={index}
                className="site-surface p-3 space-y-2"
              >
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    disabled={editor.status === 'active'}
                    value={q.question_type}
                    onChange={(e) => {
                      const question_type = e.target.value as QuestionType
                      const config =
                        question_type === 'text'
                          ? { minLength: 0, maxLength: 500 }
                          : question_type === 'checkbox'
                            ? { options: ['', ''], minSelected: 1, maxSelected: 10 }
                            : { options: ['', ''] }
                      updateQuestion(index, { question_type, config })
                    }}
                    className="site-input px-2 py-1 text-xs"
                  >
                    <option value="text">Text</option>
                    <option value="radio">Radio (one)</option>
                    <option value="checkbox">Checkbox (multi)</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      className="site-checkbox"
                      disabled={editor.status === 'active'}
                      checked={q.required}
                      onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    className="text-xs text-slate-400"
                    disabled={editor.status === 'active'}
                    onClick={() => moveQuestion(index, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="text-xs text-slate-400"
                    disabled={editor.status === 'active'}
                    onClick={() => moveQuestion(index, 1)}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-400 ml-auto"
                    disabled={editor.status === 'active' || editor.questions.length <= 1}
                    onClick={() =>
                      setEditor((p) => ({
                        ...p,
                        questions: p.questions.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
                <input
                  disabled={editor.status === 'active'}
                  value={q.prompt}
                  onChange={(e) => updateQuestion(index, { prompt: e.target.value })}
                  placeholder="Question prompt"
                  className="site-input w-full px-2 py-1.5 text-sm"
                />
                {q.question_type === 'text' && (
                  <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                    <label>
                      Min chars
                      <input
                        type="number"
                        min={0}
                        disabled={editor.status === 'active'}
                        value={q.config.minLength ?? 0}
                        onChange={(e) =>
                          updateQuestion(index, {
                            config: {
                              ...q.config,
                              minLength: Math.max(0, Number(e.target.value) || 0),
                            },
                          })
                        }
                        className="site-input ml-1 w-20 px-1 py-0.5"
                      />
                    </label>
                    <label>
                      Max chars
                      <input
                        type="number"
                        min={1}
                        disabled={editor.status === 'active'}
                        value={q.config.maxLength ?? 500}
                        onChange={(e) =>
                          updateQuestion(index, {
                            config: {
                              ...q.config,
                              maxLength: Math.max(1, Number(e.target.value) || 1),
                            },
                          })
                        }
                        className="site-input ml-1 w-20 px-1 py-0.5"
                      />
                    </label>
                  </div>
                )}
                {(q.question_type === 'radio' || q.question_type === 'checkbox') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-400">
                        Choices ({q.question_type === 'radio' ? 'pick one' : 'pick many'})
                      </p>
                      {editor.status !== 'active' && (
                        <button
                          type="button"
                          className="text-xs text-cyan-300 hover:text-cyan-200"
                          onClick={() => addChoiceOption(index)}
                        >
                          + Add choice
                        </button>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {(q.config.options ?? ['']).map((opt, optIndex) => (
                        <li key={optIndex} className="flex items-center gap-2">
                          <input
                            type={q.question_type === 'radio' ? 'radio' : 'checkbox'}
                            disabled
                            tabIndex={-1}
                            aria-hidden
                            className={`shrink-0 opacity-60 ${q.question_type === 'radio' ? 'site-radio' : 'site-checkbox'}`}
                          />
                          <input
                            type="text"
                            disabled={editor.status === 'active'}
                            value={opt}
                            onChange={(e) => updateChoiceOption(index, optIndex, e.target.value)}
                            placeholder={`Choice ${optIndex + 1}`}
                            className="site-input min-w-0 flex-1 px-2 py-1.5 text-sm"
                          />
                          {editor.status !== 'active' && (
                            <button
                              type="button"
                              className="site-btn-ghost shrink-0 !px-1 !py-0.5 text-xs text-red-400 hover:text-red-300"
                              disabled={(q.config.options?.length ?? 0) <= 1}
                              onClick={() => removeChoiceOption(index, optIndex)}
                              title="Remove choice"
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {q.question_type === 'checkbox' && (
                  <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                    <label>
                      Min selected
                      <input
                        type="number"
                        min={0}
                        disabled={editor.status === 'active'}
                        value={q.config.minSelected ?? (q.required ? 1 : 0)}
                        onChange={(e) =>
                          updateQuestion(index, {
                            config: {
                              ...q.config,
                              minSelected: Math.max(0, Number(e.target.value) || 0),
                            },
                          })
                        }
                        className="site-input ml-1 w-20 px-1 py-0.5"
                      />
                    </label>
                    <label>
                      Max selected
                      <input
                        type="number"
                        min={1}
                        disabled={editor.status === 'active'}
                        value={q.config.maxSelected ?? 10}
                        onChange={(e) =>
                          updateQuestion(index, {
                            config: {
                              ...q.config,
                              maxSelected: Math.max(1, Number(e.target.value) || 1),
                            },
                          })
                        }
                        className="site-input ml-1 w-20 px-1 py-0.5"
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {editor.status !== 'active' && (
              <>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void save()}
                  className="site-btn-secondary"
                >
                  Save draft
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void activate()}
                  title="Saves the current form, then activates and notifies eligible users"
                  className="site-btn-success"
                >
                  Activate & notify
                </button>
              </>
            )}
            {editor.status === 'active' && (
              <button
                type="button"
                disabled={loading || Boolean(editor.results_published_at)}
                onClick={async () => {
                  const id = await saveDraft()
                  if (id) {
                    setMessage({ type: 'ok', text: 'Public poll setting saved' })
                    setView('list')
                    await refreshList()
                  }
                }}
                className="site-btn-secondary"
              >
                Save Public setting
              </button>
            )}
            {editor.id && (
              <button
                type="button"
                disabled={loading}
                onClick={() => setPreviewId(editor.id)}
                className="site-btn-accent !text-cyan-200 !border-cyan-700/50"
              >
                Preview as user
              </button>
            )}
          </div>
        </div>
      )}

      {view === 'responses' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Anonymous responses for <span className="text-white font-medium">{responsesTitle}</span>
          </p>
          <p className="text-xs text-slate-500">Responses are anonymous — no user identity is shown.</p>
          {responses.length === 0 ? (
            <p className="text-slate-500 text-sm">No responses yet.</p>
          ) : (
            <ResponsesWithTallies responses={responses} />
          )}
        </div>
      )}

      {previewId && (
        <QuestionnaireModal
          questionnaireId={previewId}
          isGuest={false}
          previewMode
          onClose={() => setPreviewId(null)}
        />
      )}
    </AppModal>
  )
}

function ResponsesWithTallies({ responses }: { responses: AnonymousResponseRow[] }) {
  const tallies = buildOptionTallies(responses)
  return (
    <>
      {tallies.length > 0 && (
        <div className="site-surface p-3 space-y-3">
          <p className="text-sm font-medium text-slate-200">Option tallies</p>
          {tallies.map((tally) => (
            <div key={tally.questionId}>
              <p className="text-xs text-slate-400 mb-1">
                {tally.prompt}{' '}
                <span className="text-slate-600">({tally.questionType})</span>
              </p>
              <ul className="space-y-0.5">
                {tally.counts.map((row) => (
                  <li
                    key={row.option}
                    className="flex justify-between gap-3 text-sm text-slate-200"
                  >
                    <span className="truncate">{row.option}</span>
                    <span className="tabular-nums text-slate-400 shrink-0">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {responses.map((r, i) => (
        <div key={r.id} className="site-surface p-3">
          <p className="text-xs text-slate-500 mb-2">
            Response #{responses.length - i} · {new Date(r.submitted_at).toLocaleString()}
          </p>
          <ul className="space-y-2">
            {r.answers.map((a) => (
              <li key={a.question_id} className="text-sm">
                <p className="text-slate-400">{a.prompt}</p>
                <p className="text-slate-100">
                  {a.question_type === 'text' && String(a.value.text ?? '')}
                  {a.question_type === 'radio' && String(a.value.option ?? '')}
                  {a.question_type === 'checkbox' &&
                    (Array.isArray(a.value.options)
                      ? (a.value.options as string[]).join(', ')
                      : '')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}
