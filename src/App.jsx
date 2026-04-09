import { useEffect, useMemo, useState } from 'react'
import './App.css'
import Login from './Login'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const FIREBASE_DATABASE_ENDPOINT =
  'https://todolist-database-aae1c-default-rtdb.firebaseio.com'
const FIREBASE_ROOMS_ENDPOINT = `${FIREBASE_DATABASE_ENDPOINT}/rooms`
const CALENDAR_WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getUserDeadlinesEndpoint(username) {
  const userKey = encodeURIComponent(username.trim().toLowerCase())
  return `${FIREBASE_DATABASE_ENDPOINT}/users/${userKey}/deadlines`
}

function getRoomEndpoint(roomCode) {
  return `${FIREBASE_ROOMS_ENDPOINT}/${encodeURIComponent(roomCode.trim().toUpperCase())}`
}

function normalizeRoomCode(value) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function toRoomMembers(roomData) {
  const members = roomData?.members

  if (!members) {
    return []
  }

  if (Array.isArray(members)) {
    return members.filter((member) => typeof member === 'string' && member.trim() !== '')
  }

  return Object.keys(members).filter((member) => typeof member === 'string' && member.trim() !== '')
}

async function findAvailableRoomCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = createRoomCode()
    const response = await fetch(`${getRoomEndpoint(roomCode)}.json`)
    if (!response.ok) {
      continue
    }

    const data = await response.json()
    if (!data) {
      return roomCode
    }
  }

  return createRoomCode()
}

async function getRoomData(roomCode) {
  const response = await fetch(`${getRoomEndpoint(roomCode)}.json`)
  if (!response.ok) {
    throw new Error('room_load_failed')
  }

  return response.json()
}

async function updateRoomMembers(roomCode, roomData, username) {
  const nextMembers = {
    ...(roomData?.members && !Array.isArray(roomData.members) ? roomData.members : {}),
    [username]: {
      joinedAt:
        roomData?.members && !Array.isArray(roomData.members) && roomData.members[username]?.joinedAt
          ? roomData.members[username].joinedAt
          : new Date().toISOString(),
    },
  }

  const nextRoomData = {
    code: normalizeRoomCode(roomCode),
    createdAt: roomData?.createdAt ?? new Date().toISOString(),
    createdBy: roomData?.createdBy ?? username,
    members: nextMembers,
  }

  const response = await fetch(`${getRoomEndpoint(roomCode)}.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(nextRoomData),
  })

  if (!response.ok) {
    throw new Error('room_save_failed')
  }

  return nextRoomData
}

async function loadRoomTaskList(roomCode) {
  const roomData = await getRoomData(roomCode)
  if (!roomData) {
    return { roomData: null, tasks: [] }
  }

  const members = toRoomMembers(roomData)

  const memberTasks = await Promise.all(
    members.map(async (memberName) => {
      const response = await fetch(`${getUserDeadlinesEndpoint(memberName)}.json`)
      if (!response.ok) {
        return []
      }

      const data = await response.json()
      return toWidgetList(data).map((task) => ({
        ...task,
        memberName,
      }))
    }),
  )

  return {
    roomData,
    tasks: memberTasks
      .flat()
      .map((task) => ({
        ...task,
        daysLeft: getDaysLeft(task.deadline),
      }))
      .sort((a, b) => normalizeDate(a.deadline) - normalizeDate(b.deadline)),
  }
}

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
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentUser, setCurrentUser] = useState('')
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem('theme')
    return storedTheme === 'dark' ? 'dark' : 'light'
  })
  
  // Check if user is already logged in on component mount
  useEffect(() => {
    const user = localStorage.getItem('user')
    if (user) {
      try {
        const userData = JSON.parse(user)
        setCurrentUser(userData.username)
        setIsAuthenticated(true)
        const savedRoomCode = localStorage.getItem('activeRoomCode') ?? ''
        setRoomCode(savedRoomCode)
        setIsRoomPageOpen(Boolean(savedRoomCode))
      } catch {
        localStorage.removeItem('user')
        localStorage.removeItem('authToken')
      }
    }
  }, [])

  const handleLogin = (username) => {
    setWidgets([])
    setCurrentUser(username)
    setIsAuthenticated(true)
    const savedRoomCode = localStorage.getItem('activeRoomCode') ?? ''
    setRoomCode(savedRoomCode)
    setIsRoomPageOpen(Boolean(savedRoomCode))
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('authToken')
    localStorage.removeItem('activeRoomCode')
    setWidgets([])
    setCurrentUser('')
    setIsAuthenticated(false)
    setIsRoomPageOpen(false)
    setRoomCode('')
    setRoomCodeInput('')
    setRoomTasks([])
    setRoomMembers([])
    setRoomStatus('')
    setRoomError('')
  }

  const [calendarMonth, setCalendarMonth] = useState(getTodayIsoMonth())
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [isDonePageOpen, setIsDonePageOpen] = useState(false)
  const [isRoomPageOpen, setIsRoomPageOpen] = useState(false)
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
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem('activeRoomCode') ?? '')
  const [roomTasks, setRoomTasks] = useState([])
  const [roomMembers, setRoomMembers] = useState([])
  const [roomStatus, setRoomStatus] = useState('')
  const [roomError, setRoomError] = useState('')
  const [isRoomLoading, setIsRoomLoading] = useState(false)
  const userDeadlinesEndpoint = useMemo(() => {
    if (!currentUser.trim()) {
      return ''
    }

    return getUserDeadlinesEndpoint(currentUser)
  }, [currentUser])

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

  const doneWidgets = useMemo(
    () =>
      widgets
        .filter((widget) => widget.done)
        .map((widget) => ({
          ...widget,
          daysLeft: getDaysLeft(widget.deadline),
        }))
        .sort((a, b) => normalizeDate(b.deadline) - normalizeDate(a.deadline)),
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
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    if (!isAuthenticated) {
      setIsSyncLoading(false)
      setWidgets([])
      return undefined
    }

    if (!userDeadlinesEndpoint) {
      setIsSyncLoading(false)
      setWidgets([])
      return undefined
    }

    let isDisposed = false

    const loadWidgets = async () => {
      setIsSyncLoading(true)
      setSyncError('')

      try {
        const response = await fetch(`${userDeadlinesEndpoint}.json`)
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
  }, [isAuthenticated, userDeadlinesEndpoint])

  useEffect(() => {
    if (!roomCode) {
      setRoomTasks([])
      setRoomMembers([])
      setRoomStatus('')
      setRoomError('')
      setIsRoomLoading(false)
      return undefined
    }

    let isDisposed = false

    const loadRoom = async () => {
      setIsRoomLoading(true)
      setRoomError('')
      setRoomStatus(`loading room ${roomCode}...`)

      try {
        const { roomData, tasks } = await loadRoomTaskList(roomCode)
        if (isDisposed) {
          return
        }

        if (!roomData) {
          setRoomError('room_not_found')
          setRoomCode('')
          localStorage.removeItem('activeRoomCode')
          return
        }

        setRoomMembers(toRoomMembers(roomData))
        setRoomTasks(tasks)
        setRoomStatus(`room ${normalizeRoomCode(roomCode)} loaded`)
      } catch {
        if (!isDisposed) {
          setRoomError('unable_to_load_room_data')
          setRoomTasks([])
          setRoomMembers([])
          setRoomStatus('')
        }
      } finally {
        if (!isDisposed) {
          setIsRoomLoading(false)
        }
      }
    }

    loadRoom()

    return () => {
      isDisposed = true
    }
  }, [roomCode])

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleAddWidget = async (event) => {
    event.preventDefault()
    if (!canCreate || !userDeadlinesEndpoint) {
      return
    }

    const payload = {
      label: form.label.trim(),
      deadline: form.deadline,
    }

    setSyncError('')

    try {
      const response = await fetch(`${userDeadlinesEndpoint}.json`, {
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
    if (!userDeadlinesEndpoint) {
      return
    }

    setSyncError('')

    try {
      const response = await fetch(`${userDeadlinesEndpoint}/${id}.json`, {
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
    if (!userDeadlinesEndpoint) {
      return
    }

    setSyncError('')

    try {
      const response = await fetch(`${userDeadlinesEndpoint}/${widget.id}.json`, {
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
    setIsDonePageOpen(false)
    setIsCalendarOpen(true)
    setSelectedCalendarDate(todayIsoDate.startsWith(`${calendarMonth}-`) ? todayIsoDate : '')
  }

  const handleCloseCalendar = () => {
    setIsCalendarOpen(false)
    setSelectedCalendarDate('')
  }

  const handleOpenDonePage = () => {
    setIsCalendarOpen(false)
    setSelectedCalendarDate('')
    setIsDonePageOpen(true)
  }

  const handleCloseDonePage = () => {
    setIsDonePageOpen(false)
  }

  const handleSaveEdit = async (id) => {
    if (!canSaveEdit || !userDeadlinesEndpoint) {
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
      const response = await fetch(`${userDeadlinesEndpoint}/${id}.json`, {
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

  const handleMarkUndone = async (widget) => {
    if (!userDeadlinesEndpoint) {
      return
    }

    setSyncError('')

    try {
      const response = await fetch(`${userDeadlinesEndpoint}/${widget.id}.json`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          label: widget.label,
          deadline: widget.deadline,
          done: false,
        }),
      })

      if (!response.ok) {
        throw new Error('undone_failed')
      }

      setWidgets((current) =>
        current.map((currentWidget) =>
          currentWidget.id === widget.id ? { ...currentWidget, done: false } : currentWidget,
        ),
      )
    } catch {
      setSyncError('unable_to_mark_deadline_undone')
    }
  }

  const handleOpenRoomPage = () => {
    setIsCalendarOpen(false)
    setIsDonePageOpen(false)
    setSelectedCalendarDate('')
    setIsRoomPageOpen(true)
  }

  const handleCloseRoomPage = () => {
    setIsRoomPageOpen(false)
  }

  const handleRoomCodeChange = (event) => {
    setRoomCodeInput(event.target.value)
  }

  const handleCreateRoom = async () => {
    if (!currentUser.trim()) {
      return
    }

    setRoomError('')
    setRoomStatus('creating room...')

    try {
      const roomCode = await findAvailableRoomCode()
      await updateRoomMembers(roomCode, null, currentUser)
      localStorage.setItem('activeRoomCode', roomCode)
      setRoomCode(roomCode)
      setRoomCodeInput('')
      setIsRoomPageOpen(true)
    } catch {
      setRoomError('unable_to_create_room')
      setRoomStatus('')
    }
  }

  const handleJoinRoom = async (event) => {
    event.preventDefault()

    if (!currentUser.trim()) {
      return
    }

    const nextRoomCode = normalizeRoomCode(roomCodeInput)
    if (!nextRoomCode) {
      setRoomError('room_code_required')
      return
    }

    setRoomError('')
    setRoomStatus(`joining room ${nextRoomCode}...`)

    try {
      const roomData = await getRoomData(nextRoomCode)
      if (!roomData) {
        setRoomError('room_not_found')
        setRoomStatus('')
        return
      }

      await updateRoomMembers(nextRoomCode, roomData, currentUser)
      localStorage.setItem('activeRoomCode', nextRoomCode)
      setRoomCode(nextRoomCode)
      setRoomCodeInput('')
      setIsRoomPageOpen(true)
    } catch {
      setRoomError('unable_to_join_room')
      setRoomStatus('')
    }
  }

  const handleRefreshRoom = async () => {
    if (!roomCode) {
      return
    }

    setRoomStatus(`refreshing room ${roomCode}...`)
    setRoomError('')

    try {
      const { roomData, tasks } = await loadRoomTaskList(roomCode)
      if (!roomData) {
        setRoomError('room_not_found')
        return
      }

      setRoomMembers(toRoomMembers(roomData))
      setRoomTasks(tasks)
      setRoomStatus(`room ${normalizeRoomCode(roomCode)} refreshed`)
    } catch {
      setRoomError('unable_to_refresh_room')
      setRoomStatus('')
    }
  }

  const handleLeaveRoom = () => {
    localStorage.removeItem('activeRoomCode')
    setRoomCode('')
    setRoomCodeInput('')
    setRoomTasks([])
    setRoomMembers([])
    setRoomStatus('')
    setRoomError('')
    setIsRoomPageOpen(false)
  }

  const handleThemeToggle = () => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'))
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <main className="app-shell">
      <header className="app-header" aria-label="Application header">
        <div className="app-header-brand">
          <svg
            className="app-logo"
            width="28"
            height="28"
            viewBox="0 0 28 28"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M14 7v7l5 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <h1>ToDoList</h1>
        </div>
        <button type="button" className="theme-toggle" onClick={handleThemeToggle}>
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </header>

      <div className="app-content">
      {isRoomPageOpen ? (
        <section className="room-page" aria-label="Room task overview">
          <div className="room-header">
            <div>
              <p className="room-title">[ROOM_OVERVIEW]</p>
              <p className="room-heading">{roomCode ? `Room ${roomCode}` : 'Create or join a room'}</p>
              <p className="room-subtitle">
                Shared rooms combine the deadlines from everyone in the room.
              </p>
            </div>
            <div className="room-header-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={handleRefreshRoom}
                disabled={!roomCode || isRoomLoading}
              >
                &gt; refresh_room()
              </button>
              <button type="button" className="secondary-btn" onClick={handleLeaveRoom}>
                &gt; leave_room()
              </button>
            </div>
          </div>

          {!roomCode ? (
            <div className="room-grid">
              <article className="room-card" aria-label="Create room">
                <p className="room-card-title">[CREATE_ROOM]</p>
                <p className="room-card-copy">
                  Start a shared room, then send the code to the people you want to collaborate with.
                </p>
                <button type="button" className="create-toggle-btn" onClick={handleCreateRoom}>
                  &gt; create_room()
                </button>
              </article>

              <article className="room-card" aria-label="Join room">
                <p className="room-card-title">[ENTER_ROOM_CODE]</p>
                <form className="room-join-form" onSubmit={handleJoinRoom}>
                  <label>
                    &gt; room_code
                    <input
                      value={roomCodeInput}
                      onChange={handleRoomCodeChange}
                      placeholder="ABC123"
                      autoCapitalize="characters"
                      autoComplete="off"
                    />
                  </label>
                  <button type="submit" className="create-toggle-btn">
                    &gt; enter_room()
                  </button>
                </form>
              </article>
            </div>
          ) : (
            <>
              <section className="room-summary" aria-live="polite">
                <div className="room-summary-row">
                  <span className="room-pill">code {roomCode}</span>
                  <span className="room-pill">members {roomMembers.length}</span>
                </div>
                <p className={`room-status${roomError ? ' sync-status-error' : ''}`}>
                  {isRoomLoading
                    ? '[ROOM_LOADING]'
                    : roomError
                      ? `[ROOM_ERROR] ${roomError}`
                      : roomStatus || '[ROOM_READY]' }
                </p>
                {roomMembers.length > 0 ? (
                  <p className="room-members-label">
                    members: {roomMembers.map((member) => member).join(', ')}
                  </p>
                ) : null}
              </section>

              <section className="room-task-list" aria-label="Room deadlines">
                {roomTasks.length === 0 && !isRoomLoading ? (
                  <article className="room-empty-state">
                    <p className="command-title">No shared tasks yet.</p>
                    <p className="widget-status">Add deadlines to any room member to see them here.</p>
                  </article>
                ) : (
                  roomTasks.map((task) => (
                    <article key={`${task.memberName}-${task.id}`} className="room-task-item">
                      <div className="room-task-main">
                        <p className="command-title">
                          <span className="command-prefix">&gt;</span>
                          <span className="command-title-text">{toCommandName(task.label)}</span>
                        </p>
                        <p className="widget-date">member: {task.memberName}</p>
                        <p className="widget-date">deadline: {task.deadline}</p>
                      </div>
                      <div className="room-task-meta">
                        <span className="room-task-badge">{task.done ? 'done' : 'active'}</span>
                        <div className="widget-count-row">
                          <p className="widget-count">{task.daysLeft}</p>
                          <p className="widget-unit">DAYS</p>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </section>
            </>
          )}

          <div className="calendar-actions">
            <button type="button" className="create-toggle-btn calendar-close-btn" onClick={handleCloseRoomPage}>
              &gt; close_room_page()
            </button>
          </div>
        </section>
      ) : isCalendarOpen ? (
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
      ) : isDonePageOpen ? (
        <section className="done-page" aria-label="Completed tasks">
          <div className="done-header">
            <p className="done-title">[DONE_TASKS]</p>
            <p className="done-subtitle">completed items can be moved back to active</p>
          </div>

          {doneWidgets.length === 0 ? (
            <article className="ios-widget" aria-label="No completed tasks">
              <p className="command-title">No completed tasks yet.</p>
              <p className="widget-status">Finish one task to see it here.</p>
            </article>
          ) : (
            <section className="widget-grid">
              {doneWidgets.map((widget) => (
                <article key={widget.id} className="ios-widget done-widget" aria-label={`${widget.label} completed task`}>
                  <div className="widget-top-row">
                    <div className="widget-meta">
                      <p className="command-title done-task-title">
                        <span className="command-prefix">&gt;</span>
                        <span className="command-title-text">{toCommandName(widget.label)}</span>
                      </p>
                      <p className="widget-date">target: {widget.deadline}</p>
                    </div>
                    <div className="widget-time-right">
                      <p className="widget-status">[DONE]</p>
                      <div className="widget-count-row">
                        <p className="widget-count">{widget.daysLeft}</p>
                        <p className="widget-unit">DAYS</p>
                      </div>
                    </div>
                  </div>
                  <div className="widget-actions">
                    <button
                      type="button"
                      className="widget-btn widget-btn-done"
                      onClick={() => handleMarkUndone(widget)}
                    >
                      undone
                    </button>
                    <button
                      type="button"
                      className="widget-btn widget-btn-delete"
                      onClick={() => handleDeleteWidget(widget.id)}
                    >
                      delete
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}

          <div className="calendar-actions">
            <button type="button" className="create-toggle-btn calendar-close-btn" onClick={handleCloseDonePage}>
              &gt; close_done_page()
            </button>
          </div>
        </section>
      ) : (
        <>

          <div className="user-header">
            <div className="user-info">
              <span className="user-name">Welcome, {currentUser}</span>
            </div>
            <button type="button" className="logout-btn" onClick={handleLogout}>
              &gt; logout()
            </button>
          </div>

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
            <div className="panel-actions">
              <button type="button" className="create-toggle-btn" onClick={handleOpenCalendar}>
                &gt; open_calendar()
              </button>
              <button type="button" className="create-toggle-btn secondary-btn" onClick={handleOpenDonePage}>
                &gt; open_done_tasks()
              </button>
              <button type="button" className="create-toggle-btn secondary-btn" onClick={handleOpenRoomPage}>
                &gt; open_room_space()
              </button>
            </div>
          </section>

          <section className="widget-grid">
        {preparedWidgets.length === 0 && !isSyncLoading ? (
          <article className="ios-widget" aria-label="No countdown widgets">
            <div className="empty-state-icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="command-title">Nothing here yet. Add your first task.</p>
            <p className="widget-status">[REMOTE_DATABASE_EMPTY]</p>
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
                    <button
                      type="button"
                      className="task-check"
                      onClick={() => handleMarkDone(widget)}
                      aria-label={`Complete ${widget.label}`}
                    >
                      <span className="task-check-dot" />
                    </button>
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
      </div>
    </main>
  )
}

export default App
