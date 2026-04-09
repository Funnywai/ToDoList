import { useEffect, useMemo, useState } from 'react'
import './App.css'
import Login from './Login'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const FIREBASE_DATABASE_ENDPOINT =
  'https://todolist-database-aae1c-default-rtdb.firebaseio.com'
const FIREBASE_ROOMS_ENDPOINT = `${FIREBASE_DATABASE_ENDPOINT}/rooms`
const CALENDAR_WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ROOM_HIGHLIGHT_COLORS = [
  { name: 'Teal', value: '#0f766e' },
  { name: 'Sky', value: '#0284c7' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#15803d' },
  { name: 'Amber', value: '#ca8a04' },
  { name: 'Orange', value: '#c2410c' },
  { name: 'Rose', value: '#be123c' },
  { name: 'Slate', value: '#475569' },
  { name: 'Cyan', value: '#0891b2' },
  { name: 'Lime', value: '#4d7c0f' },
  { name: 'Indigo', value: '#4338ca' },
  { name: 'Red', value: '#dc2626' },
]

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

function normalizeRoomColor(value) {
  return value.trim().toLowerCase()
}

function getFallbackRoomColor(index) {
  return ROOM_HIGHLIGHT_COLORS[index % ROOM_HIGHLIGHT_COLORS.length]?.value ?? '#0f766e'
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function getRoomMemberEntries(roomData) {
  const members = roomData?.members

  if (!members) {
    return []
  }

  if (Array.isArray(members)) {
    return members
      .filter((member) => typeof member === 'string' && member.trim() !== '')
      .map((memberName, index) => ({
        name: memberName,
        color: getFallbackRoomColor(index),
        joinedAt: '',
      }))
  }

  return Object.entries(members)
    .filter(([memberName]) => typeof memberName === 'string' && memberName.trim() !== '')
    .map(([memberName, memberData], index) => ({
      name: memberName,
      color: memberData?.color ? normalizeRoomColor(memberData.color) : getFallbackRoomColor(index),
      joinedAt: memberData?.joinedAt ?? '',
    }))
}

function getTakenRoomColors(roomData, excludeUsername = '') {
  const takenColors = new Set()

  getRoomMemberEntries(roomData).forEach((member) => {
    if (member.name === excludeUsername) {
      return
    }

    if (member.color) {
      takenColors.add(normalizeRoomColor(member.color))
    }
  })

  return takenColors
}

function getAvailableRoomColors(roomData, excludeUsername = '') {
  const takenColors = getTakenRoomColors(roomData, excludeUsername)
  return ROOM_HIGHLIGHT_COLORS.filter((color) => !takenColors.has(normalizeRoomColor(color.value)))
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

async function updateRoomMembers(roomCode, roomData, username, color) {
  const currentMembers = getRoomMemberEntries(roomData)
  const existingMember = currentMembers.find((member) => member.name === username)
  const nextColor = normalizeRoomColor(color || existingMember?.color || '')
  const takenColors = getTakenRoomColors(roomData, username)

  if (nextColor && takenColors.has(nextColor)) {
    throw new Error('room_color_taken')
  }

  const resolvedColor = nextColor || getAvailableRoomColors(roomData, username)[0]?.value

  if (!resolvedColor) {
    throw new Error('room_color_unavailable')
  }

  const nextMembers = {
    ...(roomData?.members && !Array.isArray(roomData.members) ? roomData.members : {}),
    [username]: {
      joinedAt: existingMember?.joinedAt || new Date().toISOString(),
      color: resolvedColor,
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
    return { roomData: null, memberEntries: [], tasks: [] }
  }

  const memberEntries = getRoomMemberEntries(roomData)

  const memberTasks = await Promise.all(
    memberEntries.map(async (member) => {
      const memberName = member.name
      const response = await fetch(`${getUserDeadlinesEndpoint(memberName)}.json`)
      if (!response.ok) {
        return []
      }

      const data = await response.json()
      return toWidgetList(data).map((task) => ({
        ...task,
        memberName,
        memberColor: member.color,
      }))
    }),
  )

  return {
    roomData,
    memberEntries,
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

function CalendarActionIcon() {
  return (
    <svg className="panel-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 3.5v4M16 3.5v4M4 9h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 13h3M8 16.5h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function DoneActionIcon() {
  return (
    <svg className="panel-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8.5 12.5l2.2 2.2 4.8-5.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5A8.5 8.5 0 0 0 12 3.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function RoomActionIcon() {
  return (
    <svg className="panel-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20V6.5l8-3.5 8 3.5V20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 20v-5.5h6V20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 11h1.2M11.4 11h1.2M14.8 11H16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
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
    setRoomColorChoice(ROOM_HIGHLIGHT_COLORS[0].value)
    setRoomStatus('')
    setRoomError('')
  }

  const [calendarMonth, setCalendarMonth] = useState(getTodayIsoMonth())
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [isDonePageOpen, setIsDonePageOpen] = useState(false)
  const [isRoomPageOpen, setIsRoomPageOpen] = useState(false)
  const [roomCalendarMonth, setRoomCalendarMonth] = useState(getTodayIsoMonth())
  const [selectedCalendarDate, setSelectedCalendarDate] = useState('')
  const [selectedRoomDate, setSelectedRoomDate] = useState('')
  const [form, setForm] = useState({
    label: '',
    deadline: '',
  })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
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
  const [roomColorChoice, setRoomColorChoice] = useState(ROOM_HIGHLIGHT_COLORS[0].value)
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

  const activeRoomTasks = useMemo(
    () =>
      roomTasks.filter((task) => task.done !== true && task.daysLeft >= 0),
    [roomTasks],
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

  const roomCalendarTaskMap = useMemo(() => {
    const taskMap = {}

    activeRoomTasks.forEach((task) => {
      if (!task.deadline.startsWith(`${roomCalendarMonth}-`)) {
        return
      }

      if (!taskMap[task.deadline]) {
        taskMap[task.deadline] = []
      }

      taskMap[task.deadline].push(task)
    })

    return taskMap
  }, [activeRoomTasks, roomCalendarMonth])

  const roomCalendarDays = useMemo(() => {
    const [yearString, monthString] = roomCalendarMonth.split('-')
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
        key: `room-empty-${index}`,
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
        tasks: roomCalendarTaskMap[isoDate] ?? [],
      })
    }

    return calendarCells
  }, [roomCalendarMonth, roomCalendarTaskMap])

  const roomCalendarMonthLabel = useMemo(() => {
    const [yearString, monthString] = roomCalendarMonth.split('-')
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
      return roomCalendarMonth
    }

    return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
  }, [roomCalendarMonth])

  const selectedRoomTasks = useMemo(() => {
    if (!selectedRoomDate) {
      return []
    }

    return roomCalendarTaskMap[selectedRoomDate] ?? []
  }, [roomCalendarTaskMap, selectedRoomDate])

  const selectedRoomDateLabel = useMemo(() => {
    if (!selectedRoomDate) {
      return ''
    }

    const date = new Date(`${selectedRoomDate}T00:00:00`)
    if (Number.isNaN(date.getTime())) {
      return selectedRoomDate
    }

    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }, [selectedRoomDate])

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

        const memberEntries = getRoomMemberEntries(roomData)
        setRoomMembers(memberEntries)
        const currentMember = memberEntries.find((member) => member.name === currentUser)
        if (currentMember?.color) {
          setRoomColorChoice(currentMember.color)
        }
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
  }, [roomCode, currentUser])

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

  const handleRequestDelete = (id) => {
    setPendingDeleteId((current) => (current === id ? null : id))
  }

  const handleCancelDelete = () => {
    setPendingDeleteId(null)
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
      setPendingDeleteId(null)
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
    setRoomCalendarMonth(getTodayIsoMonth())
    setSelectedRoomDate('')
    setRoomColorChoice((currentColor) => currentColor || ROOM_HIGHLIGHT_COLORS[0].value)
    setIsRoomPageOpen(true)
  }

  const handleCloseRoomPage = () => {
    setIsRoomPageOpen(false)
  }

  const handleRoomCodeChange = (event) => {
    setRoomCodeInput(event.target.value)
  }

  const handleRoomColorSelect = (colorValue) => {
    setRoomColorChoice(colorValue)
  }

  const handleRoomCalendarMonthChange = (event) => {
    setRoomCalendarMonth(event.target.value || getTodayIsoMonth())
    setSelectedRoomDate('')
  }

  const handleShiftRoomCalendarMonth = (monthOffset) => {
    setRoomCalendarMonth((currentMonth) => shiftIsoMonth(currentMonth, monthOffset))
    setSelectedRoomDate('')
  }

  const handleJumpToCurrentRoomMonth = () => {
    const todayIsoMonth = getTodayIsoMonth()
    const todayIsoDate = getTodayIsoDate()
    setRoomCalendarMonth(todayIsoMonth)
    setSelectedRoomDate(todayIsoDate)
  }

  const handleCreateRoom = async () => {
    if (!currentUser.trim()) {
      return
    }

    setRoomError('')
    setRoomStatus('creating room...')

    try {
      const roomCode = await findAvailableRoomCode()
      await updateRoomMembers(roomCode, null, currentUser, roomColorChoice)
      localStorage.setItem('activeRoomCode', roomCode)
      setRoomCode(roomCode)
      setRoomCodeInput('')
      setRoomCalendarMonth(getTodayIsoMonth())
      setSelectedRoomDate(getTodayIsoDate())
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

      await updateRoomMembers(nextRoomCode, roomData, currentUser, roomColorChoice)
      localStorage.setItem('activeRoomCode', nextRoomCode)
      setRoomCode(nextRoomCode)
      setRoomCodeInput('')
      setRoomCalendarMonth(getTodayIsoMonth())
      setSelectedRoomDate(getTodayIsoDate())
      setIsRoomPageOpen(true)
    } catch (error) {
      if (error instanceof Error && error.message === 'room_color_taken') {
        setRoomError('room_color_already_taken')
      } else {
        setRoomError('unable_to_join_room')
      }
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
      const { roomData, memberEntries, tasks } = await loadRoomTaskList(roomCode)
      if (!roomData) {
        setRoomError('room_not_found')
        return
      }

      setRoomMembers(memberEntries)
      setRoomTasks(tasks)
      setRoomStatus(`room ${normalizeRoomCode(roomCode)} refreshed`)
    } catch {
      setRoomError('unable_to_refresh_room')
      setRoomStatus('')
    }
  }

  const handleLeaveRoom = () => {
    const shouldLeaveRoom = window.confirm('Leave this room now?')
    if (!shouldLeaveRoom) {
      return
    }

    localStorage.removeItem('activeRoomCode')
    setRoomCode('')
    setRoomCodeInput('')
    setRoomTasks([])
    setRoomMembers([])
    setRoomColorChoice(ROOM_HIGHLIGHT_COLORS[0].value)
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
        <div className="app-header-user">
          <span className="app-header-welcome">Welcome, {currentUser}</span>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            logout
          </button>
        </div>
        <button type="button" className="theme-toggle" onClick={handleThemeToggle}>
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </header>

      <div className="app-content">
      {isRoomPageOpen ? (
        <section className="room-page" aria-label="Room task overview">
          {!roomCode ? (
            <>
              <section className="room-color-panel" aria-label="Room highlight color picker">
                <div>
                  <p className="room-card-title">[PICK_HIGHLIGHT_COLOR]</p>
                  <p className="room-card-copy">
                    Pick one highlight color for your room tasks. Each member must use a different color.
                  </p>
                </div>
                <div className="room-color-picker">
                  {ROOM_HIGHLIGHT_COLORS.map((color) => {
                    const isSelected = normalizeRoomColor(roomColorChoice) === normalizeRoomColor(color.value)

                    return (
                      <button
                        key={color.value}
                        type="button"
                        className={`room-color-swatch${isSelected ? ' room-color-swatch-selected' : ''}`}
                        style={{ '--room-swatch-color': color.value }}
                        onClick={() => handleRoomColorSelect(color.value)}
                        aria-label={`${color.name} highlight color`}
                        aria-pressed={isSelected}
                      >
                        <span className="room-color-swatch-dot" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
                <p className="room-color-note">The app blocks duplicate colors inside the same room.</p>
              </section>

            <div className="room-grid">
              <article className="room-card" aria-label="Create room">
                <p className="room-card-title">[CREATE_ROOM]</p>
                <p className="room-card-copy">
                  Start a shared room, then send the code to the people you want to collaborate with.
                </p>
                <button type="button" className="create-toggle-btn" onClick={handleCreateRoom}>
                  create_room
                </button>
              </article>

              <article className="room-card" aria-label="Join room">
                <p className="room-card-title">[ENTER_ROOM_CODE]</p>
                <form className="room-join-form" onSubmit={handleJoinRoom}>
                  <label>
                    room_code
                    <input
                      value={roomCodeInput}
                      onChange={handleRoomCodeChange}
                      placeholder="ABC123"
                      autoCapitalize="characters"
                      autoComplete="off"
                    />
                  </label>
                  <button type="submit" className="create-toggle-btn">
                    enter_room
                  </button>
                </form>
              </article>
            </div>
            </>
          ) : (
            <>
              <section className="room-summary" aria-live="polite">
                <div className="room-summary-row">
                  <span className="room-pill">code {roomCode}</span>
                  <span className="room-pill">members {roomMembers.length}</span>
                </div>
              </section>

              <section className="calendar-page room-calendar-page" aria-label="Room calendar task lookup">
                <div className="calendar-header">
                  <div>
                    <p className="calendar-month-label">{roomCalendarMonthLabel}</p>
                  </div>
                  <div className="calendar-controls">
                    <label className="calendar-input-label">
                      pick_month
                      <div className="calendar-month-picker">
                        <button
                          type="button"
                          className="calendar-month-nav-btn"
                          onClick={() => handleShiftRoomCalendarMonth(-1)}
                          aria-label="Previous room month"
                        >
                          &lt;
                        </button>
                        <input
                          type="month"
                          value={roomCalendarMonth}
                          onChange={handleRoomCalendarMonthChange}
                          className="calendar-input"
                        />
                        <button
                          type="button"
                          className="calendar-month-nav-btn"
                          onClick={() => handleShiftRoomCalendarMonth(1)}
                          aria-label="Next room month"
                        >
                          &gt;
                        </button>
                      </div>
                    </label>
                    <button type="button" className="calendar-now-btn" onClick={handleJumpToCurrentRoomMonth}>
                      current_month
                    </button>
                  </div>
                </div>

                <div className="calendar-grid-scroll" aria-live="polite">
                  <div className="calendar-grid" role="grid" aria-label={`Room calendar for ${roomCalendarMonthLabel}`}>
                    {CALENDAR_WEEK_DAYS.map((dayName) => (
                      <p key={dayName} className="calendar-weekday" role="columnheader">
                        {dayName}
                      </p>
                    ))}
                    {roomCalendarDays.map((dayCell) =>
                      dayCell.isCurrentMonth ? (
                        <button
                          key={dayCell.key}
                          type="button"
                          className={`calendar-day${dayCell.tasks.length > 0 ? ' calendar-day-has-tasks' : ''}${
                            dayCell.isToday ? ' calendar-day-today' : ''
                          }${selectedRoomDate === dayCell.isoDate ? ' calendar-day-selected' : ''}`}
                          onClick={() => setSelectedRoomDate(dayCell.isoDate)}
                          role="gridcell"
                          aria-label={`${dayCell.isoDate} ${dayCell.tasks.length} tasks`}
                          style={{ '--room-day-accent': dayCell.tasks[0]?.memberColor ?? 'var(--accent)' }}
                        >
                          <p className="calendar-day-number">{dayCell.day}</p>
                          <p className="calendar-day-job-count">
                            {dayCell.tasks.length === 0
                              ? 'No Task'
                              : `${dayCell.tasks.length} ${dayCell.tasks.length === 1 ? 'task' : 'tasks'}`}
                          </p>
                          {dayCell.tasks.length > 0 ? (
                            <div className="room-day-color-dots" aria-hidden="true">
                              {dayCell.tasks.slice(0, 4).map((task) => (
                                <span
                                  key={`${dayCell.isoDate}-${task.memberName}-${task.id}`}
                                  className="room-day-color-dot"
                                  style={{ '--room-task-accent': task.memberColor }}
                                />
                              ))}
                              {dayCell.tasks.length > 4 ? (
                                <span className="room-day-color-more">+{dayCell.tasks.length - 4}</span>
                              ) : null}
                            </div>
                          ) : null}
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
                    {selectedRoomDate
                      ? `[ROOM_TASKS_ON] ${selectedRoomDateLabel}`
                      : '[ROOM_TASKS_ON] select a day to view tasks'}
                  </p>
                  {selectedRoomDate && selectedRoomTasks.length === 0 ? (
                    <p className="calendar-day-empty-text">no tasks</p>
                  ) : selectedRoomDate ? (
                    <ul className="calendar-details-list">
                      {selectedRoomTasks.map((task) => (
                        <li
                          key={`room-detail-${selectedRoomDate}-${task.memberName}-${task.id}`}
                          className="calendar-details-item room-calendar-detail-item"
                          style={{ '--room-task-accent': task.memberColor }}
                        >
                          <span className="room-detail-color-dot" aria-hidden="true" />
                          <span>
                            &gt; {toCommandName(task.label)} ({task.memberName})
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </section>
            </>
          )}

          <div className="calendar-actions">
            <button type="button" className="create-toggle-btn calendar-close-btn" onClick={handleCloseRoomPage}>
              close_room_page
            </button>
            <div className="room-footer-actions">
              <button
                type="button"
                className="room-action-btn room-action-btn-refresh"
                onClick={handleRefreshRoom}
                disabled={!roomCode || isRoomLoading}
              >
                refresh_room
              </button>
              <button type="button" className="room-action-btn room-action-btn-leave" onClick={handleLeaveRoom}>
                leave_room
              </button>
            </div>
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
                pick_month
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
                current_month
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
              close_calendar
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
                      onClick={() =>
                        pendingDeleteId === widget.id
                          ? handleDeleteWidget(widget.id)
                          : handleRequestDelete(widget.id)
                      }
                    >
                      {pendingDeleteId === widget.id ? 'confirm' : 'delete'}
                    </button>
                    {pendingDeleteId === widget.id ? (
                      <button type="button" className="widget-btn" onClick={handleCancelDelete}>
                        cancel
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>
          )}

          <div className="calendar-actions">
            <button type="button" className="create-toggle-btn calendar-close-btn" onClick={handleCloseDonePage}>
              close_done_page
            </button>
          </div>
        </section>
      ) : (
        <>

          {!isCreateOpen ? (
            <button
              type="button"
              className="floating-create-btn"
              onClick={handleOpenCreate}
              aria-label="open create widget"
            >
              +
            </button>
          ) : (
            <section
              className="create-popup-overlay"
              aria-label="Create widget dialog"
              onClick={handleCloseCreate}
            >
              <article className="create-popup-card" onClick={(event) => event.stopPropagation()}>
                <p className={`sync-status${syncError ? ' sync-status-error' : ''}`}>
                  {isSyncLoading
                    ? '[SYNC_LOADING_REMOTE_DATABASE]'
                    : syncError
                      ? `[SYNC_ERROR] ${syncError}`
                      : '[SYNC_REMOTE_DATABASE_CONNECTED]'}
                </p>
                <form className="command-form command-form-minimal" onSubmit={handleAddWidget}>
                  <label>
                    widget_name
                    <input
                      name="label"
                      value={form.label}
                      onChange={handleFormChange}
                      placeholder="CENG3420 Lab"
                    />
                  </label>

                  <label>
                    deadline_yyyy_mm_dd
                    <input
                      name="deadline"
                      type="date"
                      value={form.deadline}
                      onChange={handleFormChange}
                    />
                  </label>

                  <div className="create-actions">
                    <button type="submit" disabled={!canCreate}>
                      create_widget
                    </button>
                    <button type="button" onClick={handleCloseCreate}>
                      close_create
                    </button>
                  </div>
                </form>
              </article>
            </section>
          )}

          <section className="calendar-panel" aria-label="Calendar task lookup">
            <div className="panel-actions">
              <button type="button" className="create-toggle-btn" onClick={handleOpenCalendar}>
                <CalendarActionIcon />
                calendar
              </button>
              <button type="button" className="create-toggle-btn secondary-btn" onClick={handleOpenDonePage}>
                <DoneActionIcon />
                done_tasks
              </button>
              <button type="button" className="create-toggle-btn secondary-btn" onClick={handleOpenRoomPage}>
                <RoomActionIcon />
                room_space
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
                      widget_name
                      <input
                        name="label"
                        value={editForm.label}
                        onChange={handleEditChange}
                        placeholder="CENG3420 Lab"
                      />
                    </label>
                    <label>
                      deadline_yyyy_mm_dd
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
                      onClick={() =>
                        pendingDeleteId === widget.id
                          ? handleDeleteWidget(widget.id)
                          : handleRequestDelete(widget.id)
                      }
                    >
                      {pendingDeleteId === widget.id ? 'confirm' : 'delete'}
                    </button>
                    {pendingDeleteId === widget.id ? (
                      <button type="button" className="widget-btn" onClick={handleCancelDelete}>
                        cancel
                      </button>
                    ) : null}
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
                      onClick={() =>
                        pendingDeleteId === widget.id
                          ? handleDeleteWidget(widget.id)
                          : handleRequestDelete(widget.id)
                      }
                    >
                      {pendingDeleteId === widget.id ? 'confirm' : 'delete'}
                    </button>
                    {pendingDeleteId === widget.id ? (
                      <button type="button" className="widget-btn" onClick={handleCancelDelete}>
                        cancel
                      </button>
                    ) : null}
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
