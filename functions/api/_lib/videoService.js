// 视频生成服务 - Agnes AI
// 纯 fetch 实现，无外部依赖

// 上游错误类型（供上层判断是退款还是重试）
export const UPSTREAM_ERROR_TYPES = {
  AUTH: 'UPSTREAM_AUTH',      // 401：我们的 API Key 过期或没权限
  BALANCE: 'UPSTREAM_BALANCE',// 402：Agnes 账户余额/额度用完（需要管理员充值）
  RATE_LIMIT: 'UPSTREAM_RATE_LIMIT', // 429：Agnes 限流
  OVERLOAD: 'UPSTREAM_OVERLOAD',     // 502/503/504：Agnes 过载
  SERVER_5XX: 'UPSTREAM_5XX',        // 其他 5xx
  TIMEOUT: 'UPSTREAM_TIMEOUT',       // AbortSignal 超时
  NETWORK: 'UPSTREAM_NETWORK',       // DNS/TLS/连接错误
  BAD_REQUEST: 'UPSTREAM_BAD_REQUEST',// 400：参数问题
  UNKNOWN: 'UPSTREAM_UNKNOWN',
};

// 分类 HTTP 状态码
function classifyStatus(status) {
  if (!status) return UPSTREAM_ERROR_TYPES.NETWORK;
  if (status === 401) return UPSTREAM_ERROR_TYPES.AUTH;
  if (status === 402 || status === 403) return UPSTREAM_ERROR_TYPES.BALANCE;
  if (status === 429) return UPSTREAM_ERROR_TYPES.RATE_LIMIT;
  if (status === 400 || status === 422) return UPSTREAM_ERROR_TYPES.BAD_REQUEST;
  if (status === 502 || status === 503 || status === 504) return UPSTREAM_ERROR_TYPES.OVERLOAD;
  if (status >= 500) return UPSTREAM_ERROR_TYPES.SERVER_5XX;
  if (status >= 400) return UPSTREAM_ERROR_TYPES.UNKNOWN;
  return UPSTREAM_ERROR_TYPES.UNKNOWN;
}

function makeUpstreamError({ type, status, message, raw }) {
  const err = new Error(message || `Upstream error ${type}`);
  err.name = 'UpstreamError';
  err.upstreamType = type;
  err.upstreamStatus = status || 0;
  err.upstreamRaw = raw || '';
  return err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 计算 num_frames 和 frame_rate
// 严格按官方文档推荐值（https://wiki.agnes-ai.com/en/docs/agnes-video-v20#common-duration-settings）
// 所有档位都用 24fps，num_frames 遵循 8n+1 规则且 ≤ 441
function calculateFrames(duration) {
  const frameRate = 24;
  let numFrames;

  if (duration <= 3) {
    numFrames = 81;    // 官方推荐：约 3 秒 @24fps
  } else if (duration <= 5) {
    numFrames = 121;   // 官方推荐：约 5 秒 @24fps
  } else if (duration <= 10) {
    numFrames = 241;   // 官方推荐：约 10 秒 @24fps
  } else {
    numFrames = 441;   // 官方推荐：约 18 秒 @24fps（441 是 num_frames 上限）
  }

  return { num_frames: numFrames, frame_rate: frameRate };
}

// 计算分辨率
// 3/5/10 秒：1080p（max_num_frames=241，10秒@24fps=241帧刚好不超限）
// 18 秒：降级到 720p（1080p 下 max_num_frames=241，441帧会超限；720p 支持 441 帧）
// 官方文档：https://wiki.agnes-ai.com/en/docs/agnes-video-v20#resolution-tier-limits
function calculateResolution(aspectRatio, duration) {
  // 18 秒视频需要 441 帧，1080p 下 max_num_frames=241 会超限，必须降级到 720p
  const use720p = duration > 10;

  if (use720p) {
    switch (aspectRatio) {
      case '9:16':
        return { width: 720, height: 1280 };
      case '1:1':
        return { width: 720, height: 720 };
      case '4:3':
        return { width: 960, height: 720 };
      case '3:4':
        return { width: 540, height: 720 };
      case '16:9':
      default:
        return { width: 1280, height: 720 };
    }
  }

  // 3/5/10 秒：1080p
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:3':
      return { width: 1440, height: 1080 };
    case '3:4':
      return { width: 810, height: 1080 };
    case '16:9':
    default:
      return { width: 1920, height: 1080 };
  }
}

// 风格关键词映射（精简版，避免提示词过长）
// 全部追加 sharp focus / ultra detailed / highly detailed 以压制模糊感
const styleKeywords = {
  realistic: 'photorealistic, real photo, ultra detailed, highly detailed, sharp focus, real person, real skin, professional photography, 8k uhd, masterpiece, best quality, ',
  anime: 'anime style, japanese anime, vibrant colors, anime artwork, studio ghibli style, ultra detailed, sharp focus, masterpiece, best quality, ',
  '3d': '3d render, octane render, CGI, pixar style, unreal engine 5, ultra detailed, sharp focus, cinematic lighting, masterpiece, best quality, ',
  cinematic: 'cinematic, film grain, dramatic lighting, cinematic color grading, live action, real people, shot on film, ultra detailed, sharp focus, masterpiece, best quality, ',
};

// 风格对应的负面提示词（精简版 + 避免畸形扭曲）
// 全部强化：加 motion blur / jitter / morphed / warped / extra fingers / fused
const styleNegativeKeywords = {
  realistic: 'anime, cartoon, 2d, manga, 3d render, cgi, game, plastic, fake, blurry, out of focus, low quality, ugly, watermark, text, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, motion blur, jitter, morphed, warped, extra fingers, fused fingers, long neck, cloned face, ',
  anime: 'realistic, photo, 3d render, cgi, photorealistic, live action, blurry, out of focus, low quality, ugly, watermark, text, sketch, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, motion blur, jitter, morphed, warped, extra fingers, fused fingers, long neck, cloned face, ',
  '3d': 'anime, 2d, cartoon, realistic, photo, photorealistic, hand drawn, blurry, out of focus, low quality, ugly, watermark, text, low poly, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, motion blur, jitter, morphed, warped, extra fingers, fused fingers, long neck, cloned face, ',
  cinematic: 'anime, cartoon, 2d, manga, 3d render, cgi, blurry, out of focus, low quality, ugly, watermark, text, cheap, home video, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, motion blur, jitter, morphed, warped, extra fingers, fused fingers, long neck, cloned face, ',
};

// 创建视频生成任务
export async function createVideoTask(params, env) {
  const {
    prompt,
    negative_prompt = '',
    style = 'realistic',
    duration = 5,
    aspect_ratio = '16:9',
    mode = 'ti2vid', // ti2vid: 文生视频, i2v: 图生视频, multi-image: 多图, keyframes: 关键帧
    image = null, // 单张图生视频
    images = null, // 多图/关键帧数组
    seed = null,
    num_inference_steps = null,
  } = params;

  const apiKey = env.AGNES_API_KEY;
  const apiBase = env.AGNES_API_URL || env.AGNES_API_BASE || 'https://apihub.agnes-ai.com/v1';

  // 如果没有配置 API Key，使用模拟模式
  if (!apiKey) {
    return {
      task_id: `sim_${Date.now()}`,
      status: 'processing',
      mode: 'simulation',
    };
  }

  // 计算参数
  const { num_frames, frame_rate } = calculateFrames(duration);
  const { width, height } = calculateResolution(aspect_ratio, duration);

  // 风格关键词加到 prompt 前面
  const stylePrefix = styleKeywords[style] || '';
  const fullPrompt = stylePrefix + prompt;

  // 风格对应的负面提示词
  const styleNegativePrefix = styleNegativeKeywords[style] || '';
  const fullNegativePrompt = styleNegativePrefix + (negative_prompt || '');

  // 构建请求体
  // 注意：只传官方文档明确支持的参数（https://wiki.agnes-ai.com/en/docs/agnes-video-v20）
  // - num_inference_steps：官方支持，30 步是 quality/speed 平衡点
  // - guidance_scale：官方参数列表里没有，不能传，否则可能 400
  const requestBody = {
    model: 'agnes-video-v2.0',
    prompt: fullPrompt,
    negative_prompt: fullNegativePrompt,
    height,
    width,
    num_frames,
    frame_rate,
    // 30 步是官方文档支持的参数，比默认值细节更扎实
    num_inference_steps: num_inference_steps != null ? num_inference_steps : 30,
  };

  // 根据模式设置不同参数（严格按官方文档）
  if (mode === 'i2v' && image) {
    // 图生视频模式：顶层 image 参数
    requestBody.image = image;
  } else if (mode === 'multi-image' && images && images.length > 0) {
    // 多图视频模式：extra_body.image 数组
    requestBody.extra_body = {
      image: images,
    };
  } else if (mode === 'keyframes' && images && images.length > 0) {
    // 关键帧动画模式：顶层 mode + extra_body.image 数组 + extra_body.mode
    requestBody.mode = 'keyframes';
    requestBody.extra_body = {
      image: images,
      mode: 'keyframes',
    };
  }
  // 文生视频（默认）：不需要额外 mode 参数

  // 可选参数
  if (seed !== null) {
    requestBody.seed = seed;
  }
  // num_inference_steps 已经在 requestBody 默认值里处理过（30 或用户传入值）

  // 可重试的上游类型：429 限流、502/503/504 过载、网络抖动、超时（偶尔）
  const RETRYABLE = new Set([
    UPSTREAM_ERROR_TYPES.RATE_LIMIT,
    UPSTREAM_ERROR_TYPES.OVERLOAD,
    UPSTREAM_ERROR_TYPES.NETWORK,
    UPSTREAM_ERROR_TYPES.TIMEOUT,
    UPSTREAM_ERROR_TYPES.SERVER_5XX,
  ]);
  const MAX_RETRIES = 2; // 最多额外重试 2 次
  const backoff = [1500, 4000]; // 1.5s, 4s

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    console.log(`开始调用 Agnes API（视频）第 ${attempt + 1}/${MAX_RETRIES + 1} 次，模式:${mode} 时长:${duration}`);
    const startTime = Date.now();
    try {
      const res = await fetch(`${apiBase}/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(480000),
      });

      const elapsed = Date.now() - startTime;
      console.log('Agnes Video API 返回，耗时:', elapsed, 'ms，状态:', res.status);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const type = classifyStatus(res.status);
        // 把 Agnes 原始错误尽量截短，方便排查
        const rawSnippet = (errText || '').slice(0, 500);
        lastErr = makeUpstreamError({
          type,
          status: res.status,
          message: `Agnes Video ${res.status}: ${rawSnippet || 'no response body'}`,
          raw: rawSnippet,
        });
      } else {
        const data = await res.json();
        const taskId = data.id || data.task_id || (data.data && data.data.id);
        const videoId = data.video_id || (data.data && data.data.video_id);

        console.log('任务创建成功，task_id:', taskId, 'video_id:', videoId);

        return {
          task_id: taskId,
          video_id: videoId,
          status: 'processing',
          mode: 'agnes',
        };
      }
    } catch (rawErr) {
      const elapsed = Date.now() - startTime;
      // 先判断超时/网络
      let type = UPSTREAM_ERROR_TYPES.NETWORK;
      if (rawErr?.name === 'TimeoutError' || String(rawErr?.message || '').toLowerCase().includes('timeout')) {
        type = UPSTREAM_ERROR_TYPES.TIMEOUT;
      } else if (rawErr?.upstreamType) {
        // 已经是结构化的 UpstreamError
        type = rawErr.upstreamType;
      }
      lastErr = makeUpstreamError({
        type,
        status: rawErr?.upstreamStatus || 0,
        message: `Agnes Video ${type}: ${rawErr?.message || rawErr}`,
        raw: String(rawErr?.message || rawErr || '').slice(0, 500),
      });
      console.error(`Agnes Video 调用异常（${elapsed}ms, 尝试 ${attempt + 1}/${MAX_RETRIES + 1}）：${lastErr.message}`);
    }

    // 到这里说明本轮失败：如果是可重试类型且还有额度，sleep 后再试
    if (RETRYABLE.has(lastErr?.upstreamType) && attempt < MAX_RETRIES) {
      const waitMs = backoff[attempt] || 2000;
      console.log(`Agnes Video ${lastErr.upstreamType}，${waitMs}ms 后重试...`);
      await sleep(waitMs + Math.floor(Math.random() * 1000));
      continue;
    }
    break;
  }

  // 所有尝试都失败：抛出最后一个结构化错误
  throw lastErr || makeUpstreamError({
    type: UPSTREAM_ERROR_TYPES.UNKNOWN,
    message: 'Agnes Video 调用失败',
  });
}

// 查询视频任务状态
// 优先用 video_id 调用官方推荐的新接口，兼容旧的 task_id
export async function getVideoTaskStatus(taskId, env, videoId = null) {
  // 模拟模式
  if (taskId && taskId.startsWith('sim_')) {
    const createdTime = parseInt(taskId.split('_')[1]);
    const elapsed = Date.now() - createdTime;

    // 模拟 30 秒后完成
    if (elapsed > 30000) {
      return {
        status: 'succeeded',
        video_url: 'https://www.w3schools.com/html/mov_bbb.mp4',
        thumbnail_url: null,
      };
    }
    return { status: 'processing' };
  }

  const apiKey = env.AGNES_API_KEY;

  try {
    let res;

    // 优先用 video_id 调用官方推荐的新接口
    if (videoId) {
      console.log('使用 video_id 查询:', videoId);
      res = await fetch(`https://apihub.agnes-ai.com/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=agnes-video-v2.0`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(30000),
      });
    } else {
      // 兼容旧版：用 task_id 查询
      const apiBase = env.AGNES_API_URL || env.AGNES_API_BASE || 'https://apihub.agnes-ai.com/v1';
      console.log('使用 task_id 查询（兼容旧版）:', taskId);
      res = await fetch(`${apiBase}/videos/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(30000),
      });
    }

    if (!res.ok) {
      // 这里查询状态的失败不要直接 throw：可能只是短暂超时，返回 processing 让前端下次再查
      // 但是 401/403/404 记录一下便于排查
      if (res.status === 401 || res.status === 403) {
        console.warn('查询视频状态被 401/403：可能 API Key 过期');
      }
      throw new Error(`API error ${res.status}`);
    }

    const data = await res.json();

    // 兼容不同的状态字段名
    const status = data.status || (data.data && data.data.status) || 'unknown';

    // 状态归一化
    let normalizedStatus = 'processing';
    const successStatuses = ['succeeded', 'success', 'completed', 'done'];
    const failedStatuses = ['failed', 'error', 'cancelled'];
    const processingStatuses = ['in-progress', 'in_progress', 'processing', 'running', 'generating', 'queued', 'pending'];

    if (successStatuses.includes(status)) {
      normalizedStatus = 'succeeded';
    } else if (failedStatuses.includes(status)) {
      normalizedStatus = 'failed';
    } else if (processingStatuses.includes(status)) {
      normalizedStatus = 'processing';
    }

    // 尝试获取视频 URL（兼容多种字段名）
    let videoUrl = null;
    if (data.video_url) videoUrl = data.video_url;
    else if (data.url) videoUrl = data.url;
    else if (data.remixed_from_video_id) videoUrl = data.remixed_from_video_id;
    else if (data.data && data.data.video_url) videoUrl = data.data.video_url;
    else if (data.data && data.data.url) videoUrl = data.data.url;
    else if (data.data && Array.isArray(data.data) && data.data[0]?.url) {
      videoUrl = data.data[0].url;
    }

    // 错误信息
    let errorMessage = null;
    if (data.error_message) errorMessage = data.error_message;
    else if (data.error) errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    else if (data.data && data.data.error) errorMessage = data.data.error;

    return {
      status: normalizedStatus,
      video_url: videoUrl,
      thumbnail_url: data.thumbnail_url || null,
      error_message: errorMessage,
    };
  } catch (error) {
    console.log('查询视频状态失败:', error.message);
    // 网络错误不标记为失败，保持 processing 状态，下次再查
    return { status: 'processing' };
  }
}

// 计算消耗次数
export function calculateCost(duration) {
  if (duration <= 5) return 1;
  if (duration <= 10) return 2;
  return 3; // 18 秒
}
