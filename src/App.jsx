import { useMemo, useState } from 'react'
import './App.css'

const MS_PER_DAY = 1000 * 60 * 60 * 24

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

function App() {
  const [form, setForm] = useState({
    label: 'CENG3420 Lab',
    deadline: '',
    color: 'green',
  })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({
    label: '',
    deadline: '',
    color: 'green',
  })

  const [widgets, setWidgets] = useState([
    { id: 1, label: 'CENG3420 Lab', deadline: '2026-04-10', color: 'green' },
    { id: 2, label: 'Project Alpha', deadline: '2026-04-18', color: 'amber' },
  ])

  const canCreate = form.label.trim() !== '' && form.deadline !== ''
  const canSaveEdit = editForm.label.trim() !== '' && editForm.deadline !== ''

  const preparedWidgets = useMemo(
    () =>
      widgets
        .map((widget) => ({
          ...widget,
          daysLeft: getDaysLeft(widget.deadline),
        }))
        .sort((a, b) => normalizeDate(a.deadline) - normalizeDate(b.deadline)),
    [widgets],
  )

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleAddWidget = (event) => {
    event.preventDefault()
    if (!canCreate) {
      return
    }

    setWidgets((current) => [
      ...current,
      {
        id: Date.now(),
        label: form.label.trim(),
        deadline: form.deadline,
        color: form.color,
      },
    ])

    setForm((current) => ({
      ...current,
      label: '',
      deadline: '',
    }))
  }

  const handleDeleteWidget = (id) => {
    setWidgets((current) => current.filter((widget) => widget.id !== id))
    if (editingId === id) {
      setEditingId(null)
    }
  }

  const handleStartEdit = (widget) => {
    setEditingId(widget.id)
    setEditForm({
      label: widget.label,
      deadline: widget.deadline,
      color: widget.color,
    })
  }

  const handleEditChange = (event) => {
    const { name, value } = event.target
    setEditForm((current) => ({ ...current, [name]: value }))
  }

  const handleSaveEdit = (id) => {
    if (!canSaveEdit) {
      return
    }

    setWidgets((current) =>
      current.map((widget) =>
        widget.id === id
          ? {
              ...widget,
              label: editForm.label.trim(),
              deadline: editForm.deadline,
              color: editForm.color,
            }
          : widget,
      ),
    )
    setEditingId(null)
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

      <form className="command-form" onSubmit={handleAddWidget}>
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

        <label>
          &gt; color_profile
          <select name="color" value={form.color} onChange={handleFormChange}>
            <option value="green">TERMINAL_GREEN</option>
            <option value="amber">TERMINAL_AMBER</option>
          </select>
        </label>

        <button type="submit" disabled={!canCreate}>
          &gt; create_widget()
        </button>
      </form>

      <section className="widget-grid">
        {preparedWidgets.map((widget) => (
          <article
            key={widget.id}
            className={`ios-widget widget-${widget.color}`}
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
                  <label>
                    &gt; color_profile
                    <select name="color" value={editForm.color} onChange={handleEditChange}>
                      <option value="green">TERMINAL_GREEN</option>
                      <option value="amber">TERMINAL_AMBER</option>
                    </select>
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
                <p className="widget-count">
                  {widget.daysLeft >= 0 ? widget.daysLeft : Math.abs(widget.daysLeft)}
                </p>
                <p className="widget-unit">{widget.daysLeft >= 0 ? 'DAYS' : 'DAYS OVERDUE'}</p>
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
        ))}
      </section>
    </main>
  )
}

export default App
