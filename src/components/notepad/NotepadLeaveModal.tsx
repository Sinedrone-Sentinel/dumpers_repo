import AppModal from '../layout/AppModal'
import { useNotepad } from '../../contexts/NotepadContext'

export default function NotepadLeaveModal() {
  const { pendingLeave, confirmLeave, cancelLeave } = useNotepad()
  if (!pendingLeave) return null

  return (
    <AppModal
      title="Unsaved notepad changes"
      onClose={cancelLeave}
      size="sm"
      zIndex={80}
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="site-btn-secondary px-4 py-2" onClick={cancelLeave}>
            Cancel
          </button>
          <button type="button" className="site-btn-danger px-4 py-2" onClick={confirmLeave}>
            Continue
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-300">
        Your notepad has changes you haven&apos;t saved. Continue anyway and lose them, or cancel
        and press Save first.
      </p>
    </AppModal>
  )
}
