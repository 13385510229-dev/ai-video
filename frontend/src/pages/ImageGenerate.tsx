import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { generateImage } from '../api';
import { IMAGE_SIZES, IMAGE_STYLES, IMAGE_MODES } from '../types';

export default function ImageGenerate() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [mode, setMode] = useState('text2image');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [style, setStyle] = useState('realistic');
  const [size, setSize] = useState('1024x768');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceImageBase64, setReferenceImageBase64] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState('');

  const cost = 1; // 每张图片消耗 1 次

  // 文件转 Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // 处理参考图选择
  const handleReferenceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceFile(file);
      const base64 = await fileToBase64(file);
      setReferenceImageBase64(base64);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入图片描述');
      return;
    }

    // 图生图模式需要参考图
    if (mode === 'image2image' && !referenceImageBase64) {
      setError('请选择参考图片');
      return;
    }

    if (!user || user.balance < cost) {
      setError('次数不足，请先充值');
      return;
    }

    setLoading(true);
    setError('');
    setGeneratedImage(null);

    try {
      const params: any = {
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        style,
        size,
        mode,
      };

      if (mode === 'image2image') {
        params.image = referenceImageBase64;
      }

      const res = await generateImage(params);

      if (res.data.success) {
        setGeneratedImage(res.data.image.image_url);
      } else {
        setError(res.data.message || '生成失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || '生成失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 标题 */}
      <div className="text-center mb-12 animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          AI <span className="text-gray-400">图片生成</span>
        </h1>
        <p className="text-gray-500 text-lg">
          用文字描述你想要的画面，AI 为你生成精美图片
        </p>
      </div>

      {/* 生成卡片 */}
      <div className="bg-[#121212] rounded-2xl p-6 md:p-8 border border-gray-800 animate-slide-up">
        {/* 生成模式 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            生成模式
          </label>
          <div className="grid grid-cols-2 gap-3">
            {IMAGE_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`p-4 rounded-lg border text-left transition-all duration-300 ${
                  mode === m.value
                    ? 'border-pink-400 bg-pink-500/10 shadow-lg shadow-pink-500/20'
                    : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'
                }`}
              >
                <div className="font-medium">{m.label}</div>
                <div className="text-xs text-gray-400 mt-1">{m.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 图生图 - 参考图 */}
        {mode === 'image2image' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              参考图片 <span className="text-red-500">*</span>
            </label>
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-gray-500 transition-colors">
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
                      className="max-h-48 mx-auto rounded-lg mb-3"
                    />
                    <p className="text-white font-medium">{referenceFile.name}</p>
                    <p className="text-xs text-gray-400 mt-1">点击重新选择</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-400">点击选择图片，或拖拽到这里</p>
                    <p className="text-xs text-gray-500 mt-1">支持 JPG、PNG、WebP 等格式</p>
                  </div>
                )}
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              💡 建议图片大小不超过 5MB，支持 JPG、PNG、WebP 格式。图片不会保存在服务器，每次生成都需重新上传。
            </p>
          </div>
        )}

        {/* 提示词输入 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            图片描述 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={mode === 'text2image' 
              ? '描述你想要生成的图片，例如：一只在海边散步的橘猫，夕阳下的剪影...'
              : '描述想要如何修改图片，例如：把背景改成夜晚，增加星空效果...'
            }
            className="w-full h-32 px-4 py-3 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors resize-none"
          />
        </div>

        {/* 负面提示词 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            负面提示词（可选）
          </label>
          <input
            type="text"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="不想要的元素，例如：模糊、低质量、变形..."
            className="w-full px-4 py-3 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
          />
        </div>

        {/* 风格和尺寸 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 风格选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              风格
            </label>
            <div className="grid grid-cols-2 gap-2">
              {IMAGE_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    style === s.value
                      ? 'bg-white text-black'
                      : 'bg-[#1a1a1a] text-gray-300 border border-gray-700 hover:border-gray-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 尺寸选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              尺寸
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-white transition-colors"
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
        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
          <div className="text-sm text-gray-400">
            消耗：<span className="text-white font-medium">{cost} 次</span>
            <span className="mx-2">|</span>
            余额：<span className="text-white font-medium">{user?.balance || 0} 次</span>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="px-8 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                生成中...
              </span>
            ) : (
              '生成图片'
            )}
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 生成结果 */}
        {generatedImage && (
          <div className="mt-8 pt-6 border-t border-gray-800">
            <h3 className="text-lg font-medium text-white mb-4">生成结果</h3>
            <div className="relative rounded-lg overflow-hidden bg-black">
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
                className="px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-300 hover:border-gray-500 transition-colors"
              >
                查看原图
              </a>
              <button
                onClick={() => navigate('/image-history')}
                className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                查看历史记录
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 提示词建议 */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>💡 提示：描述越详细，生成效果越好。可以包含主体、场景、风格、光照等元素</p>
      </div>
    </div>
  );
}
