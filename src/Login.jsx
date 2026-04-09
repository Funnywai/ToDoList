import { useState } from 'react'
import './Login.css'
import { checkUserExists, createUser, authenticateUser } from './firebase'

export default function Login({ onLogin }) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    // Validation
    if (!username.trim()) {
      setError('Username is required')
      setIsLoading(false)
      return
    }

    if (!password) {
      setError('Password is required')
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setIsLoading(false)
      return
    }

    try {
      // Authenticate with database
      await authenticateUser(username, password)

      // Store user data in localStorage
      const userData = {
        username: username,
        loginTime: new Date().toISOString(),
      }
      localStorage.setItem('user', JSON.stringify(userData))
      localStorage.setItem('authToken', btoa(`${username}:${password}`))

      // Call parent callback
      onLogin(username)

      setUsername('')
      setPassword('')
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    // Validation
    if (!username.trim()) {
      setError('Username is required')
      setIsLoading(false)
      return
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      setIsLoading(false)
      return
    }

    if (!password) {
      setError('Password is required')
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setIsLoading(false)
      return
    }

    if (!confirmPassword) {
      setError('Please confirm your password')
      setIsLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    try {
      // Check if user already exists
      const userExists = await checkUserExists(username)
      if (userExists) {
        setError('Username already exists. Please choose a different one.')
        setIsLoading(false)
        return
      }

      // Create new user in database
      await createUser(username, password)

      // Auto-login after successful sign-up
      const userData = {
        username: username,
        loginTime: new Date().toISOString(),
      }
      localStorage.setItem('user', JSON.stringify(userData))
      localStorage.setItem('authToken', btoa(`${username}:${password}`))

      // Call parent callback
      onLogin(username)

      setUsername('')
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message || 'Failed to create account. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleMode = () => {
    setIsSignUp(!isSignUp)
    setError('')
    setUsername('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Countdown</h1>
        <form onSubmit={isSignUp ? handleSignUp : handleLogin}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {isSignUp && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={isLoading} className="login-button">
            {isLoading ? (isSignUp ? 'Creating account...' : 'Logging in...') : isSignUp ? 'Create Account' : 'Login'}
          </button>
        </form>

        <div className="auth-toggle">
          {isSignUp ? (
            <p>
              Already have an account?{' '}
              <button type="button" onClick={toggleMode} className="toggle-link">
                Login here
              </button>
            </p>
          ) : (
            <p>
              Don't have an account?{' '}
              <button type="button" onClick={toggleMode} className="toggle-link">
                Create User
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
