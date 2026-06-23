// 用户类型
export interface User {
  id: number;
  email: string;
  balance: number;
  created_at: string;
}

// 视频类型
export interface Video {
  id: number;
  user_id: number;
  prompt: string;
  negative_prompt?: string;
  style?: string;
  duration: number;
  aspect_ratio: string;
  task_id?: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  video_url?: string;
  thumbnail_url?: string;
  error_message?: string;
  cost: number;
  created_at: string;
}

// 图片类型
export interface Image {
  id: number;
  user_id: number;
  prompt: string;
  negative_prompt?: string;
  style?: string;
  size: string;
  status: 'processing' | 'succeeded' | 'failed';
  image_url?: string;
  error_message?: string;
  cost: number;
  created_at: string;
}

// 订单类型
export interface Order {
  id: number;
  user_id: number;
  order_no: string;
  amount: number;
  credits: number;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at?: string;
  created_at: string;
  user?: User;
}

// 套餐类型
export interface Package {
  id: number;
  name: string;
  credits: number;
  amount: number;
}

// 统计数据类型
export interface Stats {
  totalUsers: number;
  totalOrders: number;
  totalPaid: number;
  totalPending: number;
  totalRevenue: string;
  totalCredits: number;
  totalVideos: number;
}

// 视频风格
export const VIDEO_STYLES = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: '3d', label: '3D渲染' },
  { value: 'cinematic', label: '电影感' },
];

// 视频时长
export const VIDEO_DURATIONS = [
  { value: 5, label: '5秒', cost: 1 },
  { value: 10, label: '10秒', cost: 2 },
  { value: 30, label: '30秒', cost: 3 },
];

// 视频比例
export const ASPECT_RATIOS = [
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
  { value: '1:1', label: '方形 1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
];

// 图片尺寸
export const IMAGE_SIZES = [
  { value: '1024x768', label: '横屏 1024×768' },
  { value: '768x1024', label: '竖屏 768×1024' },
  { value: '1024x1024', label: '方形 1024×1024' },
  { value: '1280x720', label: '高清横屏 1280×720' },
  { value: '720x1280', label: '高清竖屏 720×1280' },
];

// 图片风格
export const IMAGE_STYLES = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: '3d', label: '3D渲染' },
  { value: 'cinematic', label: '电影感' },
];
