// Agnes Image 2.1 Flash 图像生成服务（零依赖版本）
// 支持文生图、图生图，同步返回结果
// 使用官方推荐的新参数格式：size 档位 + ratio 宽高比

// 上游错误类型（与 videoService 保持一致的分类）
const UPSTREAM_ERROR_TYPES = {
  AUTH: 'UPSTREAM_AUTH',
  BALANCE: 'UPSTREAM_BALANCE',
  RATE_LIMIT: 'UPSTREAM_RATE_LIMIT',
  OVERLOAD: 'UPSTREAM_OVERLOAD',
  SERVER_5XX: 'UPSTREAM_5XX',
  TIMEOUT: 'UPSTREAM_TIMEOUT',
  NETWORK: 'UPSTREAM_NETWORK',
  BAD_REQUEST: 'UPSTREAM_BAD_REQUEST',
  UNKNOWN: 'UPSTREAM_UNKNOWN',
};

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

const MODEL_NAME = 'agnes-image-2.1-flash';

// 尺寸映射：旧格式（widthxheight）→ 新格式（size + ratio）
// 默认提到 2K 档位（清晰度比 1K 翻倍），原图 1K 档位用户仍可选
const SIZE_MAPPING = {
  // 1K 档位（用户主动选小尺寸时仍走 1K）
  '1024x768': { size: '1K', ratio: '4:3' },
  '768x1024': { size: '1K', ratio: '3:4' },
  '1024x1024': { size: '1K', ratio: '1:1' },
  '1280x720': { size: '1K', ratio: '16:9' },
  '720x1280': { size: '1K', ratio: '9:16' },
  // 2K 档位（默认推荐）
  '2048x1536': { size: '2K', ratio: '4:3' },
  '1536x2048': { size: '2K', ratio: '3:4' },
  '2048x2048': { size: '2K', ratio: '1:1' },
  '2560x1440': { size: '2K', ratio: '16:9' },
  '1440x2560': { size: '2K', ratio: '9:16' },
};

// 生成图片
export async function generateImage({
  prompt,
  negativePrompt = '',
  size = '2048x1536',
  style = '',
  apiKey = '',
  mode = 'text2image', // text2image: 文生图, image2image: 图生图
  image = null, // 图生图的参考图 URL
  apiBase = 'https://apihub.agnes-ai.com/v1', // API 基础地址，从外部传入
}) {
  // 没有 API Key 时使用模拟模式
  if (!apiKey) {
    return mockGenerateImage({ prompt, size, mode, image });
  }

  // 风格关键词（精简版，避免提示词过长）
  // 全部追加 sharp focus / ultra detailed / highly detailed 以压制模糊感
  const styleKeywords = {
    realistic: 'photorealistic, real photo, ultra detailed, highly detailed, sharp focus, real person, real skin, professional photography, 8k uhd, masterpiece, best quality, ',
    anime: 'anime style, japanese anime, vibrant colors, anime artwork, studio ghibli style, ultra detailed, sharp focus, masterpiece, best quality, ',
    '3d': '3d render, octane render, CGI, pixar style, unreal engine 5, ultra detailed, sharp focus, cinematic lighting, masterpiece, best quality, ',
    cinematic: 'cinematic, film grain, dramatic lighting, cinematic color grading, live action, real people, shot on film, ultra detailed, sharp focus, masterpiece, best quality, ',
  };

  // 风格对应的负面提示词（精简版 + 避免畸形扭曲）
  // 全部强化：加 extra fingers / fused fingers / long neck / cloned face / morphed / warped
  const styleNegativeKeywords = {
    realistic: 'anime, cartoon, 2d, manga, 3d render, cgi, game, plastic, fake, blurry, out of focus, low quality, ugly, watermark, text, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, extra fingers, fused fingers, long neck, cloned face, morphed, warped, ',
    anime: 'realistic, photo, 3d render, cgi, photorealistic, live action, blurry, out of focus, low quality, ugly, watermark, text, sketch, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, extra fingers, fused fingers, long neck, cloned face, morphed, warped, ',
    '3d': 'anime, 2d, cartoon, realistic, photo, photorealistic, hand drawn, blurry, out of focus, low quality, ugly, watermark, text, low poly, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, extra fingers, fused fingers, long neck, cloned face, morphed, warped, ',
    cinematic: 'anime, cartoon, 2d, manga, 3d render, cgi, blurry, out of focus, low quality, ugly, watermark, text, cheap, home video, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, extra fingers, fused fingers, long neck, cloned face, morphed, warped, ',
  };

  // 拼接提示词
  let fullPrompt = prompt;
  let fullNegativePrompt = '';
  if (style && styleKeywords[style]) {
    fullPrompt = styleKeywords[style] + prompt;
    fullNegativePrompt = styleNegativeKeywords[style] || '';
  }

  // 加上用户的负面提示词
  if (negativePrompt) {
    fullNegativePrompt = fullNegativePrompt + negativePrompt;
  }

  // 转换尺寸格式：旧格式 → 新格式（size 档位 + ratio 宽高比）
  const sizeConfig = SIZE_MAPPING[size] || { size: '1K', ratio: '1:1' };

  // 构建请求体（严格按官方文档参数：https://wiki.agnes-ai.com/en/docs/agnes-image-21-flash）
  // 注意：图片 API 官方参数只有 model/prompt/size/ratio/image/return_base64/extra_body
  // - num_inference_steps：图片 API 不支持，不能传
  // - guidance_scale：图片 API 不支持，不能传
  // 清晰度通过 size 档位（2K）+ ratio 控制，不要传额外参数
  const requestBody = {
    model: MODEL_NAME,
    prompt: fullPrompt,
    size: sizeConfig.size, // 使用档位值：1K、2K、3K、4K（官方推荐）
    ratio: sizeConfig.ratio, // 使用宽高比（官方推荐）
    extra_body: {
      response_format: 'url', // 官方要求：URL 输出放在 extra_body 里
    },
  };

  // 负面提示词
  if (fullNegativePrompt) {
    requestBody.negative_prompt = fullNegativePrompt;
  }

  // 图生图模式（image 数组放在顶层，2.1 官方格式）
  if (mode === 'image2image' && image) {
    requestBody.image = [image];
  }

  console.log('Agnes Image API 请求参数:', {
    model: MODEL_NAME,
    size: sizeConfig.size,
    ratio: sizeConfig.ratio,
    mode,
    hasImage: !!image,
  });

  // 可重试的上游类型
  const RETRYABLE = new Set([
    UPSTREAM_ERROR_TYPES.RATE_LIMIT,
    UPSTREAM_ERROR_TYPES.OVERLOAD,
    UPSTREAM_ERROR_TYPES.NETWORK,
    UPSTREAM_ERROR_TYPES.TIMEOUT,
    UPSTREAM_ERROR_TYPES.SERVER_5XX,
  ]);
  const MAX_RETRIES = 2;
  const backoff = [1500, 4000];

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    console.log(`开始调用 Agnes API（图片）第 ${attempt + 1}/${MAX_RETRIES + 1} 次，size:${sizeConfig.size} ratio:${sizeConfig.ratio}`);
    const startTime = Date.now();
    try {
      const response = await fetch(`${apiBase}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120000), // 120 秒超时
      });

      const elapsed = Date.now() - startTime;
      console.log('Agnes Image API 返回，耗时:', elapsed, 'ms，状态:', response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const type = classifyStatus(response.status);
        const rawSnippet = (errorText || '').slice(0, 500);
        lastErr = makeUpstreamError({
          type,
          status: response.status,
          message: `Agnes Image ${response.status}: ${rawSnippet || 'no response body'}`,
          raw: rawSnippet,
        });
      } else {
        const data = await response.json();

        if (data.data && data.data[0] && data.data[0].url) {
          return {
            success: true,
            imageUrl: data.data[0].url,
            revisedPrompt: data.data[0].revised_prompt || null,
            mode: 'agnes',
          };
        } else {
          throw new Error('返回数据格式不正确');
        }
      }
    } catch (rawErr) {
      const elapsed = Date.now() - startTime;
      let type = UPSTREAM_ERROR_TYPES.NETWORK;
      if (rawErr?.name === 'TimeoutError' || String(rawErr?.message || '').toLowerCase().includes('timeout')) {
        type = UPSTREAM_ERROR_TYPES.TIMEOUT;
      } else if (rawErr?.upstreamType) {
        type = rawErr.upstreamType;
      }
      lastErr = makeUpstreamError({
        type,
        status: rawErr?.upstreamStatus || 0,
        message: `Agnes Image ${type}: ${rawErr?.message || rawErr}`,
        raw: String(rawErr?.message || rawErr || '').slice(0, 500),
      });
      console.error(`Agnes Image 调用异常（${elapsed}ms, 尝试 ${attempt + 1}/${MAX_RETRIES + 1}）：${lastErr.message}`);
    }

    // 可重试就再试一次
    if (RETRYABLE.has(lastErr?.upstreamType) && attempt < MAX_RETRIES) {
      const waitMs = backoff[attempt] || 2000;
      console.log(`Agnes Image ${lastErr.upstreamType}，${waitMs}ms 后重试...`);
      await sleep(waitMs + Math.floor(Math.random() * 1000));
      continue;
    }
    break;
  }

  // 全部失败：抛出最后一个结构化错误
  throw lastErr || makeUpstreamError({
    type: UPSTREAM_ERROR_TYPES.UNKNOWN,
    message: 'Agnes Image 调用失败',
  });
}

// 模拟生成图片（测试用）
function mockGenerateImage({ prompt, size, mode = 'text2image', image = null }) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 使用占位图
      const [width, height] = size.split('x').map(Number);
      const imageUrl = `https://picsum.photos/${width}/${height}?random=${Date.now()}`;

      resolve({
        success: true,
        imageUrl,
        revisedPrompt: prompt,
        mock: true,
        mode,
        referenceImage: image,
      });
    }, 2000); // 模拟2秒生成时间
  });
}

// 常用尺寸（默认推荐 2K 档位，清晰度比 1K 翻倍）
export const IMAGE_SIZES = [
  { value: '2048x1536', label: '横屏 2K 2048×1536（推荐 高清）' },
  { value: '1536x2048', label: '竖屏 2K 1536×2048（推荐 高清）' },
  { value: '2048x2048', label: '方形 2K 2048×2048（推荐 高清）' },
  { value: '2560x1440', label: '宽屏 2K 2560×1440（16:9 高清）' },
  { value: '1440x2560', label: '长屏 2K 1440×2560（9:16 高清）' },
  { value: '1024x768', label: '横屏 1K 1024×768（快速 标清）' },
  { value: '768x1024', label: '竖屏 1K 768×1024（快速 标清）' },
  { value: '1024x1024', label: '方形 1K 1024×1024（快速 标清）' },
  { value: '1280x720', label: '宽屏 1K 1280×720（16:9 标清）' },
  { value: '720x1280', label: '长屏 1K 720×1280（9:16 标清）' },
];

// 风格
export const IMAGE_STYLES = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: '3d', label: '3D渲染' },
  { value: 'cinematic', label: '电影感' },
];
