import { useEffect, useMemo, useState } from 'react'
import './App.css'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const FIREBASE_DEADLINES_ENDPOINT =
  'https://todolist-database-aae1c-default-rtdb.firebaseio.com/deadlines'

function normalizeDate(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function getDaysLeft(deadline) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = normalizeDate(deadline)
  return Math.ceil((dueDate - today) / MS_PER_DAY)
}

function toCommandName(label) {
  return label.trim().replace(/\s+/g, '_')
}

function toWidgetList(firebaseData) {
  if (!firebaseData) {
    return []
  }

  if (Array.isArray(firebaseData)) {
    return firebaseData
      .map((item, index) => ({
        id: String(index),
        label: item?.label,
        deadline: item?.deadline,
      }))
      .filter((item) => typeof item.label === 'string' && typeof item.deadline === 'string')
  }

  return Object.entries(firebaseData)
    .map(([id, item]) => ({
      id,
      label: item?.label,
      deadline: item?.deadline,
    }))
    .filter((item) => typeof item.label === 'string' && typeof item.deadline === 'string')
}

function App() {
  const [form, setForm] = useState({
    label: '',
    deadline: '',
  })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({
    label: '',
    deadline: '',
  })

  const [widgets, setWidgets] = useState([])
  const [isSyncLoading, setIsSyncLoading] = useState(true)
  const [syncError, setSyncError] = useState('')

  const canCreate = form.label.trim() !== '' && form.deadline !== ''
  const canSaveEdit = editForm.label.trim() !== '' && editForm.deadline !== ''

  const preparedWidgets = useMemo(
    () =>
      widgets
        .map((widget) => ({
          ...widget,
          daysLeft: getDaysLeft(widget.deadline),
        }))
        .filter((widget) => widget.daysLeft >= 0)
        .sort((a, b) => normalizeDate(a.deadline) - normalizeDate(b.deadline)),
    [widgets],
  )

  useEffect(() => {
    let isDisposed = false

    const loadWidgets = async () => {
      setIsSyncLoading(true)
      setSyncError('')

      try {
        const response = await fetch(`${FIREBASE_DEADLINES_ENDPOINT}.json`)
        if (!response.ok) {
          throw new Error('load_failed')
        }

        const data = await response.json()
        if (!isDisposed) {
          setWidgets(toWidgetList(data))
        }
      } catch {
        if (!isDisposed) {
          setSyncError('unable_to_load_remote_deadlines')
        }
      } finally {
        if (!isDisposed) {
          setIsSyncLoading(false)
        }
      }
    }

    loadWidgets()

    return () => {
      isDisposed = true
    }
  }, [])

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleAddWidget = async (event) => {
    event.preventDefault()
    if (!canCreate) {
      return
    }

    const payload = {
      label: form.label.trim(),
      deadline: form.deadline,
    }

    setSyncError('')

    try {
      const response = await fetch(`${FIREBASE_DEADLINES_ENDPOINT}.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('save_failed')
      }

      const result = await response.json()
      if (!result?.name) {
        throw new Error('missing_key')
      }

      setWidgets((current) => [
        ...current,
        {
          id: result.name,
          ...payload,
        },
      ])

      setForm((current) => ({
        ...current,
        label: '',
        deadline: '',
      }))
      setIsCreateOpen(false)
    } catch {
      setSyncError('unable_to_save_new_deadline')
    }
  }

  const handleOpenCreate = () => {
    setIsCreateOpen(true)
  }

  const handleCloseCreate = () => {
    setForm({
      label: '',
      deadline: '',
    })
    setIsCreateOpen(false)
  }

  const handleDeleteWidget = async (id) => {
    setSyncError('')

    try {
      const response = await fetch(`${FIREBASE_DEADLINES_ENDPOINT}/${id}.json`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('delete_failed')
      }

      setWidgets((current) => current.filter((widget) => widget.id !== id))
      if (editingId === id) {
        setEditingId(null)
      }
    } catch {
      setSyncError('unable_to_delete_deadline')
    }
  }

  const handleStartEdit = (widget) => {
    setEditingId(widget.id)
    setEditForm({
      label: widget.label,
      deadline: widget.deadline,
    })
  }

  const handleEditChange = (event) => {
    const { name, value } = event.target
    setEditForm((current) => ({ ...current, [name]: value }))
  }

  const handleSaveEdit = async (id) => {
    if (!canSaveEdit) {
      return
    }

    const payload = {
      label: editForm.label.trim(),
      deadline: editForm.deadline,
    }

    setSyncError('')

    try {
      const response = await fetch(`${FIREBASE_DEADLINES_ENDPOINT}/${id}.json`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('update_failed')
      }

      setWidgets((current) =>
        current.map((widget) =>
          widget.id === id
            ? {
                ...widget,
                ...payload,
              }
            : widget,
        ),
      )
      setEditingId(null)
    } catch {
      setSyncError('unable_to_update_deadline')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="sys-tag">[SYS_TIME_LEFT]</p>
        <h1>&gt; launch_countdown_widgets.exe</h1>
        <p className="sys-subtitle">
          Build deadline widgets and monitor days remaining like a terminal feed.
        </p>
      </header>

      <section className="create-bar" aria-label="Create widget controls">
        <p className={`sync-status${syncError ? ' sync-status-error' : ''}`}>
          {isSyncLoading
            ? '[SYNC_LOADING_REMOTE_DATABASE]'
            : syncError
              ? `[SYNC_ERROR] ${syncError}`
              : '[SYNC_REMOTE_DATABASE_CONNECTED]'}
        </p>
        {!isCreateOpen ? (
          <button type="button" className="create-toggle-btn" onClick={handleOpenCreate}>
            &gt; open_create_widget()
          </button>
        ) : (
          <form className="command-form command-form-minimal" onSubmit={handleAddWidget}>
            <p className="form-mode">[MINIMAL_CREATE_MODE]</p>
            <label>
              &gt; widget_name
              <input
                name="label"
                value={form.label}
                onChange={handleFormChange}
                placeholder="CENG3420 Lab"
              />
            </label>

            <label>
              &gt; deadline_yyyy_mm_dd
              <input
                name="deadline"
                type="date"
                value={form.deadline}
                onChange={handleFormChange}
              />
            </label>

            <div className="create-actions">
              <button type="submit" disabled={!canCreate}>
                &gt; create_widget()
              </button>
              <button type="button" onClick={handleCloseCreate}>
                &gt; close_create()
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="widget-grid">
        {preparedWidgets.length === 0 && !isSyncLoading ? (
          <article className="ios-widget" aria-label="No countdown widgets">
            <p className="command-title">&gt; no_widgets_found</p>
            <p className="widget-status">[REMOTE_DATABASE_EMPTY]</p>
            <p className="widget-date">create your first deadline to begin tracking.</p>
          </article>
        ) : (
          preparedWidgets.map((widget) => {
            if (widget.daysLeft < 0) {
              return null
            }

            return (
              <article
                key={widget.id}
                className={`ios-widget${
                  widget.daysLeft === 0
                    ? ' widget-due-today'
                    : widget.daysLeft === 1
                      ? ' widget-warning'
                      : ''
                }`}
                aria-label={`${widget.label} countdown widget`}
              >
              {editingId === widget.id ? (
                <>
                  <p className="widget-status">[EDIT_MODE]</p>
                  <div className="widget-edit-form">
                    <label>
                      &gt; widget_name
                      <input
                        name="label"
                        value={editForm.label}
                        onChange={handleEditChange}
                        placeholder="CENG3420 Lab"
                      />
                    </label>
                    <label>
                      &gt; deadline_yyyy_mm_dd
                      <input
                        name="deadline"
                        type="date"
                        value={editForm.deadline}
                        onChange={handleEditChange}
                      />
                    </label>
                  </div>
                  <div className="widget-actions">
                    <button
                      type="button"
                      className="widget-btn"
                      onClick={() => handleSaveEdit(widget.id)}
                      disabled={!canSaveEdit}
                    >
                      save
                    </button>
                    <button type="button" className="widget-btn" onClick={handleCancelEdit}>
                      cancel
                    </button>
                    <button
                      type="button"
                      className="widget-btn widget-btn-delete"
                      onClick={() => handleDeleteWidget(widget.id)}
                    >
                      delete
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="command-title">&gt; {toCommandName(widget.label)}</p>
                  <p className="widget-status">[SYS_TIME_LEFT]</p>
                  <p className="widget-count">{widget.daysLeft}</p>
                  <p className="widget-unit">DAYS</p>
                  <p className="widget-date">target: {widget.deadline}</p>
                  <div className="widget-actions">
                    <button
                      type="button"
                      className="widget-btn"
                      onClick={() => handleStartEdit(widget)}
                    >
                      edit
                    </button>
                    <button
                      type="button"
                      className="widget-btn widget-btn-delete"
                      onClick={() => handleDeleteWidget(widget.id)}
                    >
                      delete
                    </button>
                  </div>
                </>
              )}
              </article>
            )
          })
        )}
      </section>
    </main>
  )
}

export default App
