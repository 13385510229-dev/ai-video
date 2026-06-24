import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { generateVideo } from '../api';
import { VIDEO_STYLES, VIDEO_DURATIONS, ASPECT_RATIOS, VIDEO_MODES } from '../types';

const Home = () => {
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
  const [multipleFiles, setMultipleFiles] = useState<File[]>([null as any, null as any]);
  const [multipleImageBase64s, setMultipleImageBase64s] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentCost = VIDEO_DURATIONS.find(d => d.value === duration)?.cost || 1;

  // 文件转 Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // 处理单图选择
  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSingleFile(file);
      const base64 = await fileToBase64(file);
      setSingleImageBase64(base64);
    }
  };

  // 处理多图选择
  const handleMultipleFileChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newFiles = [...multipleFiles];
      newFiles[index] = file;
      setMultipleFiles(newFiles);

      const base64 = await fileToBase64(file);
      const newBase64s = [...multipleImageBase64s];
      newBase64s[index] = base64;
      setMultipleImageBase64s(newBase64s);
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
    if (mode === 'i2v' && !singleImageBase64) {
      setError('请选择参考图片');
      return;
    }

    // 多图/关键帧模式需要至少一张图
    if ((mode === 'multi-image' || mode === 'keyframes') && multipleImageBase64s.filter(u => u).length === 0) {
      setError('请至少选择一张参考图片');
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
        params.image = singleImageBase64;
      } else if (mode === 'multi-image' || mode === 'keyframes') {
        params.images = multipleImageBase64s.filter(u => u);
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
      setError(err.response?.data?.message || '生成失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 animate-fade-in">
      <div className="text-center mb-12 animate-slide-up">
        <h1 className="text-5xl font-bold mb-4 tracking-tight bg-gradient-to-r from-pink-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">
          AI 视频生成
        </h1>
        <p className="text-gray-400 text-lg">
          输入文字描述，一键生成专业级视频
        </p>
      </div>

      <div className="card animate-slide-up" style={{ animationDelay: '0.1s' }}>
        {/* 生成模式 */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-3">
            生成模式
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {VIDEO_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`p-3 rounded-lg border text-left transition-all duration-300 ${
                  mode === m.value
                    ? 'border-pink-400 bg-pink-500/10 shadow-lg shadow-pink-500/20'
                    : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'
                }`}
              >
                <div className="font-medium text-sm">{m.label}</div>
                <div className="text-xs text-gray-400 mt-1">{m.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 图生视频 - 单图 */}
        {mode === 'i2v' && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              参考图片 <span className="text-red-500">*</span>
            </label>
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-gray-500 transition-colors">
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
                    <p className="text-white font-medium">{singleFile.name}</p>
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
            {singleImageBase64 && (
              <div className="mt-3">
                <img
                  src={singleImageBase64}
                  alt="预览"
                  className="max-h-48 mx-auto rounded-lg"
                />
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3">
              💡 建议图片大小不超过 5MB，支持 JPG、PNG、WebP 格式。图片不会保存在服务器，每次生成都需重新上传。
            </p>
          </div>
        )}

        {/* 多图/关键帧 - 多图 */}
        {(mode === 'multi-image' || mode === 'keyframes') && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              参考图片 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              {multipleFiles.map((file, index) => (
                <div key={index} className="border-2 border-dashed border-gray-700 rounded-lg p-4 hover:border-gray-500 transition-colors">
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
                          className="w-16 h-16 object-cover rounded"
                        />
                        <div>
                          <p className="text-white font-medium text-sm">{file.name}</p>
                          <p className="text-xs text-gray-400">点击重新选择</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-2">
                        <p className="text-gray-400 text-sm">图片 {index + 1}：点击选择</p>
                      </div>
                    )}
                  </label>
                </div>
              ))}
            </div>
            <button
              onClick={addMoreImages}
              className="mt-3 text-sm text-gray-400 hover:text-white transition-colors"
            >
              + 添加更多图片
            </button>
            <p className="text-xs text-gray-500 mt-2">
              💡 {mode === 'keyframes' ? '关键帧模式：按顺序排列，第一张为起始帧，最后一张为结束帧' : '多图模式：上传多张参考图片引导视频生成'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              ⚠️ 建议单张图片不超过 5MB，支持 JPG、PNG、WebP 格式。图片不会保存在服务器。
            </p>
          </div>
        )}

        {/* 视频描述 */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
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
            className="w-full resize-none"
          />
        </div>

        {/* 负面提示词 */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            负面提示词（可选）
          </label>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="描述你不想要出现在视频中的内容..."
            rows={2}
            className="w-full resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* 风格 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              视频风格
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full"
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
            <label className="block text-sm font-medium mb-2">
              视频时长
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full"
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
            <label className="block text-sm font-medium mb-2">
              画面比例
            </label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="w-full"
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
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-400">
            本次消耗 <span className="text-white font-medium">{currentCost}</span> 次
            <span className="mx-2">·</span>
            剩余 <span className="text-white font-medium">{user?.balance || 0}</span> 次
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="btn btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                生成中...
              </>
            ) : (
              '开始生成'
            )}
          </button>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-8 text-center text-sm text-gray-500 animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <p>💡 提示：视频生成大约需要 5~10 分钟，请耐心等待</p>
        <p className="mt-1">生成过程中可以关闭页面，稍后在历史记录中查看结果</p>
      </div>
    </div>
  );
};

export default Home;
