import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import './App.css'
import Login from './Login'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const FIREBASE_DATABASE_ENDPOINT =
  import.meta.env.VITE_FIREBASE_DATABASE_URL ??
  'https://todolist-database-aae1c-default-rtdb.firebaseio.com'
const FIREBASE_ROOMS_ENDPOINT = `${FIREBASE_DATABASE_ENDPOINT}/rooms`
const CALENDAR_WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const RECURRING_WEEKDAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]
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

const ERROR_MESSAGES = {
  unable_to_load_remote_deadlines: 'Unable to load your tasks. Check your connection and try again.',
  room_not_found: 'Room not found. Double-check the code and try again.',
  unable_to_load_room_data: 'Unable to load room data. Please try again.',
  unable_to_create_room: 'Unable to create the room. Please try again.',
  room_code_required: 'Please enter a room code.',
  unable_to_join_room: 'Unable to join the room. Please try again.',
  unable_to_refresh_room: 'Unable to refresh the room. Please try again.',
  load_failed: 'Could not load tasks.',
  save_failed: 'Could not save the task.',
  delete_failed: 'Could not delete the task.',
  done_failed: 'Could not mark the task as done.',
  undone_failed: 'Could not restore the task.',
  update_failed: 'Could not update the task.',
  missing_key: 'Task is missing required data.',
  room_load_failed: 'Could not load the room.',
  room_color_unavailable: 'No member colors are available right now.',
  room_save_failed: 'Could not save the room.',
  room_delete_failed: 'Could not delete the room.',
  room_update_failed: 'Could not update the room.',
  room_search_failed: 'Could not search rooms.',
}

function formatErrorMessage(key) {
  if (!key) {
    return ''
  }
  return ERROR_MESSAGES[key] ?? key
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

async function updateRoomMembers(roomCode, roomData, username) {
  const currentMembers = getRoomMemberEntries(roomData)
  const existingMember = currentMembers.find((member) => member.name === username)
  const resolvedColor =
    (existingMember?.color ? normalizeRoomColor(existingMember.color) : '') ||
    getAvailableRoomColors(roomData, username)[0]?.value

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

async function removeUserFromRoom(roomCode, username) {
  try {
    const roomData = await getRoomData(roomCode)
    if (!roomData) {
      return
    }

    const currentMembers = roomData?.members || {}
    const nextMembers = { ...currentMembers }
    delete nextMembers[username]

    // If no members left, delete the entire room
    if (Object.keys(nextMembers).length === 0) {
      const response = await fetch(`${getRoomEndpoint(roomCode)}.json`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        console.error('Failed to delete empty room:', roomCode)
        throw new Error('room_delete_failed')
      }
      return
    }

    // Otherwise, update room with remaining members
    const nextRoomData = {
      code: normalizeRoomCode(roomCode),
      createdAt: roomData.createdAt,
      createdBy: roomData.createdBy,
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
      throw new Error('room_update_failed')
    }
  } catch (error) {
    // Log error for debugging
    console.warn(`Failed to remove user from room ${roomCode}:`, error)
  }
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

async function findUserRoomCode(username) {
  const normalizedUsername = username.trim()
  if (!normalizedUsername) {
    return ''
  }

  const response = await fetch(`${FIREBASE_ROOMS_ENDPOINT}.json`)
  if (!response.ok) {
    throw new Error('room_search_failed')
  }

  const roomsData = await response.json()
  if (!roomsData || typeof roomsData !== 'object') {
    return ''
  }

  const roomEntries = Object.entries(roomsData)
  for (const [roomKey, roomData] of roomEntries) {
    const hasMember = getRoomMemberEntries(roomData).some((member) => member.name === normalizedUsername)
    if (hasMember) {
      return normalizeRoomCode(roomData?.code || roomKey)
    }
  }

  return ''
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

function toIsoDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildRecurringDeadlines(form) {
  if (form.useMultiDates) {
    return (form.multiDates || []).length > 0 ? [...form.multiDates].sort() : []
  }

  if (!form.deadline) {
    return []
  }

  if (form.frequency === 'none') {
    return [form.deadline]
  }

  const startDate = normalizeDate(form.deadline)
  const endDate = normalizeDate(form.endDate || form.deadline)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    return []
  }

  if (form.frequency === 'daily') {
    const dates = []
    for (
      let cursor = new Date(startDate);
      cursor <= endDate;
      cursor = new Date(cursor.getTime() + MS_PER_DAY)
    ) {
      dates.push(toIsoDateString(cursor))
    }
    return dates
  }

  if (form.frequency === 'weekly') {
    const weekdays = new Set(
      (form.weekdays ?? []).map((dayValue) => Number(dayValue)).filter((day) => day >= 0 && day <= 6),
    )

    if (weekdays.size === 0) {
      return []
    }

    const dates = []

    for (
      let cursor = new Date(startDate);
      cursor <= endDate;
      cursor = new Date(cursor.getTime() + MS_PER_DAY)
    ) {
      const dayDifference = Math.floor((cursor - startDate) / MS_PER_DAY)
      const weekOffset = Math.floor(dayDifference / 7)
      if (weekdays.has(cursor.getDay())) {
        dates.push(toIsoDateString(cursor))
      }
    }

    return dates
  }

  return [form.deadline]
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
  }

  const handleLogout = async () => {
    localStorage.removeItem('user')
    localStorage.removeItem('authToken')
    localStorage.removeItem('activeRoomCode')
    setWidgets([])
    setCurrentUser('')
    setIsAuthenticated(false)
    setActiveTab('home')
    setRoomCode('')
    setRoomCodeInput('')
    setRoomTasks([])
    setRoomMembers([])
    setRoomStatus('')
    setRoomError('')
  }

  const [calendarMonth, setCalendarMonth] = useState(getTodayIsoMonth())
  const [activeTab, setActiveTab] = useState('home')
  const [roomCalendarMonth, setRoomCalendarMonth] = useState(getTodayIsoMonth())
  const [selectedCalendarDate, setSelectedCalendarDate] = useState('')
  const [selectedRoomDate, setSelectedRoomDate] = useState('')
  const [form, setForm] = useState({
    label: '',
    deadline: '',
    frequency: 'none',
    endDate: '',
    weekdays: [],
    useMultiDates: false,
    multiDates: [],
    multiDateMonth: getTodayIsoMonth(),
  })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isLeaveRoomConfirmOpen, setIsLeaveRoomConfirmOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({
    label: '',
    deadline: '',
  })
  const [toasts, setToasts] = useState([])
  const [completingId, setCompletingId] = useState(null)
  const [quickAddValue, setQuickAddValue] = useState('')
  const [swipeState, setSwipeState] = useState({ id: null, offsetX: 0 })
  const swipeStartRef = useRef(null)
  const longPressTimerRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [isPullRefreshing, setIsPullRefreshing] = useState(false)
  const pullStartRef = useRef(null)
  const taskListRef = useRef(null)

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

  const recurringNeedsEndDate = form.frequency !== 'none' && !form.useMultiDates
  const recurringNeedsWeekdays = form.frequency === 'weekly' && !form.useMultiDates
  const canCreate =
    form.label.trim() !== '' &&
    (form.useMultiDates
      ? form.multiDates.length > 0
      : form.deadline !== '' &&
        (!recurringNeedsEndDate || form.endDate !== '') &&
        (!recurringNeedsWeekdays || form.weekdays.length > 0))
  const canSaveEdit = editForm.label.trim() !== '' && editForm.deadline !== ''

  const preparedWidgets = useMemo(
    () =>
      widgets
        .map((widget) => ({
          ...widget,
          daysLeft: getDaysLeft(widget.deadline),
        }))
        .filter((widget) => !widget.done)
        .sort((a, b) => normalizeDate(a.deadline) - normalizeDate(b.deadline)),
    [widgets],
  )

  const groupedWidgets = useMemo(() => {
    const groups = { overdue: [], today: [], tomorrow: [], upcoming: [] }
    preparedWidgets.forEach((widget) => {
      if (widget.daysLeft < 0) groups.overdue.push(widget)
      else if (widget.daysLeft === 0) groups.today.push(widget)
      else if (widget.daysLeft === 1) groups.tomorrow.push(widget)
      else groups.upcoming.push(widget)
    })
    return groups
  }, [preparedWidgets])

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
    if (!isAuthenticated || !currentUser.trim()) {
      return undefined
    }

    let isDisposed = false

    const resolveUserRoom = async () => {
      try {
        const linkedRoomCode = await findUserRoomCode(currentUser)
        if (isDisposed) {
          return
        }

        if (linkedRoomCode) {
          localStorage.setItem('activeRoomCode', linkedRoomCode)
          setRoomCode(linkedRoomCode)
          return
        }

        localStorage.removeItem('activeRoomCode')
        setRoomCode('')
      } catch {
        if (isDisposed) {
          return
        }

        const savedRoomCode = localStorage.getItem('activeRoomCode') ?? ''
        setRoomCode(savedRoomCode)
      }
    }

    resolveUserRoom()

    return () => {
      isDisposed = true
    }
  }, [isAuthenticated, currentUser])

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
    setForm((current) => {
      if (name === 'useMultiDates') {
        return {
          ...current,
          useMultiDates: !current.useMultiDates,
          multiDates: [],
          frequency: 'none',
          endDate: '',
          weekdays: [],
        }
      }

      if (name === 'multiDateMonth') {
        return { ...current, multiDateMonth: value || getTodayIsoMonth() }
      }

      if (name !== 'frequency') {
        return { ...current, [name]: value }
      }

      if (value === 'none') {
        return {
          ...current,
          frequency: value,
          endDate: '',
          weekdays: [],
        }
      }

      if (value === 'daily') {
        return {
          ...current,
          frequency: value,
          weekdays: [],
        }
      }

      return {
        ...current,
        frequency: value,
      }
    })
  }

  const handleMultiDateToggle = (isoDate) => {
    setForm((current) => {
      const hasDate = current.multiDates.includes(isoDate)
      return {
        ...current,
        multiDates: hasDate
          ? current.multiDates.filter((date) => date !== isoDate)
          : [...current.multiDates, isoDate].sort(),
      }
    })
  }

  const handleShiftMultiDateMonth = (monthOffset) => {
    setForm((current) => ({
      ...current,
      multiDateMonth: shiftIsoMonth(current.multiDateMonth, monthOffset),
    }))
  }

  const handleToggleMultiDateMode = () => {
    setForm((current) => ({
      ...current,
      useMultiDates: !current.useMultiDates,
      multiDates: [],
      frequency: 'none',
      endDate: '',
      weekdays: [],
    }))
  }

  const handleWeekdayToggle = (weekday) => {
    setForm((current) => {
      const weekdayValue = Number(weekday)
      const hasDay = current.weekdays.includes(weekdayValue)
      return {
        ...current,
        weekdays: hasDay
          ? current.weekdays.filter((day) => day !== weekdayValue)
          : [...current.weekdays, weekdayValue].sort((a, b) => a - b),
      }
    })
  }

  const handleAddWidget = async (event) => {
    event.preventDefault()
    if (!canCreate || !userDeadlinesEndpoint) {
      return
    }

    const deadlines = buildRecurringDeadlines(form)
    if (deadlines.length === 0) {
      setSyncError('invalid_recurrence_range')
      return
    }

    const payloads = deadlines.map((deadline) => ({
      label: form.label.trim(),
      deadline,
      frequency: form.frequency,
      endDate: form.endDate || form.deadline,
      weekdays: form.weekdays,
    }))

    setSyncError('')

    try {
      const createdWidgets = await Promise.all(
        payloads.map(async (payload) => {
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

          return {
            id: result.name,
            ...payload,
          }
        }),
      )

      setWidgets((current) => [...current, ...createdWidgets])

      setForm((current) => ({
        ...current,
        label: '',
        deadline: '',
        frequency: 'none',
        endDate: '',
        weekdays: [],
        useMultiDates: false,
        multiDates: [],
        multiDateMonth: getTodayIsoMonth(),
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
      frequency: 'none',
      endDate: '',
      weekdays: [],
      useMultiDates: false,
      multiDates: [],
      multiDateMonth: getTodayIsoMonth(),
    })
    setIsCreateOpen(false)
  }

  const handleQuickAdd = async (event) => {
    event.preventDefault()
    if (!quickAddValue.trim() || !userDeadlinesEndpoint) return

    const todayDate = getTodayIsoDate()
    const payload = { label: quickAddValue.trim(), deadline: todayDate }

    try {
      const response = await fetch(`${userDeadlinesEndpoint}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('save_failed')
      const result = await response.json()
      if (!result?.name) throw new Error('missing_key')
      setWidgets((current) => [...current, { id: result.name, ...payload }])
      setQuickAddValue('')
    } catch {
      setSyncError('unable_to_save_new_deadline')
    }
  }

  const handleSwipeTouchStart = (event, widget) => {
    const touch = event.touches[0]
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, id: widget.id, locked: false }
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({ widget, x: touch.clientX, y: touch.clientY })
      swipeStartRef.current = null
    }, 500)
  }

  const handleSwipeTouchMove = (event) => {
    if (!swipeStartRef.current) return
    const touch = event.touches[0]
    const deltaX = touch.clientX - swipeStartRef.current.x
    const deltaY = touch.clientY - swipeStartRef.current.y

    if (!swipeStartRef.current.locked) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        clearTimeout(longPressTimerRef.current)
      }
      if (Math.abs(deltaY) > Math.abs(deltaX) + 5) {
        swipeStartRef.current = null
        return
      }
      if (Math.abs(deltaX) > 8) {
        swipeStartRef.current.locked = true
      }
    }

    if (swipeStartRef.current.locked) {
      event.preventDefault()
      setSwipeState({ id: swipeStartRef.current.id, offsetX: deltaX })
    }
  }

  const handleSwipeTouchEnd = () => {
    clearTimeout(longPressTimerRef.current)
    if (!swipeStartRef.current) return
    const { id } = swipeStartRef.current
    const { offsetX } = swipeState
    const threshold = 80

    if (offsetX < -threshold) {
      const widget = widgets.find((w) => w.id === id)
      if (widget) handleDeleteWidget(widget)
    } else if (offsetX > threshold) {
      const widget = widgets.find((w) => w.id === id)
      if (widget) handleMarkDone(widget)
    }

    setSwipeState({ id: null, offsetX: 0 })
    swipeStartRef.current = null
  }

  const handlePullRefresh = useCallback(async () => {
    if (!userDeadlinesEndpoint || isPullRefreshing) return
    setIsPullRefreshing(true)
    setSyncError('')
    try {
      const response = await fetch(`${userDeadlinesEndpoint}.json`)
      if (!response.ok) throw new Error('load_failed')
      const data = await response.json()
      setWidgets(toWidgetList(data))
    } catch {
      setSyncError('unable_to_load_remote_deadlines')
    } finally {
      setIsPullRefreshing(false)
    }
  }, [userDeadlinesEndpoint, isPullRefreshing])

  const handlePullTouchStart = (event) => {
    const el = taskListRef.current
    if (!el || el.scrollTop > 0) return
    pullStartRef.current = event.touches[0].clientY
  }

  const handlePullTouchMove = (event) => {
    if (pullStartRef.current === null) return
    const delta = event.touches[0].clientY - pullStartRef.current
    if (delta > 0) {
      event.preventDefault()
      setPullDistance(Math.min(delta * 0.5, 80))
    }
  }

  const handlePullTouchEnd = () => {
    if (pullDistance >= 60) {
      handlePullRefresh()
    }
    setPullDistance(0)
    pullStartRef.current = null
  }

  const showToast = useCallback((message, undoAction) => {
    const id = Date.now()
    const timeoutId = setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, 5000)
    setToasts((current) => [...current, { id, message, undoAction, timeoutId }])
  }, [])

  const handleUndoToast = useCallback((toast) => {
    clearTimeout(toast.timeoutId)
    if (toast.undoAction) toast.undoAction()
    setToasts((current) => current.filter((t) => t.id !== toast.id))
  }, [])

  const handleDismissToast = useCallback((toast) => {
    clearTimeout(toast.timeoutId)
    setToasts((current) => current.filter((t) => t.id !== toast.id))
  }, [])

  const handleDeleteWidget = async (widget) => {
    if (!userDeadlinesEndpoint) return

    const widgetData = typeof widget === 'object' ? widget : widgets.find((w) => w.id === widget)
    if (!widgetData) return

    setWidgets((current) => current.filter((w) => w.id !== widgetData.id))
    if (editingId === widgetData.id) setEditingId(null)

    showToast(`"${widgetData.label}" deleted`, () => {
      setWidgets((current) => [...current, widgetData])
      fetch(`${userDeadlinesEndpoint}/${widgetData.id}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: widgetData.label, deadline: widgetData.deadline, done: widgetData.done || false }),
      }).catch(() => {})
    })

    try {
      const response = await fetch(`${userDeadlinesEndpoint}/${widgetData.id}.json`, { method: 'DELETE' })
      if (!response.ok) throw new Error('delete_failed')
    } catch {
      setWidgets((current) => [...current, widgetData])
      setSyncError('unable_to_delete_deadline')
    }
  }

  const handleMarkDone = async (widget) => {
    if (!userDeadlinesEndpoint) return

    setCompletingId(widget.id)
    await new Promise((resolve) => setTimeout(resolve, 350))
    setCompletingId(null)

    setSyncError('')

    try {
      const response = await fetch(`${userDeadlinesEndpoint}/${widget.id}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: widget.label, deadline: widget.deadline, done: true }),
      })

      if (!response.ok) throw new Error('done_failed')

      setWidgets((current) =>
        current.map((currentWidget) =>
          currentWidget.id === widget.id ? { ...currentWidget, done: true } : currentWidget,
        ),
      )
      if (editingId === widget.id) setEditingId(null)

      showToast(`"${widget.label}" completed`, () => {
        fetch(`${userDeadlinesEndpoint}/${widget.id}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: widget.label, deadline: widget.deadline, done: false }),
        }).then(() => {
          setWidgets((current) =>
            current.map((w) => w.id === widget.id ? { ...w, done: false } : w),
          )
        }).catch(() => {})
      })
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
    setActiveTab('calendar')
    setSelectedCalendarDate(todayIsoDate.startsWith(`${calendarMonth}-`) ? todayIsoDate : '')
  }

  const handleCloseCalendar = () => {
    setActiveTab('home')
    setSelectedCalendarDate('')
  }

  const handleOpenDonePage = () => {
    setSelectedCalendarDate('')
    setActiveTab('done')
  }

  const handleCloseDonePage = () => {
    setActiveTab('home')
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
    setSelectedCalendarDate('')
    setRoomCalendarMonth(getTodayIsoMonth())
    setSelectedRoomDate('')
    setActiveTab('room')
  }

  const handleCloseRoomPage = () => {
    setActiveTab('home')
  }

  const handleRoomCodeChange = (event) => {
    setRoomCodeInput(event.target.value)
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
      // Remove from current room before creating new room
      if (roomCode) {
        await removeUserFromRoom(roomCode, currentUser)
      }

      const newRoomCode = await findAvailableRoomCode()
      await updateRoomMembers(newRoomCode, null, currentUser)
      localStorage.setItem('activeRoomCode', newRoomCode)
      setRoomCode(newRoomCode)
      setRoomCodeInput('')
      setRoomCalendarMonth(getTodayIsoMonth())
      setSelectedRoomDate(getTodayIsoDate())
      setActiveTab('room')
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
      // Remove from current room before joining new room
      if (roomCode && roomCode !== nextRoomCode) {
        await removeUserFromRoom(roomCode, currentUser)
      }

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
      setRoomCalendarMonth(getTodayIsoMonth())
      setSelectedRoomDate(getTodayIsoDate())
      setActiveTab('room')
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
    if (!roomCode) {
      return
    }
    setIsLeaveRoomConfirmOpen(true)
  }

  const handleConfirmLeaveRoom = async () => {
    setIsLeaveRoomConfirmOpen(false)
    if (!roomCode) {
      return
    }

    // Remove user from room in database before clearing local state
    await removeUserFromRoom(roomCode, currentUser)

    localStorage.removeItem('activeRoomCode')
    setRoomCode('')
    setRoomCodeInput('')
    setRoomTasks([])
    setRoomMembers([])
    setRoomStatus('')
    setRoomError('')
    setActiveTab('home')
  }

  const handleCancelLeaveRoom = () => {
    setIsLeaveRoomConfirmOpen(false)
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
      {activeTab === 'room' ? (
        <section className="room-page" aria-label="Room task overview">
          {!roomCode ? (
            <>
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
                {roomError ? (
                  <p className="room-error" role="alert">{formatErrorMessage(roomError)}</p>
                ) : null}
              </article>
            </div>
            </>
          ) : (
            <>
              <section className="room-summary" aria-live="polite">
                <div className="room-summary-row">
                  <span className="room-pill">code {roomCode}</span>
                  <span className="room-pill">members {roomMembers.length}</span>
                  <button type="button" className="room-action-btn room-action-btn-leave" onClick={handleLeaveRoom}>
                    leave_room
                  </button>
                </div>
                {roomError ? (
                  <p className="room-error" role="alert">{formatErrorMessage(roomError)}</p>
                ) : null}
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

        </section>
      ) : activeTab === 'calendar' ? (
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
        </section>
      ) : activeTab === 'done' ? (
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
                      onClick={() => handleDeleteWidget(widget)}
                    >
                      delete
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </section>
      ) : (
        <>

          <div className="quick-add">
            <form className="quick-add-form" onSubmit={handleQuickAdd}>
              <input
                className="quick-add-input"
                value={quickAddValue}
                onChange={(e) => setQuickAddValue(e.target.value)}
                placeholder="add a task..."
                aria-label="Quick add task"
              />
              <button
                type="button"
                className="quick-add-expand-btn"
                onClick={handleOpenCreate}
                aria-label="More options"
              >
                +options
              </button>
              <button
                type="submit"
                className="quick-add-submit"
                disabled={!quickAddValue.trim()}
                aria-label="Add task"
              >
                +
              </button>
            </form>
          </div>

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
                      ? formatErrorMessage(syncError)
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

                  <button
                    type="button"
                    className={`toggle-mode-btn${form.useMultiDates ? ' toggle-mode-btn-active' : ''}`}
                    onClick={handleToggleMultiDateMode}
                    aria-pressed={form.useMultiDates}
                  >
                    pick_specific_dates
                  </button>

                  {!form.useMultiDates ? (
                    <>
                      <label>
                        deadline_yyyy_mm_dd
                        <input
                          name="deadline"
                          type="date"
                          value={form.deadline}
                          onChange={handleFormChange}
                        />
                      </label>

                      <label>
                        frequency
                        <select name="frequency" value={form.frequency} onChange={handleFormChange}>
                          <option value="none">one_time</option>
                          <option value="daily">every_day</option>
                          <option value="weekly">every_week</option>
                        </select>
                      </label>

                      {form.frequency !== 'none' ? (
                        <label>
                          repeat_until
                          <input
                            name="endDate"
                            type="date"
                            value={form.endDate}
                            onChange={handleFormChange}
                            min={form.deadline || undefined}
                          />
                        </label>
                      ) : null}

                      {form.frequency === 'weekly' ? (
                        <div className="weekday-picker" aria-label="Select repeat weekdays">
                          <p className="weekday-picker-title">multi_day</p>
                          <div className="weekday-picker-grid">
                            {RECURRING_WEEKDAY_OPTIONS.map((dayOption) => {
                              const isSelected = form.weekdays.includes(dayOption.value)
                              return (
                                <button
                                  key={dayOption.value}
                                  type="button"
                                  className={`weekday-btn${isSelected ? ' weekday-btn-selected' : ''}`}
                                  onClick={() => handleWeekdayToggle(dayOption.value)}
                                  aria-pressed={isSelected}
                                >
                                  {dayOption.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="multi-date-picker">
                      <div className="multi-date-picker-header">
                        <p className="multi-date-picker-title">
                          select_dates ({form.multiDates.length})
                        </p>
                        <div className="multi-date-month-picker">
                          <button
                            type="button"
                            onClick={() => handleShiftMultiDateMonth(-1)}
                            className="multi-date-month-nav"
                          >
                            &lt;
                          </button>
                          <input
                            type="month"
                            value={form.multiDateMonth}
                            onChange={(e) =>
                              setForm((current) => ({
                                ...current,
                                multiDateMonth: e.target.value || getTodayIsoMonth(),
                              }))
                            }
                            className="multi-date-month-input"
                          />
                          <button
                            type="button"
                            onClick={() => handleShiftMultiDateMonth(1)}
                            className="multi-date-month-nav"
                          >
                            &gt;
                          </button>
                        </div>
                      </div>

                      <div className="multi-date-calendar">
                        {CALENDAR_WEEK_DAYS.map((dayName) => (
                          <p key={dayName} className="multi-date-weekday">
                            {dayName}
                          </p>
                        ))}
                        {(() => {
                          const [yearString, monthString] = form.multiDateMonth.split('-')
                          const year = Number(yearString)
                          const month = Number(monthString)
                          const firstDayIndex = new Date(year, month - 1, 1).getDay()
                          const dayCount = new Date(year, month, 0).getDate()

                          const cells = []
                          for (let index = 0; index < firstDayIndex; index += 1) {
                            cells.push(
                              <div key={`empty-${index}`} className="multi-date-cell-empty" />,
                            )
                          }

                          for (let day = 1; day <= dayCount; day += 1) {
                            const dayString = String(day).padStart(2, '0')
                            const isoDate = `${yearString}-${monthString}-${dayString}`
                            const isSelected = form.multiDates.includes(isoDate)

                            cells.push(
                              <button
                                key={isoDate}
                                type="button"
                                onClick={() => handleMultiDateToggle(isoDate)}
                                className={`multi-date-cell${isSelected ? ' multi-date-cell-selected' : ''}`}
                              >
                                {day}
                              </button>,
                            )
                          }

                          return cells
                        })()}
                      </div>
                    </div>
                  )}

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

          <div
            ref={taskListRef}
            className="task-list-scroll"
            onTouchStart={handlePullTouchStart}
            onTouchMove={handlePullTouchMove}
            onTouchEnd={handlePullTouchEnd}
          >
            {pullDistance > 0 || isPullRefreshing ? (
              <div className="pull-indicator" style={{ height: isPullRefreshing ? 48 : pullDistance * 0.8 }}>
                {isPullRefreshing ? 'refreshing...' : pullDistance >= 60 ? 'release to refresh' : 'pull to refresh'}
              </div>
            ) : null}
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
          Object.entries(groupedWidgets).map(([groupKey, groupTasks]) => {
            if (groupTasks.length === 0) return null
            const groupLabels = { overdue: 'Overdue', today: 'Due Today', tomorrow: 'Tomorrow', upcoming: 'Upcoming' }
            return (
              <div key={groupKey} className="task-group">
                <p className={`task-group-header task-group-${groupKey}`}>{groupLabels[groupKey]}</p>
                {groupTasks.map((widget) => (
              <div
                key={widget.id}
                className="swipe-container"
              >
                <div className="swipe-action-left" aria-hidden="true">done ✓</div>
                <div className="swipe-action-right" aria-hidden="true">delete ✕</div>
              <article
                className={`ios-widget${
                  widget.daysLeft < 0
                    ? ' widget-overdue'
                    : widget.daysLeft === 0
                    ? ' widget-due-today'
                    : widget.daysLeft === 1
                      ? ' widget-warning'
                      : ''
                }${completingId === widget.id ? ' ios-widget-completing' : ''}`}
                aria-label={`${widget.label} countdown widget`}
                onTouchStart={(e) => handleSwipeTouchStart(e, widget)}
                onTouchMove={handleSwipeTouchMove}
                onTouchEnd={handleSwipeTouchEnd}
                style={swipeState.id === widget.id
                  ? { transform: `translateX(${swipeState.offsetX}px)`, transition: 'none' }
                  : undefined}
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
                      onClick={() => handleDeleteWidget(widget)}
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
                      <p className="widget-status">{widget.daysLeft < 0 ? '[OVERDUE]' : '[TIME_LEFT]'}</p>
                      <div className="widget-count-row">
                        <p className="widget-count">{widget.daysLeft < 0 ? Math.abs(widget.daysLeft) : widget.daysLeft}</p>
                        <p className="widget-unit">{widget.daysLeft < 0 ? 'DAYS AGO' : 'DAYS'}</p>
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
                      onClick={() => handleDeleteWidget(widget)}
                    >
                      delete
                    </button>
                  </div>
                </>
              )}
              </article>
              </div>
                ))}
              </div>
            )
          })
        )}
          </section>
          </div>
        </>
      )}
      </div>

      {isLeaveRoomConfirmOpen ? (
        <section
          className="create-popup-overlay"
          aria-label="Leave room confirmation"
          role="dialog"
          aria-modal="true"
          onClick={handleCancelLeaveRoom}
        >
          <article
            className="create-popup-card confirm-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="confirm-title">Leave this room?</h2>
            <p className="confirm-copy">
              You will stop seeing shared tasks from room {roomCode}. You can rejoin any time with the same code.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="create-toggle-btn confirm-cancel-btn"
                onClick={handleCancelLeaveRoom}
              >
                cancel
              </button>
              <button
                type="button"
                className="create-toggle-btn confirm-destructive-btn"
                onClick={handleConfirmLeaveRoom}
              >
                leave_room
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {contextMenu ? (
        <div className="context-menu-overlay" onClick={() => setContextMenu(null)} aria-hidden="true">
          <div
            className="context-menu"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 160),
              left: Math.min(contextMenu.x, window.innerWidth - 180),
            }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            <button
              type="button"
              className="context-menu-item"
              role="menuitem"
              onClick={() => { handleStartEdit(contextMenu.widget); setContextMenu(null) }}
            >
              edit
            </button>
            <button
              type="button"
              className="context-menu-item"
              role="menuitem"
              onClick={() => { handleMarkDone(contextMenu.widget); setContextMenu(null) }}
            >
              mark_done
            </button>
            <button
              type="button"
              className="context-menu-item context-menu-item-danger"
              role="menuitem"
              onClick={() => { handleDeleteWidget(contextMenu.widget); setContextMenu(null) }}
            >
              delete
            </button>
          </div>
        </div>
      ) : null}

      {toasts.length > 0 ? (
        <div className="toast-container" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast">
              <span className="toast-message">{toast.message}</span>
              {toast.undoAction ? (
                <button type="button" className="toast-undo-btn" onClick={() => handleUndoToast(toast)}>
                  undo
                </button>
              ) : null}
              <button type="button" className="toast-dismiss-btn" onClick={() => handleDismissToast(toast)} aria-label="Dismiss">
                &times;
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <nav className="bottom-tab-bar" aria-label="Main navigation">
        <button
          type="button"
          className={`tab-bar-item${activeTab === 'home' ? ' tab-bar-item-active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <svg className="tab-bar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M3 12l9-8 9 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5 10v9a1 1 0 001 1h12a1 1 0 001-1v-9" fill="none" stroke="currentColor" strokeWidth="1.8"/>
          </svg>
          <span className="tab-bar-label">home</span>
        </button>
        <button
          type="button"
          className={`tab-bar-item${activeTab === 'calendar' ? ' tab-bar-item-active' : ''}`}
          onClick={handleOpenCalendar}
        >
          <svg className="tab-bar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 3.5v4M16 3.5v4M4 9h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span className="tab-bar-label">calendar</span>
        </button>
        <button
          type="button"
          className={`tab-bar-item${activeTab === 'done' ? ' tab-bar-item-active' : ''}`}
          onClick={handleOpenDonePage}
        >
          <svg className="tab-bar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8.5 12.5l2.2 2.2 4.8-5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6"/>
          </svg>
          <span className="tab-bar-label">done</span>
        </button>
        <button
          type="button"
          className={`tab-bar-item${activeTab === 'room' ? ' tab-bar-item-active' : ''}`}
          onClick={handleOpenRoomPage}
        >
          <svg className="tab-bar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 20V6.5l8-3.5 8 3.5V20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
            <path d="M9 20v-5.5h6V20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
          </svg>
          <span className="tab-bar-label">room</span>
        </button>
      </nav>
    </main>
  )
}

export default App
