import { create } from 'zustand';
import type { User } from '../types';
import { getUserProfile } from '../api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
  initAuth: () => void;
  refreshUser: () => Promise<void>;
  deductCredits: (amount: number) => void;
  addCredits: (amount: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoggedIn: false,

  setUser: (user) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
    set({ user });
  },

  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
      set({ token, isLoggedIn: true });
    } else {
      localStorage.removeItem('token');
      set({ token: null, isLoggedIn: false });
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null, isLoggedIn: false });
  },

  initAuth: () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ token, user, isLoggedIn: true });
      } catch (e) {
        console.error('Failed to parse user from localStorage');
      }
    }
  },

  // 从服务器刷新最新用户信息
  refreshUser: async () => {
    try {
      const res = await getUserProfile();
      if (res.data.success && res.data.user) {
        const user = res.data.user;
        localStorage.setItem('user', JSON.stringify(user));
        set({ user });
      }
    } catch (e) {
      console.error('Failed to refresh user:', e);
    }
  },

  // 扣除次数（生成成功后调用，优先扣每日次数）
  deductCredits: (amount: number) => {
    set((state) => {
      if (!state.user) return state;
      
      const user = state.user;
      
      // 如果是会员，先扣每日次数
      if (user.is_member && user.daily_credits_remaining !== undefined) {
        const dailyRemaining = user.daily_credits_remaining;
        
        if (dailyRemaining >= amount) {
          // 每日次数够用
          const newDailyRemaining = dailyRemaining - amount;
          const newUser = { ...user, daily_credits_remaining: newDailyRemaining };
          localStorage.setItem('user', JSON.stringify(newUser));
          return { user: newUser };
        } else {
          // 每日次数不够，扣完每日的，剩下的扣余额
          const remainingCost = amount - dailyRemaining;
          const newBalance = Math.max(0, (user.balance || 0) - remainingCost);
          const newUser = { 
            ...user, 
            daily_credits_remaining: 0,
            balance: newBalance 
          };
          localStorage.setItem('user', JSON.stringify(newUser));
          return { user: newUser };
        }
      }
      
      // 不是会员，直接扣余额
      const newBalance = Math.max(0, (user.balance || 0) - amount);
      const newUser = { ...user, balance: newBalance };
      localStorage.setItem('user', JSON.stringify(newUser));
      return { user: newUser };
    });
  },

  // 增加次数
  addCredits: (amount: number) => {
    set((state) => {
      if (!state.user) return state;
      const newBalance = (state.user.balance || 0) + amount;
      const newUser = { ...state.user, balance: newBalance };
      localStorage.setItem('user', JSON.stringify(newUser));
      return { user: newUser };
    });
  },
}));
