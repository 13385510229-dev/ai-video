// 用户类型
export interface User {
  id: number;
  email: string;
  balance: number;
  created_at: string;
  is_member?: boolean;
  membership_type?: string;
  membership_name?: string;
  membership_expire_at?: string;
  daily_credits_total?: number;
  daily_credits_remaining?: number;
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
  video_id?: string;
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

// 视频生成模式
export const VIDEO_MODES = [
  { value: 'ti2vid', label: '文生视频', description: '用文字描述生成视频' },
  { value: 'i2v', label: '图生视频', description: '上传一张图片，让它动起来' },
  { value: 'multi-image', label: '多图视频', description: '上传多张图片生成连贯视频' },
  { value: 'keyframes', label: '关键帧动画', description: '在多个关键帧之间平滑过渡' },
];

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
  { value: 18, label: '18秒', cost: 3 },
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
  { value: '2048x1536', label: '横屏 2048×1536（推荐）' },
  { value: '1536x2048', label: '竖屏 1536×2048' },
  { value: '2048x2048', label: '方形 2048×2048' },
  { value: '2304x1536', label: '宽屏 2304×1536' },
  { value: '1536x2304', label: '长屏 1536×2304' },
];

// 图片生成模式
export const IMAGE_MODES = [
  { value: 'text2image', label: '文生图', description: '用文字描述生成图片' },
  { value: 'image2image', label: '图生图', description: '上传参考图，根据提示词修改' },
];

// 图片风格
export const IMAGE_STYLES = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: '3d', label: '3D渲染' },
  { value: 'cinematic', label: '电影感' },
];
