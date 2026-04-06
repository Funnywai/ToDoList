import { useEffect, useMemo, useState } from 'react'
import './App.css'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const FIREBASE_DEADLINES_ENDPOINT =
  'https://todolist-database-aae1c-default-rtdb.firebaseio.com/deadlines'
const CALENDAR_WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
  return label.trim().replace(/\s+/g, ' ')
}

function getTodayIsoMonth() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function getTodayIsoDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftIsoMonth(isoMonth, monthOffset) {
  const [yearString, monthString] = isoMonth.split('-')
  const year = Number(yearString)
  const month = Number(monthString)

  if (!yearString || !monthString || Number.isNaN(year) || Number.isNaN(month)) {
    return getTodayIsoMonth()
  }

  const shiftedDate = new Date(year, month - 1 + monthOffset, 1)
  const shiftedYear = shiftedDate.getFullYear()
  const shiftedMonth = String(shiftedDate.getMonth() + 1).padStart(2, '0')
  return `${shiftedYear}-${shiftedMonth}`
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
        done: item?.done === true || item?.completed === true || item?.status === 'done',
      }))
      .filter(
        (item) => typeof item.label === 'string' && typeof item.deadline === 'string',
      )
  }

  return Object.entries(firebaseData)
    .map(([id, item]) => ({
      id,
      label: item?.label,
      deadline: item?.deadline,
      done: item?.done === true || item?.completed === true || item?.status === 'done',
    }))
    .filter((item) => typeof item.label === 'string' && typeof item.deadline === 'string')
}

function App() {
  const [calendarMonth, setCalendarMonth] = useState(getTodayIsoMonth())
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [selectedCalendarDate, setSelectedCalendarDate] = useState('')
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
        .filter((widget) => !widget.done && widget.daysLeft >= 0)
        .sort((a, b) => normalizeDate(a.deadline) - normalizeDate(b.deadline)),
    [widgets],
  )

  const calendarTaskMap = useMemo(() => {
    const taskMap = {}

    preparedWidgets.forEach((widget) => {
      if (!widget.deadline.startsWith(`${calendarMonth}-`)) {
        return
      }

      if (!taskMap[widget.deadline]) {
        taskMap[widget.deadline] = []
      }

      taskMap[widget.deadline].push(widget)
    })

    return taskMap
  }, [preparedWidgets, calendarMonth])

  const calendarDays = useMemo(() => {
    const [yearString, monthString] = calendarMonth.split('-')
    const year = Number(yearString)
    const month = Number(monthString)

    if (
      !yearString ||
      !monthString ||
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      month < 1 ||
      month > 12
    ) {
      return []
    }

    const firstDayIndex = new Date(year, month - 1, 1).getDay()
    const dayCount = new Date(year, month, 0).getDate()
    const calendarCells = []
    const todayIsoDate = getTodayIsoDate()

    for (let index = 0; index < firstDayIndex; index += 1) {
      calendarCells.push({
        key: `empty-${index}`,
        isCurrentMonth: false,
      })
    }

    for (let day = 1; day <= dayCount; day += 1) {
      const dayString = String(day).padStart(2, '0')
      const isoDate = `${yearString}-${monthString}-${dayString}`

      calendarCells.push({
        key: isoDate,
        isCurrentMonth: true,
        day,
        isoDate,
        isToday: isoDate === todayIsoDate,
        tasks: calendarTaskMap[isoDate] ?? [],
      })
    }

    return calendarCells
  }, [calendarMonth, calendarTaskMap])

  const calendarMonthLabel = useMemo(() => {
    const [yearString, monthString] = calendarMonth.split('-')
    const year = Number(yearString)
    const month = Number(monthString)

    if (
      !yearString ||
      !monthString ||
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      month < 1 ||
      month > 12
    ) {
      return calendarMonth
    }

    return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
  }, [calendarMonth])

  const selectedCalendarTasks = useMemo(() => {
    if (!selectedCalendarDate) {
      return []
    }

    return calendarTaskMap[selectedCalendarDate] ?? []
  }, [calendarTaskMap, selectedCalendarDate])

  const selectedCalendarDateLabel = useMemo(() => {
    if (!selectedCalendarDate) {
      return ''
    }

    const date = new Date(`${selectedCalendarDate}T00:00:00`)
    if (Number.isNaN(date.getTime())) {
      return selectedCalendarDate
    }

    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }, [selectedCalendarDate])

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

  const handleMarkDone = async (widget) => {
    setSyncError('')

    try {
      const response = await fetch(`${FIREBASE_DEADLINES_ENDPOINT}/${widget.id}.json`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: widget.label,
          deadline: widget.deadline,
          done: true,
        }),
      })

      if (!response.ok) {
        throw new Error('done_failed')
      }

      setWidgets((current) =>
        current.map((currentWidget) =>
          currentWidget.id === widget.id ? { ...currentWidget, done: true } : currentWidget,
        ),
      )
      if (editingId === widget.id) {
        setEditingId(null)
      }
    } catch {
      setSyncError('unable_to_mark_deadline_done')
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

  const handleCalendarMonthChange = (event) => {
    setCalendarMonth(event.target.value || getTodayIsoMonth())
    setSelectedCalendarDate('')
  }

  const handleShiftCalendarMonth = (monthOffset) => {
    setCalendarMonth((currentMonth) => shiftIsoMonth(currentMonth, monthOffset))
    setSelectedCalendarDate('')
  }

  const handleJumpToCurrentMonth = () => {
    const todayIsoMonth = getTodayIsoMonth()
    const todayIsoDate = getTodayIsoDate()
    setCalendarMonth(todayIsoMonth)
    setSelectedCalendarDate(todayIsoDate)
  }

  const handleOpenCalendar = () => {
    const todayIsoDate = getTodayIsoDate()
    setIsCalendarOpen(true)
    setSelectedCalendarDate(todayIsoDate.startsWith(`${calendarMonth}-`) ? todayIsoDate : '')
  }

  const handleCloseCalendar = () => {
    setIsCalendarOpen(false)
    setSelectedCalendarDate('')
  }

  const handleSaveEdit = async (id) => {
    if (!canSaveEdit) {
      return
    }

    const currentWidget = widgets.find((widget) => widget.id === id)
    const payload = {
      label: editForm.label.trim(),
      deadline: editForm.deadline,
      done: Boolean(currentWidget?.done),
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
      {isCalendarOpen ? (
        <section className="calendar-page" aria-label="Calendar task lookup">
          <div className="calendar-header">
            <div>
              <p className="calendar-title">[MONTH_CALENDAR_OVERVIEW]</p>
              <p className="calendar-month-label">{calendarMonthLabel}</p>
            </div>
            <div className="calendar-controls">
              <label className="calendar-input-label">
                &gt; pick_month
                <div className="calendar-month-picker">
                  <button
                    type="button"
                    className="calendar-month-nav-btn"
                    onClick={() => handleShiftCalendarMonth(-1)}
                    aria-label="Previous month"
                  >
                    &lt;
                  </button>
                  <input
                    type="month"
                    value={calendarMonth}
                    onChange={handleCalendarMonthChange}
                    className="calendar-input"
                  />
                  <button
                    type="button"
                    className="calendar-month-nav-btn"
                    onClick={() => handleShiftCalendarMonth(1)}
                    aria-label="Next month"
                  >
                    &gt;
                  </button>
                </div>
              </label>
              <button type="button" className="calendar-now-btn" onClick={handleJumpToCurrentMonth}>
                &gt; current_month()
              </button>
            </div>
          </div>

          <div className="calendar-grid-scroll" aria-live="polite">
            <div className="calendar-grid" role="grid" aria-label={`Calendar for ${calendarMonthLabel}`}>
              {CALENDAR_WEEK_DAYS.map((dayName) => (
                <p key={dayName} className="calendar-weekday" role="columnheader">
                  {dayName}
                </p>
              ))}
              {calendarDays.map((dayCell) =>
                dayCell.isCurrentMonth ? (
                  <button
                    key={dayCell.key}
                    type="button"
                    className={`calendar-day${dayCell.tasks.length > 0 ? ' calendar-day-has-tasks' : ''}${
                      dayCell.isToday ? ' calendar-day-today' : ''
                    }${selectedCalendarDate === dayCell.isoDate ? ' calendar-day-selected' : ''}`}
                    onClick={() => setSelectedCalendarDate(dayCell.isoDate)}
                    role="gridcell"
                    aria-label={`${dayCell.isoDate} ${dayCell.tasks.length} tasks`}
                  >
                    <p className="calendar-day-number">{dayCell.day}</p>
                    <p className="calendar-day-job-count">
                      {dayCell.tasks.length === 0
                        ? 'No Task'
                        : `${dayCell.tasks.length} ${dayCell.tasks.length === 1 ? 'task' : 'tasks'}`}
                    </p>
                  </button>
                ) : (
                  <div
                    key={dayCell.key}
                    className="calendar-day calendar-day-empty"
                    role="presentation"
                    aria-hidden="true"
                  />
                ),
              )}
            </div>
          </div>

          <section className="calendar-details" aria-live="polite">
            <p className="calendar-details-title">
              {selectedCalendarDate
                ? `[TASKS_ON] ${selectedCalendarDateLabel}`
                : '[TASKS_ON] select a day to view tasks'}
            </p>
            {selectedCalendarDate && selectedCalendarTasks.length === 0 ? (
              <p className="calendar-day-empty-text">no tasks</p>
            ) : selectedCalendarDate ? (
              <ul className="calendar-details-list">
                {selectedCalendarTasks.map((task) => (
                  <li key={`detail-${selectedCalendarDate}-${task.id}`} className="calendar-details-item">
                    &gt; {toCommandName(task.label)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <div className="calendar-actions">
            <button type="button" className="create-toggle-btn calendar-close-btn" onClick={handleCloseCalendar}>
              &gt; close_calendar()
            </button>
          </div>
        </section>
      ) : (
        <>

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

          <section className="calendar-panel" aria-label="Calendar task lookup">
            <button type="button" className="create-toggle-btn" onClick={handleOpenCalendar}>
              &gt; open_calendar()
            </button>
          </section>

          <section className="widget-grid">
        {preparedWidgets.length === 0 && !isSyncLoading ? (
          <article className="ios-widget" aria-label="No countdown widgets">
            <p className="command-title">
              <span className="command-prefix">&gt;</span>
              <span className="command-title-text">no_widgets_found</span>
            </p>
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
                      className="widget-btn widget-btn-done"
                      onClick={() => handleMarkDone(widget)}
                    >
                      done
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
                  <div className="widget-top-row">
                    <div className="widget-meta">
                      <p className="command-title">
                        <span className="command-prefix">&gt;</span>
                        <span className="command-title-text">{toCommandName(widget.label)}</span>
                      </p>
                      <p className="widget-date">target: {widget.deadline}</p>
                    </div>
                    <div className="widget-time-right">
                      <p className="widget-status">[SYS_TIME_LEFT]</p>
                      <div className="widget-count-row">
                        <p className="widget-count">{widget.daysLeft}</p>
                        <p className="widget-unit">DAYS</p>
                      </div>
                    </div>
                  </div>
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
                      className="widget-btn widget-btn-done"
                      onClick={() => handleMarkDone(widget)}
                    >
                      done
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
        </>
      )}
    </main>
  )
}

export default App
