# Setup Instructions

## 🚀 What's Been Implemented

✅ **Frontend**: Simple button with user ID input that calls the backend API
✅ **Backend**: API endpoint `/api/create-theme` that handles the complete flow
✅ **Supabase Integration**: Ready to check/create user records
✅ **Build Script**: `build.sh` that creates theme folder structure
✅ **Error Handling**: Proper validation and error messages

## ⚙️ Required Setup

### 1. Configure Supabase

1. Create a Supabase project at [https://app.supabase.com](https://app.supabase.com)
2. Go to Project Settings → API
3. Copy your project URL and anon key
4. Update `.env.local` with your actual values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
```

### 2. Create Users Table in Supabase

Run this SQL in your Supabase SQL editor:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3. Test the Application

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open [http://localhost:3000](http://localhost:3000)

3. Enter a user ID and click "Create Theme"

## 📁 What Happens When You Click the Button

1. **Frontend** → Sends POST request to `/api/create-theme` with `userId`
2. **Backend** → Checks if user exists in Supabase `users` table
3. **Backend** → Creates user record if it doesn't exist
4. **Backend** → Executes `build.sh` script with the `userId`
5. **Build Script** → Creates folder structure: `/themes/user_{id}/theme_1`
6. **Build Script** → Adds a `README.md` file with creation timestamp
7. **Frontend** → Shows success/error message

## 🧪 Testing

The `build.sh` script has been tested and works correctly. You can test it manually:

```bash
./build.sh test_user_456
```

This will create: `themes/user_test_user_456/theme_1/README.md`

## 🔧 Troubleshooting

- **Build fails**: Make sure your Supabase environment variables are set correctly
- **API errors**: Check your Supabase configuration and table setup
- **Permission errors**: Ensure the `build.sh` script is executable (`chmod +x build.sh`)

Your theme creator is ready to use! 🎉