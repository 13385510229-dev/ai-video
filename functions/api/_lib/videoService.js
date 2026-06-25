// 视频生成服务 - Agnes AI
// 纯 fetch 实现，无外部依赖

// 计算 num_frames 和 frame_rate
// 1080p 级别分辨率最大支持约 169 帧，这里保守用 161 帧
function calculateFrames(duration) {
  // 合法帧数（8n + 1），高分辨率下最多到 161 帧
  const validFrames = [81, 121, 161];

  let frameRate = 24;
  let targetFrames = duration * frameRate;

  // 如果目标帧数超过最大支持，改用 12fps 以获得更长时长
  if (targetFrames > validFrames[validFrames.length - 1]) {
    frameRate = 12;
    targetFrames = duration * frameRate;
  }

  // 找到最接近的合法 num_frames 值
  let bestFrames = validFrames[0];
  let minDiff = Math.abs(targetFrames - validFrames[0]);

  for (const f of validFrames) {
    const diff = Math.abs(targetFrames - f);
    if (diff < minDiff) {
      minDiff = diff;
      bestFrames = f;
    }
  }

  return { num_frames: bestFrames, frame_rate: frameRate };
}

// 计算分辨率（768p 级别，都是 64 的倍数，确保 Agnes 支持）
function calculateResolution(aspectRatio) {
  switch (aspectRatio) {
    case '9:16':
      return { width: 432, height: 768 };
    case '1:1':
      return { width: 768, height: 768 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '3:4':
      return { width: 576, height: 768 };
    case '16:9':
    default:
      return { width: 1280, height: 768 };
  }
}

// 风格关键词映射（精简版，避免提示词过长）
const styleKeywords = {
  realistic: 'photorealistic, real photo, highly detailed, sharp focus, real person, real skin, professional photography, 8k uhd, ',
  anime: 'anime style, japanese anime, vibrant colors, anime artwork, studio ghibli style, masterpiece, best quality, ',
  '3d': '3d render, octane render, CGI, pixar style, unreal engine 5, highly detailed, cinematic lighting, ',
  cinematic: 'cinematic, film grain, dramatic lighting, cinematic color grading, live action, real people, shot on film, highly detailed, sharp focus, ',
};

// 风格对应的负面提示词（精简版）
const styleNegativeKeywords = {
  realistic: 'anime, cartoon, 2d, manga, 3d render, cgi, game, plastic, fake, blurry, out of focus, low quality, ugly, watermark, text, ',
  anime: 'realistic, photo, 3d render, cgi, photorealistic, live action, blurry, out of focus, low quality, ugly, watermark, text, sketch, ',
  '3d': 'anime, 2d, cartoon, realistic, photo, photorealistic, hand drawn, blurry, out of focus, low quality, ugly, watermark, text, low poly, ',
  cinematic: 'anime, cartoon, 2d, manga, 3d render, cgi, blurry, out of focus, low quality, ugly, watermark, text, cheap, home video, ',
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
  const apiBase = env.AGNES_API_BASE || 'https://apihub.agnes-ai.com/v1';

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
  const { width, height } = calculateResolution(aspect_ratio);

  // 风格关键词加到 prompt 前面
  const stylePrefix = styleKeywords[style] || '';
  const fullPrompt = stylePrefix + prompt;

  // 风格对应的负面提示词
  const styleNegativePrefix = styleNegativeKeywords[style] || '';
  const fullNegativePrompt = styleNegativePrefix + (negative_prompt || '');

  // 构建请求体
  const requestBody = {
    model: 'agnes-video-v2.0',
    prompt: fullPrompt,
    negative_prompt: fullNegativePrompt,
    height,
    width,
    num_frames,
    frame_rate,
  };

  // 根据模式设置不同参数（按官方文档）
  if (mode === 'i2v' && image) {
    // 图生视频模式
    requestBody.mode = 'ti2vid';
    requestBody.image = image; // 顶层 image 参数，URL 格式
  } else if (mode === 'multi-image' && images && images.length > 0) {
    // 多图视频模式
    requestBody.mode = 'ti2vid';
    requestBody.extra_body = {
      image: images, // 多图 URL 数组
    };
  } else if (mode === 'keyframes' && images && images.length > 0) {
    // 关键帧动画模式
    requestBody.mode = 'keyframes';
    requestBody.extra_body = {
      image: images, // 关键帧 URL 数组
      mode: 'keyframes',
    };
  } else {
    // 文生视频模式（默认）
    requestBody.mode = 'ti2vid';
  }

  // 可选参数
  if (seed !== null) {
    requestBody.seed = seed;
  }
  if (num_inference_steps !== null) {
    requestBody.num_inference_steps = num_inference_steps;
  }

  console.log('Agnes AI 参数:', {
    model: 'agnes-video-v2.0',
    mode,
    prompt: fullPrompt,
    negative_prompt,
    num_frames,
    frame_rate,
    width,
    height,
    style,
    hasImage: !!image,
    imageCount: images?.length || 0,
  });

  // 重试 1 次（总共 2 次）
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${apiBase}/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(60000), // 60 秒超时
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      const taskId = data.id || data.task_id || (data.data && data.data.id);

      return {
        task_id: taskId,
        status: 'processing',
        mode: 'agnes',
      };
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt + 1} failed:`, error.message);
      if (attempt < 1) {
        await new Promise(r => setTimeout(r, 2000)); // 只重试 1 次
      }
    }
  }

  // 全部失败，直接抛出错误（暂时去掉模拟模式兜底，方便排查问题）
  throw lastError || new Error('Agnes API 调用失败');
}

// 查询视频任务状态
export async function getVideoTaskStatus(taskId, env) {
  // 模拟模式
  if (taskId.startsWith('sim_')) {
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
  const apiBase = env.AGNES_API_BASE || 'https://apihub.agnes-ai.com/v1';

  try {
    const res = await fetch(`${apiBase}/videos/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`API error ${res.status}`);
    }

    const data = await res.json();

    // 兼容不同的状态字段名
    const status = data.status || (data.data && data.data.status) || 'unknown';

    // 状态归一化
    let normalizedStatus = 'processing';
    const successStatuses = ['succeeded', 'success', 'completed', 'done'];
    const failedStatuses = ['failed', 'error', 'cancelled'];
    const processingStatuses = ['in-progress', 'processing', 'running', 'generating', 'queued', 'pending'];

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
    else if (data.error) errorMessage = data.error;
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
  return 3; // 30 秒
}
