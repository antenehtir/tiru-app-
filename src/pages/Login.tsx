import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react'

type Mode = 'login' | 'forgot' | 'feedback'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')

  // Login form
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loginErr,  setLoginErr]  = useState<string | null>(null)

  // Forgot password
  const [forgotEmail,   setForgotEmail]   = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg,     setForgotMsg]     = useState<string | null>(null)
  const [forgotErr,     setForgotErr]     = useState<string | null>(null)

  // Feedback
  const [fbName,    setFbName]    = useState('')
  const [fbMessage, setFbMessage] = useState('')
  const [fbLoading, setFbLoading] = useState(false)
  const [fbSuccess, setFbSuccess] = useState(false)
  const [fbErr,     setFbErr]     = useState<string | null>(null)

  const SUPER_ADMIN_ID = 'de804b96-373e-43b8-9214-b088032d0db7'

  // ── Login ────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginErr(null)
    setLoggingIn(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginErr(error.message)
    setLoggingIn(false)
  }

  // ── Forgot password ──────────────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotErr(null); setForgotMsg(null)
    if (!forgotEmail.trim()) return setForgotErr('Please enter your email address.')
    setForgotLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setForgotLoading(false)
    if (error) { setForgotErr(error.message); return }
    setForgotMsg('Password reset email sent. Check your inbox.')
  }

  // ── Feedback ─────────────────────────────────────────────────────────────
  const handleFeedback = async (e: React.FormEvent) => {
    e.preventDefault()
    setFbErr(null)
    if (!fbMessage.trim()) return setFbErr('Please write a message.')
    setFbLoading(true)

    // Insert into feedback table
    const { error: fbInsertErr } = await supabase.from('feedback').insert({
      name:    fbName.trim() || null,
      message: fbMessage.trim(),
    })
    if (fbInsertErr) { setFbErr(fbInsertErr.message); setFbLoading(false); return }

    // Send personal notice to super admin
    await supabase.from('notices').insert({
      author_id:      SUPER_ADMIN_ID,
      title:          `Feedback${fbName.trim() ? ` from ${fbName.trim()}` : ' (Anonymous)'}`,
      body:           fbMessage.trim(),
      priority:       'info',
      audience:       'all',
      audience_type:  'personal',
      target_user_id: SUPER_ADMIN_ID,
      pinned:         false,
    })

    setFbLoading(false)
    setFbSuccess(true)
    setFbName(''); setFbMessage('')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-600 mb-3 shadow-lg">
            <span className="text-white text-lg font-bold tracking-tight">Tiru</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tiru</h1>
          <p className="text-sm text-gray-500 mt-1">Real-Time Healthcare Operations Intelligence</p>
        </div>

        {/* ── LOGIN FORM ── */}
        {mode === 'login' && (
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Sign in to your account</h2>

            {loginErr && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{loginErr}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" required autoComplete="email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loggingIn}
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {loggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
                {loggingIn ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            {/* Forgot password + Feedback links */}
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => { setMode('forgot'); setForgotEmail(''); setForgotMsg(null); setForgotErr(null) }}
                className="text-xs text-teal-600 hover:text-teal-700 hover:underline transition-colors">
                Forgot password?
              </button>
              <button onClick={() => { setMode('feedback'); setFbSuccess(false); setFbErr(null) }}
                className="text-xs text-gray-400 hover:text-gray-600 hover:underline transition-colors">
                Send feedback
              </button>
            </div>
          </div>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {mode === 'forgot' && (
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Reset your password</h2>
              <button onClick={() => setMode('login')} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500">Enter your email and we'll send you a reset link.</p>

            {forgotErr && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{forgotErr}
              </div>
            )}
            {forgotMsg && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{forgotMsg}
              </div>
            )}

            {!forgotMsg && (
              <form onSubmit={handleForgot} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    placeholder="your@email.com" required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <button type="submit" disabled={forgotLoading}
                  className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {forgotLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            )}

            {forgotMsg && (
              <button onClick={() => setMode('login')}
                className="w-full border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium py-2.5 rounded-lg transition-colors text-sm">
                Back to Sign In
              </button>
            )}
          </div>
        )}

        {/* ── FEEDBACK ── */}
        {mode === 'feedback' && (
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Send Feedback</h2>
              <button onClick={() => setMode('login')} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500">Your feedback goes directly to platform management.</p>

            {fbErr && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{fbErr}
              </div>
            )}

            {fbSuccess ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />Thank you — your feedback has been received.
                </div>
                <button onClick={() => { setMode('login'); setFbSuccess(false) }}
                  className="w-full border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium py-2.5 rounded-lg transition-colors text-sm">
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleFeedback} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Name <span className="normal-case font-normal text-gray-400">(optional)</span>
                  </label>
                  <input type="text" value={fbName} onChange={e => setFbName(e.target.value)}
                    placeholder="Your name…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Message *</label>
                  <textarea rows={4} value={fbMessage} onChange={e => setFbMessage(e.target.value)}
                    placeholder="Share your thoughts, suggestions, or concerns…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
                </div>
                <button type="submit" disabled={fbLoading}
                  className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                  {fbLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {fbLoading ? 'Sending…' : 'Send Feedback'}
                </button>
              </form>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
