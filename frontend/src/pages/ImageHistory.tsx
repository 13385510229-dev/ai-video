import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getImageList, deleteImage } from '../api';
import type { Image } from '../types';

export default function ImageHistory() {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchImages = async () => {
    try {
      const res = await getImageList();
      if (res.data.success) {
        setImages(res.data.images || []);
      } else {
        setError(res.data.message || '加载失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这张图片吗？')) return;

    try {
      await deleteImage(id);
      setImages(images.filter((img) => img.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || '删除失败');
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'processing':
        return '生成中';
      case 'succeeded':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
        return 'text-yellow-400 bg-yellow-900/20';
      case 'succeeded':
        return 'text-green-400 bg-green-900/20';
      case 'failed':
        return 'text-red-400 bg-red-900/20';
      default:
        return 'text-gray-400 bg-gray-900/20';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-8 animate-slide-up">
          <div>
            <div className="skeleton h-8 w-32 mb-2"></div>
            <div className="skeleton h-4 w-24"></div>
          </div>
          <div className="skeleton h-10 w-32 rounded-lg"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-[#121212] rounded-xl overflow-hidden border border-gray-800 animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="skeleton aspect-video"></div>
              <div className="p-4">
                <div className="skeleton h-4 w-full mb-2"></div>
                <div className="skeleton h-3 w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchImages}
          className="px-6 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-8 animate-slide-up">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-white">图片历史</h1>
          <p className="text-gray-500">共 {images.length} 张图片</p>
        </div>
        <Link
          to="/image-generate"
          className="btn btn-primary"
        >
          + 生成新图片
        </Link>
      </div>

      {/* 图片列表 */}
      {images.length === 0 ? (
        <div className="text-center py-20 bg-[#121212] rounded-2xl border border-gray-800 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-xl font-medium mb-2">还没有图片</h3>
          <p className="text-gray-500 mb-6">开始生成你的第一张 AI 图片吧</p>
          <Link
            to="/image-generate"
            className="btn btn-primary"
          >
            立即生成
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="bg-[#121212] rounded-xl overflow-hidden border border-gray-800 hover:border-white/30 hover:shadow-lg hover:shadow-white/5 transition-all duration-300 group animate-slide-up card-shine"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              {/* 图片预览 */}
              <div className="relative aspect-video bg-black overflow-hidden">
                {image.status === 'succeeded' && image.image_url ? (
                  <img
                    src={image.image_url}
                    alt={image.prompt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : image.status === 'failed' ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-red-400 text-sm">生成失败</p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white/50 mx-auto mb-3"></div>
                      <p className="text-gray-400 text-sm">生成中...</p>
                    </div>
                  </div>
                )}

                {/* 状态标签 */}
                <div className="absolute top-3 left-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(image.status)}`}>
                    {getStatusText(image.status)}
                  </span>
                </div>

                {/* 操作按钮 */}
                {image.status === 'succeeded' && image.image_url && (
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={image.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                      title="查看原图"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>

              {/* 图片信息 */}
              <div className="p-4">
                <p className="text-sm text-gray-300 line-clamp-2 mb-3 h-10">
                  {image.prompt}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatDate(image.created_at)}</span>
                  <div className="flex items-center gap-2">
                    <span>{image.size}</span>
                    <button
                      onClick={() => handleDelete(image.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      title="删除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
