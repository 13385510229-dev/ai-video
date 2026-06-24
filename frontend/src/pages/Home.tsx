import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { generateVideo } from '../api';
import { VIDEO_STYLES, VIDEO_DURATIONS, ASPECT_RATIOS, VIDEO_MODES } from '../types';

const Home = () => {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [mode, setMode] = useState('ti2vid');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [style, setStyle] = useState('realistic');
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUrls, setImageUrls] = useState(['', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentCost = VIDEO_DURATIONS.find(d => d.value === duration)?.cost || 1;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入视频描述');
      return;
    }

    // 图生视频模式需要图片
    if (mode === 'i2v' && !imageUrl.trim()) {
      setError('请输入参考图片 URL');
      return;
    }

    // 多图/关键帧模式需要至少一张图
    if ((mode === 'multi-image' || mode === 'keyframes') && imageUrls.filter(u => u.trim()).length === 0) {
      setError('请至少输入一张参考图片 URL');
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
        params.image = imageUrl.trim();
      } else if (mode === 'multi-image' || mode === 'keyframes') {
        params.images = imageUrls.filter(u => u.trim());
      }

      const res = await generateVideo(params);

      if (res.data.success) {
        // 更新本地余额
        if (user) {
          setUser({ ...user, balance: user.balance - currentCost });
        }
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
        <h1 className="text-5xl font-bold mb-4 tracking-tight">
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
                className={`p-3 rounded-lg border text-left transition-all ${
                  mode === m.value
                    ? 'border-white bg-white/10'
                    : 'border-gray-700 hover:border-gray-600'
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
              参考图片 URL <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="输入参考图片的 URL 地址..."
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-2">
              💡 上传图片到任意图床，复制图片链接粘贴到这里
            </p>
          </div>
        )}

        {/* 多图/关键帧 - 多图 */}
        {(mode === 'multi-image' || mode === 'keyframes') && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              参考图片 URL <span className="text-red-500">*</span>
            </label>
            {imageUrls.map((url, index) => (
              <div key={index} className="mb-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => {
                    const newUrls = [...imageUrls];
                    newUrls[index] = e.target.value;
                    setImageUrls(newUrls);
                  }}
                  placeholder={`图片 ${index + 1} URL...`}
                  className="w-full"
                />
              </div>
            ))}
            <button
              onClick={() => setImageUrls([...imageUrls, ''])}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              + 添加更多图片
            </button>
            <p className="text-xs text-gray-500 mt-2">
              💡 {mode === 'keyframes' ? '关键帧模式：按顺序排列，第一张为起始帧，最后一张为结束帧' : '多图模式：上传多张参考图片引导视频生成'}
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
