import { Response } from 'express';
import db from '../../db/database';
import { AuthenticatedRequest } from '../../middleware/auth';
import { decrypt } from '../../utils/crypto';
import logger from '../../utils/logger';

/**
 * GET /search/messages?q=query&limit=50&before=timestamp
 * Поиск сообщений по всем чатам пользователя
 */
export const searchMessages = (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const query = (req.query.q as string || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const before = parseInt(req.query.before as string) || Date.now();

  if (!query || query.length < 1) {
    return res.status(400).json({ status: 'error', message: 'Search query is required' });
  }

  try {
    const lowerQuery = query.toLowerCase();

    // Get user's chat IDs
    const chatIds = db.prepare('SELECT chat_id FROM participants WHERE user_id = ?').all(userId) as { chat_id: string }[];
    if (chatIds.length === 0) {
      return res.json({ status: 'success', messages: [], hasMore: false });
    }

    const placeholders = chatIds.map(() => '?').join(',');
    const chatIdList = chatIds.map(c => c.chat_id);

    // Fetch messages in reverse chronological order, process in batches until we have enough results
    const BATCH_SIZE = 200;
    let allResults: any[] = [];
    let currentBefore = before;
    let totalFetched = 0;

    while (allResults.length < limit) {
      const batch = db.prepare(`
        SELECT m.id, m.chat_id, m.user_id, m.text, m.created_at, m.file_id, m.file_mime_type,
               u.username as sender_name
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.chat_id IN (${placeholders}) AND m.created_at < ?
        ORDER BY m.created_at DESC
        LIMIT ?
      `).all(...chatIdList, currentBefore, BATCH_SIZE) as any[];

      if (batch.length === 0) break;

      totalFetched += batch.length;
      currentBefore = batch[batch.length - 1].created_at;

      for (const msg of batch) {
        if (allResults.length >= limit) break;

        try {
          const plainText = decrypt(msg.text);
          if (plainText.toLowerCase().includes(lowerQuery)) {
            // Get chat name
            const chat = db.prepare('SELECT name, type FROM chats WHERE id = ?').get(msg.chat_id) as { name: string | null; type: string } | undefined;

            // For direct chats, resolve the other participant's name
            let chatName = chat?.name || 'Chat';
            if (chat?.type === 'direct') {
              const otherId = db.prepare('SELECT user_id FROM participants WHERE chat_id = ? AND user_id != ?').get(msg.chat_id, userId) as { user_id: string } | undefined;
              if (otherId) {
                const otherUser = db.prepare('SELECT username FROM users WHERE id = ?').get(otherId.user_id) as { username: string } | undefined;
                if (otherUser) {
                  chatName = otherUser.username;
                }
              }
            }

            allResults.push({
              id: msg.id,
              chatId: msg.chat_id,
              userId: msg.user_id,
              text: plainText,
              createdAt: msg.created_at,
              fileId: msg.file_id,
              fileMimeType: msg.file_mime_type,
              senderName: msg.sender_name,
              chatName,
            });
          }
        } catch {
          // Skip messages that fail to decrypt
        }
      }

      // If we fetched fewer than BATCH_SIZE, there are no more messages
      if (batch.length < BATCH_SIZE) break;
    }

    res.json({
      status: 'success',
      messages: allResults.slice(0, limit),
      hasMore: allResults.length >= limit,
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack, query }, 'Search messages error');
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
