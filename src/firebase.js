// Firebase Database Configuration
const FIREBASE_USERS_ENDPOINT =
  'https://todolist-database-aae1c-default-rtdb.firebaseio.com/users'

// User authentication functions
export const checkUserExists = async (username) => {
  const response = await fetch(`${FIREBASE_USERS_ENDPOINT}.json`)
  if (!response.ok) {
    return false
  }

  const data = await response.json()
  if (!data) {
    return false
  }

  // Check if username already exists
  return Object.values(data).some((user) => user.username === username)
}

export const createUser = async (username, password) => {
  const userData = {
    username: username,
    passwordHash: btoa(`${username}:${password}`),
    createdAt: new Date().toISOString(),
  }

  const response = await fetch(`${FIREBASE_USERS_ENDPOINT}.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  })

  if (!response.ok) {
    throw new Error('Failed to create user')
  }

  const result = await response.json()
  return result.name // Returns the user ID
}

export const authenticateUser = async (username, password) => {
  const response = await fetch(`${FIREBASE_USERS_ENDPOINT}.json`)
  if (!response.ok) {
    throw new Error('Authentication failed')
  }

  const data = await response.json()
  if (!data) {
    throw new Error('No users found')
  }

  // Find user with matching username and password
  const user = Object.entries(data).find(
    ([, user]) =>
      user.username === username && user.passwordHash === btoa(`${username}:${password}`),
  )

  if (!user) {
    throw new Error('Invalid username or password')
  }

  return user[1] // Return user data
}
