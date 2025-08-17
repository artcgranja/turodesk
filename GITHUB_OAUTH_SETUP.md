# GitHub OAuth Setup

To enable GitHub authentication in Turodesk, you need to create a GitHub OAuth App.

## Configuration Steps:

### 1. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the fields:
   - **Application name**: `Turodesk`
   - **Homepage URL**: `https://github.com/artcgranja/turodesk`
   - **Application description**: `Turodesk Desktop AI Assistant`
   - **Authorization callback URL**: `http://localhost:3000/callback`

### 2. Get Credentials

After creating the app, you will receive:
- **Client ID**: Copy this value
- **Client Secret**: Click "Generate a new client secret" and copy

### 3. Configure Environment Variables

Add to your `.env` file:

```env
# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your-client-id-here
GITHUB_CLIENT_SECRET=your-client-secret-here
```

### 4. Test Authentication

1. Restart the application: `npm start`
2. Click "Sign in with GitHub" in the sidebar
3. GitHub OAuth will open in your default browser
4. Authorize the application on GitHub
5. You will be redirected and authenticated automatically

### External Browser Advantages:

- ✅ **Uses your saved credentials** in the browser
- ✅ **Full 2FA/passkeys support** without issues
- ✅ **More secure and reliable** than internal windows
- ✅ **No "partial passkey support" messages**
- ✅ **No re-login required** if already authenticated

## Authentication Features:

- ✅ **GitHub OAuth login** via external browser
- ✅ **User avatar and information** in sidebar
- ✅ **Chats linked to authenticated user**
- ✅ **Automatic session persistence** (stays logged in)
- ✅ **Logout with fallback** to local user
- ✅ **Automatic validation** of saved state on startup
- ✅ **Session expiration** after 30 days (configurable)

## Troubleshooting:

- **Credentials error**: Verify that `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are correct
- **Callback error**: Make sure the callback URL is exactly `http://localhost:3000/callback`
- **Permissions**: The app only requests `user:email` to get basic information
- **Port 3000 occupied**: Close other services on port 3000 before logging in
- **Browser doesn't open**: Check if there's a default browser configured on the system
- **Authentication timeout**: The process expires in 5 minutes, try again if necessary

## Security:

- **OAuth credentials** stay only in the local environment
- **We don't store access tokens** permanently
- **Only basic profile information** is used
- **Authentication state** saved locally in `~/Library/Application Support/turodesk/turodesk/auth.json`
- **Automatic validation** checks if the user still exists in the database
- **Automatic expiration** of session after 30 days for security