import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { generateVideo, uploadImage } from '../api';
import { VIDEO_STYLES, VIDEO_DURATIONS, ASPECT_RATIOS, VIDEO_MODES } from '../types';

const VideoGenerate = () => {
  const navigate = useNavigate();
  const { user, deductCredits } = useAuthStore();
  const [mode, setMode] = useState('ti2vid');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [style, setStyle] = useState('realistic');
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singleImageBase64, setSingleImageBase64] = useState('');
  const [singleImageUrl, setSingleImageUrl] = useState('');
  const [multipleFiles, setMultipleFiles] = useState<File[]>([null as any, null as any]);
  const [multipleImageBase64s, setMultipleImageBase64s] = useState<string[]>(['', '']);
  const [multipleImageUrls, setMultipleImageUrls] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const currentCost = VIDEO_DURATIONS.find(d => d.value === duration)?.cost || 1;

  // 压缩图片并转 Base64
  const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          // 计算压缩后的尺寸
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (maxHeight / height) * width;
            height = maxHeight;
          }

          // 用 canvas 压缩
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // 转成 JPEG 格式的 Base64
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  // 处理单图选择
  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSingleFile(file);
      setError('');
      setUploading(true);
      try {
        const base64 = await compressImage(file);
        setSingleImageBase64(base64);
        // 上传到服务器获取 URL
        const res = await uploadImage(base64);
        if (res.data.success) {
          setSingleImageUrl(res.data.url);
        } else {
          setError(res.data.message || '图片上传失败');
        }
      } catch (err: any) {
        const errMsg = err.response?.data?.error || err.message || '未知错误';
        setError('图片上传失败: ' + errMsg);
        console.error('图片上传错误:', err.response?.data || err);
      } finally {
        setUploading(false);
      }
    }
  };

  // 处理多图选择
  const handleMultipleFileChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newFiles = [...multipleFiles];
      newFiles[index] = file;
      setMultipleFiles(newFiles);
      setError('');
      setUploading(true);
      try {
        const base64 = await compressImage(file);
        const newBase64s = [...multipleImageBase64s];
        newBase64s[index] = base64;
        setMultipleImageBase64s(newBase64s);
        // 上传到服务器获取 URL
        const res = await uploadImage(base64);
        if (res.data.success) {
          const newUrls = [...multipleImageUrls];
          newUrls[index] = res.data.url;
          setMultipleImageUrls(newUrls);
        } else {
          setError(res.data.message || '图片上传失败');
        }
      } catch (err: any) {
        const errMsg = err.response?.data?.error || err.message || '未知错误';
        setError('图片上传失败: ' + errMsg);
        console.error('图片上传错误:', err.response?.data || err);
      } finally {
        setUploading(false);
      }
    }
  };

  // 添加更多图片
  const addMoreImages = () => {
    setMultipleFiles([...multipleFiles, null as any]);
    setMultipleImageBase64s([...multipleImageBase64s, '']);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入视频描述');
      return;
    }

    // 图生视频模式需要图片
    if (mode === 'i2v' && !singleImageUrl) {
      setError(uploading ? '图片上传中，请稍候...' : '请选择参考图片');
      return;
    }

    // 多图/关键帧模式需要至少一张图
    if ((mode === 'multi-image' || mode === 'keyframes') && multipleImageUrls.filter(u => u).length === 0) {
      setError(uploading ? '图片上传中，请稍候...' : '请至少选择一张参考图片');
      return;
    }

    if ((user?.balance || 0) < currentCost) {
      setError('次数不足，请先充值');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params: any = {
        prompt,
        negativePrompt,
        style,
        duration,
        aspectRatio,
        mode,
      };

      if (mode === 'i2v') {
        params.image = singleImageUrl;
      } else if (mode === 'multi-image' || mode === 'keyframes') {
        params.images = multipleImageUrls.filter(u => u);
      }

      const res = await generateVideo(params);

      if (res.data.success) {
        // 扣除本地余额，立马看到效果
        deductCredits(currentCost);
        // 跳转到历史记录
        navigate('/history');
      } else {
        setError(res.data.message || '生成失败');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || '生成失败，请稍后重试';
      console.error('视频生成错误:', err.response?.data || err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 animate-fade-in">
      <div className="text-center mb-12 animate-slide-up">
        <h1 className="text-5xl font-bold mb-4 tracking-tight text-gray-900">
          AI 视频生成
        </h1>
        <p className="text-gray-500 text-lg">
          输入文字描述，一键生成专业级视频
        </p>
      </div>

      <div className="generate-card bg-white border border-gray-200 rounded-2xl p-8 shadow-sm animate-slide-up" style={{ animationDelay: '0.1s' }}>
        {/* 生成模式 */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-3 text-gray-700">
            生成模式
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {VIDEO_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`p-4 rounded-xl border text-left transition-all duration-300 ${
                  mode === m.value
                    ? 'border-gray-900 bg-gray-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium text-sm text-gray-900">{m.label}</div>
                <div className="text-xs text-gray-500 mt-1">{m.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 图生视频 - 单图 */}
        {mode === 'i2v' && (
          <div className="mb-8">
            <label className="block text-sm font-medium mb-2 text-gray-700">
              参考图片 <span className="text-red-500">*</span>
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-gray-400 transition-colors bg-gray-50/50">
              <input
                type="file"
                accept="image/*"
                onChange={handleSingleFileChange}
                className="hidden"
                id="single-image-upload"
              />
              <label htmlFor="single-image-upload" className="cursor-pointer">
                {singleFile ? (
                  <div>
                    <p className="text-gray-900 font-medium">{singleFile.name}</p>
                    <p className="text-xs text-gray-500 mt-1">点击重新选择</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-500">点击选择图片，或拖拽到这里</p>
                    <p className="text-xs text-gray-400 mt-1">支持 JPG、PNG、WebP 等格式</p>
                  </div>
                )}
              </label>
            </div>
            {singleImageBase64 && (
              <div className="mt-4">
                <img
                  src={singleImageBase64}
                  alt="预览"
                  className="max-h-48 mx-auto rounded-xl shadow-md"
                />
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">
              建议图片大小不超过 5MB，支持 JPG、PNG、WebP 格式。图片不会保存在服务器，每次生成都需重新上传。
            </p>
          </div>
        )}

        {/* 多图/关键帧 - 多图 */}
        {(mode === 'multi-image' || mode === 'keyframes') && (
          <div className="mb-8">
            <label className="block text-sm font-medium mb-2 text-gray-700">
              参考图片 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              {multipleFiles.map((file, index) => (
                <div key={index} className="border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-gray-400 transition-colors bg-gray-50/50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleMultipleFileChange(index, e)}
                    className="hidden"
                    id={`multi-image-upload-${index}`}
                  />
                  <label htmlFor={`multi-image-upload-${index}`} className="cursor-pointer block">
                    {file ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={multipleImageBase64s[index]}
                          alt={`图片 ${index + 1}`}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                        <div>
                          <p className="text-gray-900 font-medium text-sm">{file.name}</p>
                          <p className="text-xs text-gray-500">点击重新选择</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-2">
                        <p className="text-gray-500 text-sm">图片 {index + 1}：点击选择</p>
                      </div>
                    )}
                  </label>
                </div>
              ))}
            </div>
            <button
              onClick={addMoreImages}
              className="mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              + 添加更多图片
            </button>
            <p className="text-xs text-gray-400 mt-2">
              {mode === 'keyframes' ? '关键帧模式：按顺序排列，第一张为起始帧，最后一张为结束帧' : '多图模式：上传多张参考图片引导视频生成'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              建议单张图片不超过 5MB，支持 JPG、PNG、WebP 格式。图片不会保存在服务器。
            </p>
          </div>
        )}

        {/* 视频描述 */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2 text-gray-700">
            视频描述 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={mode === 'ti2vid' 
              ? '描述你想要生成的视频内容，越详细效果越好...'
              : '描述画面的运动和变化，保持主体稳定...'
            }
            rows={4}
            className="w-full resize-none bg-white border border-gray-200 text-gray-900 rounded-xl p-4 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 outline-none transition-all"
          />
        </div>

        {/* 负面提示词 */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2 text-gray-700">
            负面提示词（可选）
          </label>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="描述你不想要出现在视频中的内容..."
            rows={2}
            className="w-full resize-none bg-white border border-gray-200 text-gray-900 rounded-xl p-4 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* 风格 */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">
              视频风格
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl p-3 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 outline-none transition-all"
            >
              {VIDEO_STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* 时长 */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">
              视频时长
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl p-3 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 outline-none transition-all"
            >
              {VIDEO_DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}（{d.cost} 次）
                </option>
              ))}
            </select>
          </div>

          {/* 比例 */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">
              画面比例
            </label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl p-3 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 outline-none transition-all"
            >
              {ASPECT_RATIOS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            本次消耗 <span className="text-gray-900 font-medium">{currentCost}</span> 次
            <span className="mx-2">·</span>
            剩余 <span className="text-gray-900 font-medium">{user?.balance || 0}</span> 次
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="px-8 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                生成中...
              </>
            ) : (
              '开始生成'
            )}
          </button>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-8 text-center text-sm text-gray-400 animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <p>提示：视频生成大约需要 5~10 分钟，请耐心等待</p>
        <p className="mt-1">生成过程中可以关闭页面，稍后在历史记录中查看结果</p>
      </div>
    </div>
  );
};

export default VideoGenerate;
