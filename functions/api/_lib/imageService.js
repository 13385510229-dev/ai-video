// Agnes Image 2.1 Flash 图像生成服务（零依赖版本）
// 支持文生图，同步返回结果

const MODEL_NAME = 'agnes-image-2.1-flash';

// 生成图片
export async function generateImage({
  prompt,
  negativePrompt = '',
  size = '1024x768',
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
  const styleKeywords = {
    realistic: 'photorealistic, real photo, highly detailed, sharp focus, real person, real skin, professional photography, 8k uhd, ',
    anime: 'anime style, japanese anime, vibrant colors, anime artwork, studio ghibli style, masterpiece, best quality, ',
    '3d': '3d render, octane render, CGI, pixar style, unreal engine 5, highly detailed, cinematic lighting, ',
    cinematic: 'cinematic, film grain, dramatic lighting, cinematic color grading, live action, real people, shot on film, highly detailed, sharp focus, ',
  };

  // 风格对应的负面提示词（精简版 + 避免畸形扭曲）
  const styleNegativeKeywords = {
    realistic: 'anime, cartoon, 2d, manga, 3d render, cgi, game, plastic, fake, blurry, out of focus, low quality, ugly, watermark, text, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, ',
    anime: 'realistic, photo, 3d render, cgi, photorealistic, live action, blurry, out of focus, low quality, ugly, watermark, text, sketch, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, ',
    '3d': 'anime, 2d, cartoon, realistic, photo, photorealistic, hand drawn, blurry, out of focus, low quality, ugly, watermark, text, low poly, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, ',
    cinematic: 'anime, cartoon, 2d, manga, 3d render, cgi, blurry, out of focus, low quality, ugly, watermark, text, cheap, home video, deformed, distorted, disfigured, bad anatomy, extra limbs, missing limbs, mutated, bad proportions, ',
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

  // 构建请求体（基础参数）
  const requestBody = {
    model: MODEL_NAME,
    prompt: fullPrompt,
    size,
    extra_body: {
      response_format: 'url', // 官方要求：URL 输出放在 extra_body 里
    },
  };

  // 负面提示词
  if (fullNegativePrompt) {
    requestBody.negative_prompt = fullNegativePrompt;
  }

  // 图生图模式（image 数组放在 extra_body 里，官方标准格式）
  if (mode === 'image2image' && image) {
    requestBody.extra_body.image = [image];
  }

  try {
    const response = await fetch(`${apiBase}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000), // 120 秒超时（官方推荐 60-360 秒）
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

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
  } catch (error) {
    console.error('Agnes Image API 错误:', error);
    // 直接抛出错误，不降级到模拟模式（方便排查问题）
    throw error;
  }
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

// 常用尺寸（2K 级别，Agnes Image 2.1 Flash 支持）
export const IMAGE_SIZES = [
  { value: '2048x1536', label: '横屏 2048×1536（推荐）' },
  { value: '1536x2048', label: '竖屏 1536×2048' },
  { value: '2048x2048', label: '方形 2048×2048' },
  { value: '2304x1536', label: '宽屏 2304×1536' },
  { value: '1536x2304', label: '长屏 1536×2304' },
];

// 风格
export const IMAGE_STYLES = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: '3d', label: '3D渲染' },
  { value: 'cinematic', label: '电影感' },
];
