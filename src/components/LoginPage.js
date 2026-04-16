import React, { useState } from 'react'
import { supabase } from '../supabase'

const ALLOWED_DOMAIN = 'reactiontackle.com'

export default function LoginPage() {
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const validateEmail = (e) => {
    const domain = e.split('@')[1]?.toLowerCase()
    if (!domain || domain !== ALLOWED_DOMAIN) {
      return `Only @${ALLOWED_DOMAIN} email addresses are allowed.`
    }
    return null
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    const emailError = validateEmail(email)
    if (emailError) { setError(emailError); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    const emailError = validateEmail(email)
    if (emailError) { setError(emailError); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Account created! Check your email to confirm, then sign in.')
      setMode('login')
    }
    setLoading(false)
  }

  const handleReset = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    const emailError = validateEmail(email)
    if (emailError) { setError(emailError); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Password reset link sent — check your email.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>
        {/* Logo / header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, background: '#1F3864', borderRadius: 14, marginBottom: 16 }}>
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>OP</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Order Planner</h1>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Reaction Tackle & SG Operations</p>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '32px 28px', boxShadow: '0 2px 16px rgba(0,0,0,.08)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 20px', color: '#1a1a1a' }}>
            {mode === 'login' ? 'Sign in to your account' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </h2>

          {error && (
            <div style={{ background: '#FCEBEB', color: '#A32D2D', padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 16, border: '1px solid #F09595' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: '#EAF3DE', color: '#27500A', padding: '10px 14px', borderRadius: 8, fontSize: 12, marginBottom: 16, border: '1px solid #97C459' }}>
              {success}
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleReset}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@reactiontackle.com"
                required
                style={inputStyle}
              />
            </div>

            {mode !== 'reset' && (
              <div style={{ marginBottom: mode === 'signup' ? 16 : 24 }}>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                  required
                  style={inputStyle}
                />
              </div>
            )}

            {mode === 'signup' && (
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={inputStyle}
                />
              </div>
            )}

            {mode === 'reset' && <div style={{ marginBottom: 24 }} />}

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '11px', background: loading ? '#8BA4CC' : '#1F3864', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </form>

          {/* Mode switchers */}
          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#666' }}>
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('signup'); setError(''); setSuccess('') }} style={linkStyle}>Create an account</button>
                <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
                <button onClick={() => { setMode('reset'); setError(''); setSuccess('') }} style={linkStyle}>Forgot password?</button>
              </>
            )}
            {mode === 'signup' && (
              <button onClick={() => { setMode('login'); setError(''); setSuccess('') }} style={linkStyle}>Already have an account? Sign in</button>
            )}
            {mode === 'reset' && (
              <button onClick={() => { setMode('login'); setError(''); setSuccess('') }} style={linkStyle}>Back to sign in</button>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#aaa', marginTop: 16 }}>
          Access restricted to @{ALLOWED_DOMAIN} accounts only
        </p>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#444', marginBottom: 6 }
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }
const linkStyle = { background: 'none', border: 'none', color: '#1F3864', cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: 0, textDecoration: 'underline' }
