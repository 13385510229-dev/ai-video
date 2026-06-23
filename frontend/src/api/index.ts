// API 配置 - Cloudflare Pages Functions 版本
import axios from 'axios';

// 基础 API 实例
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 请求拦截器：添加 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：处理 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 管理员 API 实例
const adminApi = axios.create({
  baseURL: '/api/admin',
  timeout: 30000,
});

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

// ==================== 认证相关 ====================

// 发送验证码
export const sendLoginCode = (email: string) => {
  return api.post('/auth/login', { email });
};

// 验证登录
export const verifyLogin = (email: string, code: string) => {
  return api.post('/auth/verify', { email, code });
};

// ==================== 视频相关 ====================

// 生成视频
export const generateVideo = (params: {
  prompt: string;
  negativePrompt?: string;
  style?: string;
  duration?: number;
  aspectRatio?: string;
}) => {
  return api.post('/videos/generate', params);
};

// 获取视频列表
export const getVideoList = () => {
  return api.get('/videos/list');
};

// 获取视频详情
export const getVideoDetail = (id: string | number) => {
  return api.get(`/videos/detail?id=${id}`);
};

// 删除视频
export const deleteVideo = (id: string | number) => {
  return api.delete(`/videos/delete?id=${id}`);
};

// ==================== 图片相关 ====================

// 生成图片
export const generateImage = (params: {
  prompt: string;
  negativePrompt?: string;
  style?: string;
  size?: string;
}) => {
  return api.post('/images/generate', params, {
    timeout: 120000, // 图片生成超时时间设为 2 分钟
  });
};

// 获取图片列表
export const getImageList = () => {
  return api.get('/images/list');
};

// 获取图片详情
export const getImageDetail = (id: string | number) => {
  return api.get(`/images/detail?id=${id}`);
};

// 删除图片
export const deleteImage = (id: string | number) => {
  return api.delete(`/images/delete?id=${id}`);
};

// ==================== 支付相关 ====================

// 创建订单
export const createOrder = (packageId: number) => {
  return api.post('/payment/create-order', { packageId });
};

// 查询订单状态
export const verifyOrder = (orderNo: string) => {
  return api.get(`/payment/verify?orderNo=${orderNo}`);
};

// ==================== 管理员相关 ====================

// 管理员登录
export const adminLogin = (password: string) => {
  return adminApi.post('/login', { password });
};

// 获取统计数据
export const getAdminStats = () => {
  return adminApi.get('/stats');
};

// 获取订单列表
export const getAdminOrders = (params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}) => {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  return adminApi.get(`/orders?${query.toString()}`);
};

// 获取用户列表
export const getAdminUsers = (params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}) => {
  const query = new URLSearchParams();
  if (params?.keyword) query.set('keyword', params.keyword);
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  return adminApi.get(`/users?${query.toString()}`);
};

// 确认支付
export const confirmPayment = (orderId: number) => {
  return adminApi.post('/confirm-payment', { orderId });
};

// 调整用户余额
export const addCredits = (userId: number, credits: number) => {
  return adminApi.post('/add-credits', { userId, credits });
};

// 导出用户数据
export const exportUserData = () => {
  return api.post('/users/export', {}, {
    responseType: 'blob',
  });
};

export default api;
