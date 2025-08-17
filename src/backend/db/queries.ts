import { Pool } from 'pg';

export interface User {
  id: string;
  username?: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export class DatabaseQueries {
  constructor(private pool: Pool) {}

  // User operations
  async createUser(username?: string, email?: string): Promise<User> {
    const query = `
      INSERT INTO users (username, email)
      VALUES ($1, $2)
      RETURNING *
    `;
    const result = await this.pool.query(query, [username, email]);
    return result.rows[0];
  }

  async getUserById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE username = $1';
    const result = await this.pool.query(query, [username]);
    return result.rows[0] || null;
  }

  // Chat operations
  async createChat(userId: string, title: string = 'Nova conversa'): Promise<Chat> {
    const query = `
      INSERT INTO chats (user_id, title)
      VALUES ($1, $2)
      RETURNING *
    `;
    const result = await this.pool.query(query, [userId, title]);
    return result.rows[0];
  }

  async getChatById(chatId: string): Promise<Chat | null> {
    const query = 'SELECT * FROM chats WHERE id = $1';
    const result = await this.pool.query(query, [chatId]);
    return result.rows[0] || null;
  }

  async getChatsByUserId(userId: string): Promise<Chat[]> {
    const query = `
      SELECT * FROM chats 
      WHERE user_id = $1 
      ORDER BY updated_at DESC
    `;
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  async updateChatTitle(chatId: string, title: string): Promise<Chat | null> {
    const query = `
      UPDATE chats 
      SET title = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await this.pool.query(query, [title, chatId]);
    return result.rows[0] || null;
  }

  async updateChatTimestamp(chatId: string): Promise<void> {
    const query = `
      UPDATE chats 
      SET updated_at = NOW()
      WHERE id = $1
    `;
    await this.pool.query(query, [chatId]);
  }

  async deleteChat(chatId: string): Promise<boolean> {
    const query = 'DELETE FROM chats WHERE id = $1';
    const result = await this.pool.query(query, [chatId]);
    return result.rowCount > 0;
  }

  // Utility methods
  async ensureUserExists(userId: string): Promise<User> {
    let user = await this.getUserById(userId);
    if (!user) {
      user = await this.createUser();
    }
    return user;
  }

  async getChatWithUser(chatId: string): Promise<(Chat & { user: User }) | null> {
    const query = `
      SELECT 
        c.*,
        u.id as user_id,
        u.username,
        u.email,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at
      FROM chats c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `;
    const result = await this.pool.query(query, [chatId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user: {
        id: row.user_id,
        username: row.username,
        email: row.email,
        created_at: row.user_created_at,
        updated_at: row.user_updated_at,
      }
    };
  }
}