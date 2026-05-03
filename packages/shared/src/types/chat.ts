export type MessageType = 'chat' | 'broadcast' | 'system' | 'catch';
export type RecipientRole = 'ghosts' | 'humans' | 'all';

export interface ChatMessage {
  id: string;
  gameId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: MessageType;
  recipientRole?: RecipientRole;
  createdAt: string;
}
