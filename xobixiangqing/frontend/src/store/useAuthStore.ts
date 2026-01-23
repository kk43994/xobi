import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/api/client';

// 用户类型
export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  quota: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

interface AuthState {
  // 状态
  token: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  clearError: () => void;

  // Getters
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.post('/api/auth/login', {
            username,
            password,
          });
          const { token, user } = response.data;
          set({ token, user, isLoading: false });
          return true;
        } catch (error: any) {
          const message = error.response?.data?.error || '登录失败';
          set({ error: message, isLoading: false });
          return false;
        }
      },

      register: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.post('/api/auth/register', {
            username,
            password,
          });
          const { token, user } = response.data;
          set({ token, user, isLoading: false });
          return true;
        } catch (error: any) {
          const message = error.response?.data?.error || '注册失败';
          set({ error: message, isLoading: false });
          return false;
        }
      },

      logout: () => {
        // 调用后端登出接口（可选，因为 JWT 无状态）
        const token = get().token;
        if (token) {
          apiClient.post('/api/auth/logout', {}, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => {});
        }
        set({ token: null, user: null, error: null });
      },

      fetchMe: async () => {
        const token = get().token;
        if (!token) return;

        set({ isLoading: true });
        try {
          const response = await apiClient.get('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          set({ user: response.data.user, isLoading: false });
        } catch (error: any) {
          // Token 失效，清除登录状态
          if (error.response?.status === 401) {
            set({ token: null, user: null, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        }
      },

      changePassword: async (oldPassword: string, newPassword: string) => {
        const token = get().token;
        if (!token) return false;

        set({ isLoading: true, error: null });
        try {
          await apiClient.post('/api/auth/change-password', {
            old_password: oldPassword,
            new_password: newPassword,
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          set({ isLoading: false });
          return true;
        } catch (error: any) {
          const message = error.response?.data?.error || '修改密码失败';
          set({ error: message, isLoading: false });
          return false;
        }
      },

      clearError: () => set({ error: null }),

      isAuthenticated: () => {
        const { token, user } = get();
        return !!(token && user);
      },

      isAdmin: () => {
        const { user } = get();
        return user?.role === 'admin';
      },
    }),
    {
      name: 'xobi-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    }
  )
);

// 配置 axios 拦截器，自动添加 token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：处理 401 错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { code } = error.response.data || {};
      if (code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED') {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);
