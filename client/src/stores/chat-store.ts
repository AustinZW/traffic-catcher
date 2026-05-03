import { create } from 'zustand';

interface ChatMsg {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'chat' | 'broadcast' | 'system' | 'catch';
  recipientRole?: string;
  createdAt: string;
}

interface BroadcastMsg {
  id: string;
  content: string;
  from: string;
  createdAt: string;
}

interface ChatState {
  messages: ChatMsg[];
  broadcasts: BroadcastMsg[];
  addMessage: (msg: ChatMsg) => void;
  addBroadcast: (msg: BroadcastMsg) => void;
  removeBroadcast: (id: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  broadcasts: [],

  addMessage: (msg) => {
    set((state) => ({
      messages: [...state.messages.slice(-99), msg],
    }));
  },

  addBroadcast: (msg) => {
    set((state) => ({
      broadcasts: [...state.broadcasts, msg],
    }));
  },

  removeBroadcast: (id) => {
    set((state) => ({
      broadcasts: state.broadcasts.filter((b) => b.id !== id),
    }));
  },

  reset: () => set({ messages: [], broadcasts: [] }),
}));
