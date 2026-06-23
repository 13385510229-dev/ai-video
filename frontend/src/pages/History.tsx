import { useState, useEffect } from 'react';
import { getVideoList, deleteVideo } from '../api';
import type { Video } from '../types';

const History = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
    if (!confirm('确定要删除这个视频吗？')) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteVideo(id);
      setVideos(videos.filter(v => v.id !== id));
    } catch (err) {
      console.error('Failed to delete video:', err);
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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12 flex justify-center">
        <div className="spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">历史记录</h1>
        <p className="text-gray-400">共 {videos.length} 个视频</p>
      </div>

      {videos.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-6xl mb-4">🎬</div>
          <p className="text-gray-400 mb-6">还没有生成过视频</p>
          <button
            onClick={() => window.location.href = '/'}
            className="btn btn-primary"
          >
            去生成第一个视频
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video, index) => (
            <div
              key={video.id}
              className="card overflow-hidden animate-slide-up"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              {/* 视频预览 */}
              <div className="relative aspect-video bg-gray-900 rounded-lg mb-4 overflow-hidden">
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
                        <div className="text-4xl mb-2">❌</div>
                        <p className="text-red-400 text-sm">生成失败</p>
                        {video.error_message && (
                          <p className="text-gray-500 text-xs mt-1 px-4 text-center">
                            {video.error_message}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="spinner mb-3" style={{ width: '28px', height: '28px' }} />
                        <p className="text-gray-400 text-sm">{getStatusText(video.status)}</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 视频信息 */}
              <div className="mb-3">
                <p className="text-sm text-gray-300 line-clamp-2 mb-2">
                  {video.prompt}
                </p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
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
              <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                <span className="text-xs text-gray-500">
                  {new Date(video.created_at).toLocaleString('zh-CN')}
                </span>
                <button
                  onClick={() => handleDelete(video.id)}
                  disabled={deletingId === video.id}
                  className="text-xs text-gray-400 hover:text-red-400 transition-colors"
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
