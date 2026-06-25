import { useState, useEffect } from 'react';
import { getVideoList, deleteVideo } from '../api';
import type { Video } from '../types';

const History = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  // 每秒更新时间，让进度条动起来
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchVideos = async () => {
    try {
      const res = await getVideoList();
      if (res.data.success) {
        setVideos(res.data.videos || []);
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();

    // 每 10 秒刷新一次，检查进行中的视频
    const interval = setInterval(() => {
      const hasProcessing = videos.some(v => v.status === 'pending' || v.status === 'processing');
      if (hasProcessing) {
        fetchVideos();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [videos]);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个视频吗？删除后无法恢复。')) {
      return;
    }

    setDeletingId(id);
    setError('');
    try {
      const res = await deleteVideo(id);
      if (res.data.success) {
        setVideos(videos.filter(v => v.id !== id));
      } else {
        setError(res.data.message || res.data.error || '删除失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || '删除失败，请稍后重试');
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      pending: '排队中',
      processing: '生成中',
      succeeded: '已完成',
      failed: '失败',
    };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'text-yellow-400',
      processing: 'text-blue-400',
      succeeded: 'text-green-400',
      failed: 'text-red-400',
    };
    return map[status] || 'text-gray-400';
  };

  // 根据视频时长估算总生成时间（秒）
  const getEstimatedTotalTime = (duration: number) => {
    if (duration <= 5) return 90; // 5秒视频约1.5分钟
    if (duration <= 10) return 180; // 10秒视频约3分钟
    return 480; // 30秒视频约8分钟
  };

  // 计算进度百分比
  const getProgress = (video: Video) => {
    if (video.status === 'succeeded') return 100;
    if (video.status === 'failed') return 0;
    
    const createdAt = new Date(video.created_at).getTime();
    const elapsed = (now - createdAt) / 1000; // 已过去的秒数
    const total = getEstimatedTotalTime(video.duration);
    
    const progress = Math.min((elapsed / total) * 100, 95); // 最多到95%，留5%给最后处理
    return Math.max(progress, 5); // 最少5%，避免一开始就是0
  };

  // 格式化剩余时间
  const formatRemainingTime = (video: Video) => {
    if (video.status === 'succeeded') return '已完成';
    if (video.status === 'failed') return '生成失败';
    
    const createdAt = new Date(video.created_at).getTime();
    const elapsed = (now - createdAt) / 1000;
    const total = getEstimatedTotalTime(video.duration);
    const remaining = Math.max(total - elapsed, 0);
    
    if (remaining < 60) {
      return `预计还需 ${Math.ceil(remaining)} 秒`;
    } else {
      const minutes = Math.floor(remaining / 60);
      const seconds = Math.ceil(remaining % 60);
      return `预计还需 ${minutes}分${seconds}秒`;
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">
        <div className="mb-8">
          <div className="skeleton h-8 w-32 mb-2"></div>
          <div className="skeleton h-4 w-24"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card overflow-hidden animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="skeleton aspect-video mb-4 rounded-lg"></div>
              <div className="skeleton h-4 w-full mb-2"></div>
              <div className="skeleton h-4 w-3/4 mb-4"></div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-800">
                <div className="skeleton h-3 w-20"></div>
                <div className="skeleton h-3 w-10"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">
      <div className="mb-12 animate-slide-up text-center">
        <h1 className="text-5xl font-bold mb-4 text-gray-900 tracking-tight">历史记录</h1>
        <p className="text-gray-500 text-lg">共 {videos.length} 个视频</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm animate-shake">
          {error}
        </div>
      )}

      {videos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-20 shadow-sm">
          <p className="text-gray-500 mb-6 text-lg">还没有生成过视频</p>
          <button
            onClick={() => window.location.href = '/video'}
            className="px-8 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-all hover:-translate-y-0.5"
          >
            去生成第一个视频
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video, index) => (
            <div
              key={video.id}
              className="bg-white border border-gray-200 rounded-2xl overflow-hidden animate-slide-up shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              {/* 视频预览 */}
              <div className="relative aspect-video bg-gray-100 overflow-hidden">
                {video.status === 'succeeded' && video.video_url ? (
                  <video
                    src={video.video_url}
                    className="w-full h-full object-cover"
                    controls
                    poster={video.thumbnail_url}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    {video.status === 'failed' ? (
                      <>
                        <p className="text-red-500 text-sm">生成失败</p>
                        {video.error_message && (
                          <p className="text-gray-400 text-xs mt-1 px-4 text-center">
                            {video.error_message}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-full px-6 mb-3">
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gray-600 rounded-full transition-all duration-1000 ease-out"
                              style={{ width: `${getProgress(video)}%` }}
                            />
                          </div>
                        </div>
                        <p className="text-gray-600 text-sm font-medium">{getStatusText(video.status)}</p>
                        <p className="text-gray-400 text-xs mt-1">{formatRemainingTime(video)}</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 视频信息 */}
              <div className="p-4">
                <p className="text-sm text-gray-700 line-clamp-2 mb-3">
                  {video.prompt}
                </p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{video.duration}秒</span>
                  <span>·</span>
                  <span>{video.aspect_ratio}</span>
                  <span>·</span>
                  <span className={getStatusColor(video.status)}>
                    {getStatusText(video.status)}
                  </span>
                </div>
              </div>

              {/* 操作 */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  {new Date(video.created_at).toLocaleString('zh-CN')}
                </span>
                <button
                  onClick={() => handleDelete(video.id)}
                  disabled={deletingId === video.id}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  {deletingId === video.id ? '删除中...' : '删除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default History;
