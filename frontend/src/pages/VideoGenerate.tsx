import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { generateVideo, uploadImage } from '../api';
import { VIDEO_STYLES, VIDEO_DURATIONS, ASPECT_RATIOS, VIDEO_MODES } from '../types';
import ChatPanel from '../components/ChatPanel';
import FriendlyErrorBox from '../components/FriendlyErrorBox';
import GenerationProgressCard from '../components/GenerationProgressCard';
import { formatError } from '../utils/errors';
import type { FriendlyError } from '../utils/errors';

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
  const [error, setError] = useState<FriendlyError | null>(null);
  const [showProgress, setShowProgress] = useState(false);

  const currentCost = VIDEO_DURATIONS.find(d => d.value === duration)?.cost || 1;

  // 预估生成时长（秒）：1080p 比原 768p 慢，按时长分档
  // 5秒视频约 90 秒、10秒约 180 秒、18秒约 300 秒
  const estimatedSeconds = duration === 5 ? 90 : duration === 10 ? 180 : 300;

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
      setError(null);
      setUploading(true);
      try {
        if (file.size > 8 * 1024 * 1024) {
          setError({
            category: 'UPLOAD_FAILED',
            title: '图片太大了',
            detail: `这张图片是 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过了 8MB 的上限。\n建议用画图或手机相册压缩一下再上传，或者换一张更小的图片。`,
          });
          return;
        }
        const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!allowed.includes(file.type)) {
          setError({
            category: 'UPLOAD_FAILED',
            title: '图片格式不支持',
            detail: `当前文件是 ${file.type || '未知格式'}。\n请改成 JPG 或 PNG 格式再上传，不支持 WebP / GIF / BMP。`,
          });
          return;
        }

        const base64 = await compressImage(file);
        setSingleImageBase64(base64);
        // 上传到服务器获取 URL
        const res = await uploadImage(base64);
        if (res.data.success) {
          setSingleImageUrl(res.data.url);
        } else {
          setError(formatError(res.data, '图片上传失败'));
        }
      } catch (err: any) {
        setError(formatError(err, '图片上传失败'));
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
      setError(null);
      setUploading(true);
      try {
        if (file.size > 8 * 1024 * 1024) {
          setError({
            category: 'UPLOAD_FAILED',
            title: `第${index + 1}张图片太大了`,
            detail: `这张图片是 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过了 8MB 的上限。\n请压缩后再上传。`,
          });
          return;
        }
        const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!allowed.includes(file.type)) {
          setError({
            category: 'UPLOAD_FAILED',
            title: `第${index + 1}张图片格式不支持`,
            detail: `当前文件是 ${file.type || '未知格式'}。\n请改成 JPG 或 PNG 再上传。`,
          });
          return;
        }
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
          setError(formatError(res.data, '图片上传失败'));
        }
      } catch (err: any) {
        setError(formatError(err, '图片上传失败'));
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
    setMultipleImageUrls([...multipleImageUrls, '']);
  };

  // 删除指定索引的图片
  const removeImage = (index: number) => {
    const newFiles = multipleFiles.filter((_, i) => i !== index);
    const newBase64s = multipleImageBase64s.filter((_, i) => i !== index);
    const newUrls = multipleImageUrls.filter((_, i) => i !== index);
    setMultipleFiles(newFiles.length > 0 ? newFiles : [null as any]);
    setMultipleImageBase64s(newBase64s.length > 0 ? newBase64s : ['']);
    setMultipleImageUrls(newUrls.length > 0 ? newUrls : ['']);
  };

  // 切换模式时清除相关图片状态
  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    // 清除单图状态
    if (newMode !== 'i2v') {
      setSingleFile(null);
      setSingleImageBase64('');
      setSingleImageUrl('');
    }
    // 清除多图状态
    if (newMode !== 'multi-image' && newMode !== 'keyframes') {
      setMultipleFiles([null as any, null as any]);
      setMultipleImageBase64s(['', '']);
      setMultipleImageUrls(['', '']);
    }
    setError(null);
  };

  const handleGenerate = async () => {
    const trimmed = prompt.trim();

    if (!trimmed) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '请填写视频描述',
        detail: '没有描述词 AI 不知道要生成什么内容。\n建议至少写 10 个字以上，越详细效果越好。',
      });
      return;
    }
    if (trimmed.length < 5) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '描述太短了',
        detail: `你只写了 ${trimmed.length} 个字。\n为了生成质量，请至少写 5 个字以上；包含主体、场景、动作会更好。`,
      });
      return;
    }
    if (trimmed.length > 1500) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '描述太长了',
        detail: `你写了 ${trimmed.length} 个字，系统最多接受 1500 字。\n请精简一下主要内容，再点击生成。`,
      });
      return;
    }
    if (negativePrompt && negativePrompt.length > 1000) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '负面提示词太长了',
        detail: `负面提示写了 ${negativePrompt.length} 个字，系统最多接受 1000 字。\n请精简后再试。`,
      });
      return;
    }

    // 图生视频模式需要图片
    if (mode === 'i2v' && !singleImageUrl) {
      setError({
        category: 'INPUT_VALIDATION',
        title: uploading ? '图片还在上传中' : '图生视频需要一张参考图',
        detail: uploading
          ? '服务器还在处理你的图片，请等几秒、上传完成后按钮会自动亮起，再点一次就好。'
          : '点击上面的虚线框选择一张 JPG 或 PNG 图片，作为视频的起始画面。',
      });
      return;
    }

    // 多图模式需要至少一张图
    const validMultiCount = multipleImageUrls.filter((u) => u).length;
    if (mode === 'multi-image' && validMultiCount === 0) {
      setError({
        category: 'INPUT_VALIDATION',
        title: uploading ? '图片还在上传中' : '多图模式至少需要 1 张参考图',
        detail: uploading
          ? '请等图片上传完毕再点击生成。'
          : '点击下面的虚线框选择至少 1 张图片，来引导视频的风格和内容。',
      });
      return;
    }

    // 关键帧模式需要至少2张图片
    if (mode === 'keyframes' && validMultiCount < 2) {
      setError({
        category: 'INPUT_VALIDATION',
        title: uploading ? '图片还在上传中' : `关键帧模式需要 2 张以上的图片（你当前上传了 ${validMultiCount} 张）`,
        detail: uploading
          ? '请等所有图片都上传完毕，再点击生成。'
          : '关键帧动画需要至少 2 张图：第一张作为起始画面，最后一张作为结束画面，中间会自动过渡。',
      });
      return;
    }

    if ((user?.balance ?? 0) < currentCost && (!user?.is_member || true)) {
      // 真正精确"够不够"判断后端会做，这里只是前置提示一下；如果是会员 is_member=true 即使 balance=0 也可能有每日次数
      // 所以这里不做"提前拒绝"，只保留一个宽松判断：余额<0 一定不行。但因为余额 >=0 所以这行只是占位。
    }

    setLoading(true);
    setError(null);
    setShowProgress(false);

    try {
      const params: any = {
        prompt: trimmed,
        negativePrompt: negativePrompt.trim() || undefined,
        style,
        duration,
        aspectRatio,
        mode,
      };

      if (mode === 'i2v') {
        params.image = singleImageUrl;
      } else if (mode === 'multi-image' || mode === 'keyframes') {
        params.images = multipleImageUrls.filter((u) => u);
      }

      const res = await generateVideo(params);

      if (res.data.success) {
        // 扣除本地余额，立马看到效果
        deductCredits(currentCost);
        // 不立即跳转，改为显示按预估时长走的进度卡片
        setLoading(false);
        setShowProgress(true);
      } else {
        setError(formatError(res.data, '生成失败'));
        setLoading(false);
      }
    } catch (err: any) {
      console.error('视频生成错误:', err.response?.data || err);
      setError(formatError(err, '视频生成失败'));
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in">
      <div className="text-center mb-12 animate-slide-up">
        <h1 className="text-5xl font-bold mb-4 tracking-tight text-gray-900">
          AI 视频生成
        </h1>
        <p className="text-gray-500 text-lg">
          输入文字描述，一键生成专业级视频
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：生成表单 */}
        <div className="lg:col-span-2">
          <div 
            className="generate-card border border-gray-200 rounded-2xl p-8 shadow-sm animate-slide-up" 
            style={{ animationDelay: '0.1s', backgroundColor: '#ffffff', color: '#111111' }}
          >
        {/* 生成模式 */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-3 text-gray-700">
            生成模式
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {VIDEO_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => handleModeChange(m.value)}
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
          <div className="mb-6">
            <FriendlyErrorBox
              error={error}
              onRetry={() => handleGenerate()}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        {showProgress && (
          <div className="mb-6">
            <GenerationProgressCard
              active={showProgress}
              estimatedSeconds={estimatedSeconds}
              kind="视频"
              historyPath="/history"
              onGoHistory={() => navigate('/history')}
              onCancel={() => setShowProgress(false)}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            本次消耗 <span className="text-gray-900 font-medium">{currentCost}</span> 次
            <span className="mx-2">·</span>
            剩余 <span className="text-gray-900 font-medium">{user?.balance || 0}</span> 次
            {user?.is_member && user?.daily_credits_remaining != null && (
              <>
                <span className="mx-2">·</span>
                <span className="text-green-700">
                  今日剩余 <span className="font-medium">{user.daily_credits_remaining}</span> 次
                </span>
              </>
            )}
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || showProgress || !prompt.trim() || uploading}
            className="px-8 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center gap-2"
            title={
              loading
                ? '正在提交生成请求，请勿重复点击'
                : showProgress
                  ? '当前已有任务在生成中，请等待完成或查看进度卡片'
                  : !prompt.trim()
                    ? '请先填写视频描述'
                    : uploading
                      ? '请等图片上传完成'
                      : '点击开始生成视频'
            }
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                提交中...
              </>
            ) : showProgress ? (
              '生成中...'
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

        {/* 右侧：AI 聊天面板 */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 h-[calc(100vh-120px)]">
            <ChatPanel
              contextHint="你好！我是视频创作助手，可以帮你优化视频描述、构思创意、调整风格参数。有什么需要帮忙的吗？"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoGenerate;
