import { BrowserWindow, shell, app } from 'electron';
import { DatabaseQueries, type User } from '../db/queries';
import { createServer } from 'http';
import fs from 'node:fs';
import path from 'node:path';

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  dbUser: User | null;
}

export class GitHubAuth {
  private clientId: string;
  private clientSecret: string;
  private db: DatabaseQueries;
  private authState: AuthState = {
    isAuthenticated: false,
    user: null,
    dbUser: null
  };
  private authFilePath: string;

  constructor(db: DatabaseQueries) {
    this.db = db;
    // GitHub OAuth App credentials - você precisará criar um GitHub OAuth App
    this.clientId = process.env.GITHUB_CLIENT_ID || '';
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
    
    // Path to store auth state
    const userDataPath = app.getPath('userData');
    const turodeskDir = path.join(userDataPath, 'turodesk');
    if (!fs.existsSync(turodeskDir)) {
      fs.mkdirSync(turodeskDir, { recursive: true });
    }
    this.authFilePath = path.join(turodeskDir, 'auth.json');
    
    // Load saved auth state
    this.loadAuthState();
  }

  async startAuthFlow(useExternalBrowser: boolean = true): Promise<AuthState> {
    if (!this.clientId || !this.clientSecret) {
      console.warn('GitHub OAuth credentials not configured. Please see GITHUB_OAUTH_SETUP.md for setup instructions.');
      throw new Error('GitHub OAuth not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file.');
    }

    if (useExternalBrowser) {
      return this.startAuthFlowExternal();
    }

    return new Promise((resolve, reject) => {
      // Create auth window with better configuration
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        modal: true,
        center: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          experimentalFeatures: false
        }
      });

      // Set a proper user agent to avoid passkey issues
      authWindow.webContents.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${this.clientId}&scope=user:email&redirect_uri=http://localhost:3000/callback`;
      
      authWindow.loadURL(authUrl);

      // Handle redirect
      authWindow.webContents.on('will-redirect', async (event, url) => {
        if (url.startsWith('http://localhost:3000/callback')) {
          event.preventDefault();
          
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');
          const error = urlObj.searchParams.get('error');

          authWindow.close();

          if (error) {
            reject(new Error(`GitHub auth error: ${error}`));
            return;
          }

          if (code) {
            try {
              const authState = await this.exchangeCodeForToken(code);
              resolve(authState);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error('No authorization code received'));
          }
        }
      });

      authWindow.on('closed', () => {
        reject(new Error('Auth window closed by user'));
      });
    });
  }

  private async exchangeCodeForToken(code: string): Promise<AuthState> {
    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: code,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        throw new Error(`Token exchange error: ${tokenData.error_description}`);
      }

      const accessToken = tokenData.access_token;

      // Get user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'User-Agent': 'Turodesk-App',
        },
      });

      const githubUser: GitHubUser = await userResponse.json();

      // Get user email if not public
      if (!githubUser.email) {
        const emailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `token ${accessToken}`,
            'User-Agent': 'Turodesk-App',
          },
        });
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((email: any) => email.primary);
        if (primaryEmail) {
          githubUser.email = primaryEmail.email;
        }
      }

      // Create or update user in database
      let dbUser = await this.db.getUserByUsername(githubUser.login);
      if (!dbUser) {
        dbUser = await this.db.createUser(githubUser.login, githubUser.email);
      }

      this.authState = {
        isAuthenticated: true,
        user: githubUser,
        dbUser: dbUser
      };

      // Save auth state to disk
      this.saveAuthState();

      console.log('GitHub authentication successful:', githubUser.login);
      return this.authState;

    } catch (error) {
      console.error('GitHub auth error:', error);
      throw error;
    }
  }

  getAuthState(): AuthState {
    return this.authState;
  }

  async logout(): Promise<void> {
    this.authState = {
      isAuthenticated: false,
      user: null,
      dbUser: null
    };
    
    // Clear saved auth state
    this.clearAuthState();
    
    console.log('User logged out');
  }

  isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
  }

  getCurrentUser(): GitHubUser | null {
    return this.authState.user;
  }

  getCurrentDbUser(): User | null {
    return this.authState.dbUser;
  }

  private async startAuthFlowExternal(): Promise<AuthState> {
    return new Promise((resolve, reject) => {
      // Create temporary HTTP server to handle callback
      const server = createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:3000`);
        
        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          // Send response to browser
          res.writeHead(200, { 'Content-Type': 'text/html' });
          if (error) {
            res.end(`
              <html>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px;">
                  <h2 style="color: #d73a49;">Authentication Failed</h2>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(`GitHub auth error: ${error}`));
            return;
          }

          if (code) {
            res.end(`
              <html>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px;">
                  <h2 style="color: #28a745;">Authentication Successful!</h2>
                  <p>You can close this window and return to Turodesk.</p>
                  <script>setTimeout(() => window.close(), 2000);</script>
                </body>
              </html>
            `);
            server.close();
            
            // Exchange code for token
            this.exchangeCodeForToken(code)
              .then(resolve)
              .catch(reject);
          } else {
            res.end(`
              <html>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px;">
                  <h2 style="color: #d73a49;">Authentication Failed</h2>
                  <p>No authorization code received.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error('No authorization code received'));
          }
        }
      });

      server.listen(3000, 'localhost', () => {
        const authUrl = `https://github.com/login/oauth/authorize?client_id=${this.clientId}&scope=user:email&redirect_uri=http://localhost:3000/callback`;
        
        // Open in external browser
        shell.openExternal(authUrl);
        console.log('GitHub OAuth opened in external browser');
      });

      server.on('error', (err) => {
        console.error('OAuth server error:', err);
        reject(new Error('Failed to start OAuth callback server'));
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout'));
      }, 5 * 60 * 1000);
    });
  }

  private saveAuthState(): void {
    try {
      const authData = {
        isAuthenticated: this.authState.isAuthenticated,
        user: this.authState.user,
        dbUser: this.authState.dbUser,
        savedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.authFilePath, JSON.stringify(authData, null, 2), 'utf8');
      console.log('Auth state saved to disk');
    } catch (error) {
      console.error('Failed to save auth state:', error);
    }
  }

  private loadAuthState(): void {
    try {
      if (!fs.existsSync(this.authFilePath)) {
        return;
      }

      const authData = JSON.parse(fs.readFileSync(this.authFilePath, 'utf8'));
      
      // Check if auth data is not too old (optional: expire after 30 days)
      const savedAt = new Date(authData.savedAt);
      const now = new Date();
      const daysDiff = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 30) {
        console.log('Saved auth state expired, clearing...');
        this.clearAuthState();
        return;
      }

      // Validate required fields
      if (authData.isAuthenticated && authData.user && authData.dbUser) {
        this.authState = {
          isAuthenticated: authData.isAuthenticated,
          user: authData.user,
          dbUser: authData.dbUser
        };
        console.log('Auth state loaded from disk:', authData.user.login);
      }
    } catch (error) {
      console.error('Failed to load auth state:', error);
      this.clearAuthState();
    }
  }

  private clearAuthState(): void {
    try {
      if (fs.existsSync(this.authFilePath)) {
        fs.unlinkSync(this.authFilePath);
        console.log('Auth state cleared from disk');
      }
    } catch (error) {
      console.error('Failed to clear auth state:', error);
    }
  }

  async validateAndRefreshAuthState(): Promise<AuthState> {
    if (!this.authState.isAuthenticated || !this.authState.dbUser) {
      return this.authState;
    }

    try {
      // Verify that the user still exists in database
      const dbUser = await this.db.getUserById(this.authState.dbUser.id);
      if (!dbUser) {
        console.log('User no longer exists in database, clearing auth state');
        await this.logout();
        return this.authState;
      }

      // Update dbUser in case it was modified
      if (JSON.stringify(dbUser) !== JSON.stringify(this.authState.dbUser)) {
        this.authState.dbUser = dbUser;
        this.saveAuthState();
        console.log('Auth state updated with latest user data');
      }

      return this.authState;
    } catch (error) {
      console.error('Failed to validate auth state:', error);
      await this.logout();
      return this.authState;
    }
  }
}