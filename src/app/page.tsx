'use client'

import { useState } from 'react'

export default function Home() {
  const [userId, setUserId] = useState('')
  const [storeUrl, setStoreUrl] = useState('')
  const [storePassword, setStorePassword] = useState('')
  const [themePassword, setThemePassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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
        setMessage(`✅ ${data.message}`)
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
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
              {message}
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
      </main>
    </div>
  );
}
