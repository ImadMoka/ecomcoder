'use client'

import { useState } from 'react'

export default function Home() {
  const [userId, setUserId] = useState('bf79ab89-9aca-4ee8-9f47-f2ba66edd1ff')
  const [storeUrl, setStoreUrl] = useState('shopyviber.myshopify.com')
  const [storePassword, setStorePassword] = useState('soxohs')
  const [themePassword, setThemePassword] = useState('shptka_38499bbf096f900f31b4efd0034de4f4')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [localUrl, setLocalUrl] = useState('')

  // Chat testing state
  const [sessionId, setSessionId] = useState('')
  const [chatMessage, setChatMessage] = useState('')
  const [chatResponse, setChatResponse] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')

  const handleCreateTheme = async () => {
    if (!userId.trim()) {
      setError('Please enter a User ID')
      return
    }

    if (!storeUrl.trim()) {
      setError('Please enter a Shopify URL')
      return
    }

    if (!themePassword.trim()) {
      setError('Please enter a Shopify Theme Password')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/create-theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId.trim(),
          storeUrl: storeUrl.trim(),
          storePassword: storePassword.trim(),
          apiKey: themePassword.trim()
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ Theme created successfully!`)
        setPublicUrl(data.publicUrl || '')
        setLocalUrl(data.localUrl || data.previewUrl || '')
        // If we got a sessionId back, set it for chat testing
        if (data.sessionId) {
          setSessionId(data.sessionId)
        }
      } else {
        setError(`❌ ${data.error}`)
      }
    } catch (err) {
      setError('❌ Failed to connect to the server')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleChatTest = async () => {
    if (!sessionId.trim()) {
      setChatError('Please enter a Session ID')
      return
    }

    if (!chatMessage.trim()) {
      setChatError('Please enter a message')
      return
    }

    setChatLoading(true)
    setChatError('')
    setChatResponse('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId.trim(),
          message: chatMessage.trim()
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setChatResponse(data.message || 'Claude completed the task successfully!')
      } else {
        setChatError(`❌ ${data.error}`)
      }
    } catch (err) {
      setChatError('❌ Failed to connect to the chat API')
      console.error('Chat Error:', err)
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center">
        <h1 className="text-2xl font-bold text-center">Theme Creator</h1>

        <div className="flex flex-col gap-4 w-full max-w-md">
          <div className="flex flex-col gap-2">
            <label htmlFor="userId" className="text-sm font-medium">
              User ID:
            </label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user ID"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="storeUrl" className="text-sm font-medium">
              Shopify URL:
            </label>
            <input
              id="storeUrl"
              type="url"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="https://your-store.myshopify.com"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="storePassword" className="text-sm font-medium">
              Shopify Store Password (Optional):
            </label>
            <input
              id="storePassword"
              type="password"
              value={storePassword}
              onChange={(e) => setStorePassword(e.target.value)}
              placeholder="Enter store password (if required)"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="themePassword" className="text-sm font-medium">
              Shopify Theme Password:
            </label>
            <input
              id="themePassword"
              type="password"
              value={themePassword}
              onChange={(e) => setThemePassword(e.target.value)}
              placeholder="Enter theme password"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <button
            onClick={handleCreateTheme}
            disabled={loading || !userId.trim() || !storeUrl.trim() || !themePassword.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-md transition-colors"
          >
            {loading ? 'Creating Theme...' : 'Create Theme'}
          </button>

          {message && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
              <div className="font-medium mb-2">{message}</div>
              {publicUrl && (
                <div className="mt-2 space-y-1">
                  <div>
                    <strong>🌍 Public URL (ngrok):</strong>
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 hover:underline break-all">
                      {publicUrl}
                    </a>
                  </div>
                  {localUrl && (
                    <div>
                      <strong>🏠 Local URL:</strong>
                      <span className="ml-2 break-all">{localUrl}</span>
                    </div>
                  )}
                </div>
              )}
              {!publicUrl && localUrl && (
                <div className="mt-2">
                  <strong>Preview URL:</strong>
                  <span className="ml-2 break-all">{localUrl}</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="text-center text-sm text-gray-600 max-w-md">
          <p>
            This will create a Supabase user sandbox record for this user + Shopify URL combination (if it doesn&apos;t exist) and
            generate a theme folder at <code className="bg-gray-100 px-1 py-0.5 rounded">/themes/user_{'{'}{userId}{'}'}/theme_1</code>
          </p>
        </div>

        {/* Divider */}
        <div className="w-full max-w-md border-t border-gray-300 my-8"></div>

        {/* Chat Testing Section */}
        <h2 className="text-xl font-bold text-center">Claude Assistant Chat Test</h2>

        <div className="flex flex-col gap-4 w-full max-w-md">
          <div className="flex flex-col gap-2">
            <label htmlFor="sessionId" className="text-sm font-medium">
              Session ID:
            </label>
            <input
              id="sessionId"
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Enter session ID"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              disabled={chatLoading}
            />
            <p className="text-xs text-gray-500">
              Create a theme above to get a session ID, or use an existing one
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="chatMessage" className="text-sm font-medium">
              Message:
            </label>
            <textarea
              id="chatMessage"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask Claude to help with your theme..."
              rows={3}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              disabled={chatLoading}
            />
          </div>

          <button
            onClick={handleChatTest}
            disabled={chatLoading || !sessionId.trim() || !chatMessage.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-md transition-colors"
          >
            {chatLoading ? 'Asking Claude...' : 'Send to Claude'}
          </button>

          {chatResponse && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
              <h4 className="font-medium mb-2">Claude Response:</h4>
              <pre className="whitespace-pre-wrap text-xs">{chatResponse}</pre>
            </div>
          )}

          {chatError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
              {chatError}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
