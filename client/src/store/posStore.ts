// @ts-ignore
import { create } from "zustand";
// @ts-ignore
import { persist, createJSONStorage } from "zustand/middleware";
import { secureRandom } from "@/lib/secureRandom";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AgentProfile {
  id: number;
  agentCode: string;
  name: string;
  role: "agent" | "admin" | "supervisor";
  tier: "Bronze" | "Silver" | "Gold" | "Platinum";
  phone: string;
  location: string | null;
  terminalModel: string | null;
  terminalSerial: string | null;
  floatBalance: number;
  floatLimit: number;
  commissionBalance: number;
  loyaltyPoints: number;
  streak: number;
  rank: number | null;
  floatLocked?: boolean;
}

export interface TxRecord {
  id: number;
  ref: string;
  type: string;
  amount: number;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
}

export interface FraudEvent {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  amount: number;
  agentCode: string;
  customerName: string;
  timestamp: string;
  fraudScore: string;
  reason: string;
}

export interface ChatMessage {
  id: number;
  senderType: "agent" | "support" | "system";
  senderName: string | null;
  content: string;
  createdAt: string;
}

// ─── Offline queue item ───────────────────────────────────────────────────────
export interface OfflineTx {
  id: string;
  type: string;
  amount: number;
  customerPhone?: string;
  customerName?: string;
  destinationBank?: string;
  destinationAccount?: string;
  createdAt: number;
  retries: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────
interface PosState {
  // Session
  agent: AgentProfile | null;
  isLoggedIn: boolean;
  setAgent: (agent: AgentProfile | null) => void;
  logout: () => void;

  // Float (real-time updates)
  updateFloat: (delta: number) => void;
  updateCommission: (delta: number) => void;
  updateLoyaltyPoints: (delta: number) => void;

  // Transactions
  recentTxs: TxRecord[];
  addTx: (tx: TxRecord) => void;
  setRecentTxs: (txs: TxRecord[]) => void;

  // Fraud
  fraudEvents: FraudEvent[];
  unreadFraudCount: number;
  addFraudEvent: (event: FraudEvent) => void;
  clearFraudCount: () => void;

  // Chat
  activeChatSession: string | null;
  chatMessages: ChatMessage[];
  unreadChatCount: number;
  setActiveChatSession: (ref: string | null) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setChatMessages: (msgs: ChatMessage[]) => void;
  clearChatCount: () => void;

  // Network / offline
  isOnline: boolean;
  setOnline: (online: boolean) => void;
  offlineQueue: OfflineTx[];
  enqueueOfflineTx: (
    tx: Omit<OfflineTx, "id" | "createdAt" | "retries">
  ) => void;
  dequeueOfflineTx: (id: string) => void;
  clearOfflineQueue: () => void;
}

export const usePosStore = create<PosState>()(
  persist(
    // @ts-ignore
    (set, get) => ({
      // Session
      agent: null,
      isLoggedIn: false,
      // @ts-ignore
      setAgent: agent => set({ agent, isLoggedIn: !!agent }),
      logout: () =>
        set({
          agent: null,
          isLoggedIn: false,
          recentTxs: [],
          activeChatSession: null,
          chatMessages: [],
        }),

      // Float
      // @ts-ignore
      updateFloat: delta =>
        // @ts-ignore
        set(s =>
          s.agent
            ? {
                agent: {
                  ...s.agent,
                  floatBalance: s.agent.floatBalance + delta,
                },
              }
            : {}
        ),
      // @ts-ignore
      updateCommission: delta =>
        // @ts-ignore
        set(s =>
          s.agent
            ? {
                agent: {
                  ...s.agent,
                  commissionBalance: s.agent.commissionBalance + delta,
                },
              }
            : {}
        ),
      // @ts-ignore
      updateLoyaltyPoints: delta =>
        // @ts-ignore
        set(s =>
          s.agent
            ? {
                agent: {
                  ...s.agent,
                  loyaltyPoints: s.agent.loyaltyPoints + delta,
                },
              }
            : {}
        ),

      // Transactions
      recentTxs: [],
      // @ts-ignore
      addTx: tx =>
        // @ts-ignore
        set(s => ({ recentTxs: [tx, ...s.recentTxs].slice(0, 100) })),
      // @ts-ignore
      setRecentTxs: txs => set({ recentTxs: txs }),

      // Fraud
      fraudEvents: [],
      unreadFraudCount: 0,
      // @ts-ignore
      addFraudEvent: event =>
        // @ts-ignore
        set(s => ({
          fraudEvents: [event, ...s.fraudEvents].slice(0, 200),
          unreadFraudCount: s.unreadFraudCount + 1,
        })),
      clearFraudCount: () => set({ unreadFraudCount: 0 }),

      // Chat
      activeChatSession: null,
      chatMessages: [],
      unreadChatCount: 0,
      // @ts-ignore
      setActiveChatSession: ref => set({ activeChatSession: ref }),
      // @ts-ignore
      addChatMessage: msg =>
        // @ts-ignore
        set(s => ({
          chatMessages: [...s.chatMessages, msg],
          unreadChatCount:
            msg.senderType === "support"
              ? s.unreadChatCount + 1
              : s.unreadChatCount,
        })),
      // @ts-ignore
      setChatMessages: msgs => set({ chatMessages: msgs }),
      clearChatCount: () => set({ unreadChatCount: 0 }),

      // Network
      isOnline: true,
      // @ts-ignore
      setOnline: online => set({ isOnline: online }),
      offlineQueue: [],
      // @ts-ignore
      enqueueOfflineTx: tx =>
        // @ts-ignore
        set(s => ({
          offlineQueue: [
            ...s.offlineQueue,
            {
              ...tx,
              id: `OFL-${Date.now()}-${secureRandom().toString(36).slice(2, 6)}`,
              createdAt: Date.now(),
              retries: 0,
            },
          ],
        })),
      // @ts-ignore
      dequeueOfflineTx: id =>
        // @ts-ignore
        set(s => ({ offlineQueue: s.offlineQueue.filter(t => t.id !== id) })),
      clearOfflineQueue: () => set({ offlineQueue: [] }),
    }),
    {
      name: "postourismpay-store",
      storage: createJSONStorage(() => localStorage),
      // @ts-ignore
      partialize: state => ({
        agent: state.agent,
        isLoggedIn: state.isLoggedIn,
        offlineQueue: state.offlineQueue,
      }),
    }
  )
);
