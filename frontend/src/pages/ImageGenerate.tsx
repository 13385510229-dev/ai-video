import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { generateImage, uploadImage } from '../api';
import { IMAGE_SIZES, IMAGE_STYLES, IMAGE_MODES } from '../types';
import ChatPanel from '../components/ChatPanel';
import FriendlyErrorBox from '../components/FriendlyErrorBox';
import { formatError } from '../utils/errors';
import type { FriendlyError } from '../utils/errors';

export default function ImageGenerate() {
  const navigate = useNavigate();
  const { user, deductCredits } = useAuthStore();

  const [mode, setMode] = useState('text2image');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [style, setStyle] = useState('realistic');
  const [size, setSize] = useState('1024x768');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceImageBase64, setReferenceImageBase64] = useState('');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [progress, setProgress] = useState(0);

  const cost = 1; // 每张图片消耗 1 次

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

  // 处理参考图选择
  const handleReferenceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceFile(file);
      setError(null);
      setUploading(true);
      try {
        if (file.size > 8 * 1024 * 1024) {
          setError({
            category: 'UPLOAD_FAILED',
            title: '参考图太大了',
            detail: `这张图片是 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过了 8MB 的上限。\n请压缩后再上传，或者换一张更小的图片。`,
          });
          return;
        }
        const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!allowed.includes(file.type)) {
          setError({
            category: 'UPLOAD_FAILED',
            title: '参考图格式不支持',
            detail: `当前文件是 ${file.type || '未知格式'}。\n请改成 JPG 或 PNG 再上传，不支持 WebP/GIF。`,
          });
          return;
        }

        const base64 = await compressImage(file);
        setReferenceImageBase64(base64);
        // 上传到服务器获取 URL
        const res = await uploadImage(base64);
        if (res.data.success) {
          setReferenceImageUrl(res.data.url);
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

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    const trimmedNeg = negativePrompt.trim();

    if (!trimmed) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '请填写图片描述',
        detail: '没有描述词 AI 不知道要生成什么。\n建议写清楚主体、场景、风格，画面会更贴近你的预期。',
      });
      return;
    }
    if (trimmed.length < 3) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '描述太短了',
        detail: `你只写了 ${trimmed.length} 个字。\n请至少写 3 个字以上，例如：一只橘猫在夕阳下的海边散步。`,
      });
      return;
    }
    if (trimmed.length > 2000) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '描述太长了',
        detail: `你写了 ${trimmed.length} 个字，最多接受 2000 字。\n请精简主要元素，再点击生成。`,
      });
      return;
    }
    if (trimmedNeg && trimmedNeg.length > 1000) {
      setError({
        category: 'INPUT_VALIDATION',
        title: '负面提示词太长了',
        detail: `负面提示写了 ${trimmedNeg.length} 个字，最多接受 1000 字。\n请精简后再试。`,
      });
      return;
    }

    // 图生图模式需要参考图
    if (mode === 'image2image' && !referenceImageUrl) {
      setError({
        category: 'INPUT_VALIDATION',
        title: uploading ? '图片还在上传中' : '图生图需要一张参考图',
        detail: uploading
          ? '服务器还在处理你的图片，等几秒上传完成后再点击生成。'
          : '点击上面的虚线框选择一张 JPG/PNG 图片，AI 会基于它修改画面风格/内容。',
      });
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedImage(null);
    setProgress(0);

    // 启动进度条动画（预估25秒）
    const estimatedTime = 25;
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += (90 / estimatedTime); // 最多到90%，留10%给最后处理
      if (currentProgress >= 90) {
        currentProgress = 90;
        clearInterval(interval);
      }
      setProgress(currentProgress);
    }, 1000);

    try {
      const params: any = {
        prompt: trimmed,
        negativePrompt: trimmedNeg || undefined,
        style,
        size,
        mode,
      };

      if (mode === 'image2image') {
        params.image = referenceImageUrl;
      }

      const res = await generateImage(params);

      if (res.data.success) {
        setProgress(100); // 完成，到100%
        setTimeout(() => {
          setGeneratedImage(res.data.image.image_url);
          // 扣除本地余额，立马看到效果
          deductCredits(cost);
        }, 500);
      } else {
        setError(formatError(res.data, '生成失败'));
      }
    } catch (err: any) {
      setError(formatError(err, '图片生成失败'));
    } finally {
      clearInterval(interval);
      setTimeout(() => {
        setLoading(false);
      }, 800); // 延迟一下，让用户看到100%的进度
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in">
      {/* 标题 */}
      <div className="text-center mb-12 animate-slide-up">
        <h1 className="text-5xl font-bold mb-4 text-gray-900 tracking-tight">
          AI 图片生成
        </h1>
        <p className="text-gray-500 text-lg">
          用文字描述你想要的画面，AI 为你生成精美图片
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：生成表单 */}
        <div className="lg:col-span-2">
          {/* 生成卡片 */}
          <div 
            className="generate-card border border-gray-200 rounded-2xl p-8 shadow-sm animate-slide-up"
            style={{ backgroundColor: '#ffffff', color: '#111111' }}
          >
        {/* 生成模式 */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            生成模式
          </label>
          <div className="grid grid-cols-2 gap-3">
            {IMAGE_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`p-4 rounded-xl border text-left transition-all duration-300 ${
                  mode === m.value
                    ? 'border-gray-900 bg-gray-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium text-gray-900">{m.label}</div>
                <div className="text-xs text-gray-500 mt-1">{m.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 图生图 - 参考图 */}
        {mode === 'image2image' && (
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              参考图片 <span className="text-red-500">*</span>
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-gray-400 transition-colors bg-gray-50/50">
              <input
                type="file"
                accept="image/*"
                onChange={handleReferenceFileChange}
                className="hidden"
                id="reference-image-upload"
              />
              <label htmlFor="reference-image-upload" className="cursor-pointer block">
                {referenceFile ? (
                  <div>
                    <img
                      src={referenceImageBase64}
                      alt="参考图预览"
                      className="max-h-48 mx-auto rounded-xl mb-4 shadow-md"
                    />
                    <p className="text-gray-900 font-medium">{referenceFile.name}</p>
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
            <p className="text-xs text-gray-400 mt-3">
              建议图片大小不超过 5MB，支持 JPG、PNG、WebP 格式。图片不会保存在服务器，每次生成都需重新上传。
            </p>
          </div>
        )}

        {/* 提示词输入 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            图片描述 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={mode === 'text2image' 
              ? '描述你想要生成的图片，例如：一只在海边散步的橘猫，夕阳下的剪影...'
              : '描述想要如何修改图片，例如：把背景改成夜晚，增加星空效果...'
            }
            className="w-full h-32 px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all resize-none"
          />
        </div>

        {/* 负面提示词 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            负面提示词（可选）
          </label>
          <input
            type="text"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="不想要的元素，例如：模糊、低质量、变形..."
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all"
          />
        </div>

        {/* 风格和尺寸 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* 风格选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              风格
            </label>
            <div className="grid grid-cols-2 gap-2">
              {IMAGE_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    style === s.value
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 尺寸选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              尺寸
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all"
            >
              {IMAGE_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 消耗次数和生成按钮 */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-100">
          <div className="text-sm text-gray-500">
            消耗：<span className="text-gray-900 font-medium">{cost} 次</span>
            <span className="mx-2">·</span>
            余额：<span className="text-gray-900 font-medium">{user?.balance || 0} 次</span>
            {user?.is_member && user?.daily_credits_remaining != null && (
              <>
                <span className="mx-2">·</span>
                <span className="text-green-700">
                  今日剩余 <span className="font-medium">{user.daily_credits_remaining}</span> 次
                </span>
              </>
            )}
          </div>

          <div className="relative">
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim() || uploading || (mode === 'image2image' && !referenceImageUrl)}
              className="px-8 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 relative overflow-hidden min-w-[140px]"
              title={
                loading
                  ? '正在生成图片，请勿重复点击'
                  : !prompt.trim()
                    ? '请先填写图片描述'
                    : uploading
                      ? '请等图片上传完成'
                      : mode === 'image2image' && !referenceImageUrl
                        ? '图生图模式请先上传参考图'
                        : '点击开始生成图片'
              }
            >
              {loading ? (
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {Math.round(progress)}%
                </span>
              ) : (
                '生成图片'
              )}
              {loading && (
                <div
                  className="absolute inset-0 bg-gray-700 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              )}
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mt-6">
            <FriendlyErrorBox
              error={error}
              onRetry={() => handleGenerate()}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        {/* 生成结果 */}
        {generatedImage && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <h3 className="text-lg font-medium text-gray-900 mb-4">生成结果</h3>
            <div className="relative rounded-xl overflow-hidden bg-gray-100 shadow-md">
              <img
                src={generatedImage}
                alt="Generated"
                className="w-full h-auto"
              />
            </div>
            <div className="mt-4 flex gap-3">
              <a
                href={generatedImage}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                查看原图
              </a>
              <button
                onClick={() => navigate('/image-history')}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                查看历史记录
              </button>
            </div>
          </div>
        )}
          </div>

          {/* 提示词建议 */}
          <div className="mt-8 text-center text-sm text-gray-400">
            <p>提示：描述越详细，生成效果越好。可以包含主体、场景、风格、光照等元素</p>
          </div>
        </div>

        {/* 右侧：AI 聊天面板 */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 h-[calc(100vh-120px)]">
            <ChatPanel
              contextHint="你好！我是图片创作助手，可以帮你优化提示词、构思画面创意、推荐风格。有什么需要帮忙的吗？"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
