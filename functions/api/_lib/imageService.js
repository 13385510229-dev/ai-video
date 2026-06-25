// Agnes Image 2.1 Flash 图像生成服务（零依赖版本）
// 支持文生图，同步返回结果

const AGNES_API_BASE = 'https://apihub.agnes-ai.com/v1';
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
}) {
  // 没有 API Key 时使用模拟模式
  if (!apiKey) {
    return mockGenerateImage({ prompt, size, mode, image });
  }

  // 风格关键词（优化版，每个关键词都有用）
  const styleKeywords = {
    realistic: 'photorealistic, hyperrealistic, ultra realistic, real photo, high quality, highly detailed, sharp focus, intricate details, crisp clear, real person, real human, real skin, skin texture, pores, natural lighting, professional photography, dslr, 8k uhd, ',
    anime: 'anime style, manga, 2d illustration, japanese anime, vibrant colors, cel shading, anime artwork, anime key visual, studio ghibli style, makoto shinkai style, beautiful anime art, high quality anime, highly detailed, sharp focus, clean line art, masterpiece, best quality, ',
    '3d': '3d render, octane render, CGI, 3d animation, pixar style, disney style, 3d cartoon, unreal engine 5, ray tracing, subsurface scattering, highly detailed 3d, ultra detailed, sharp focus, cinematic lighting, high quality, photorealistic 3d, ',
    cinematic: 'cinematic, film grain, movie shot, dramatic lighting, hollywood style, anamorphic lens, cinematic color grading, live action, real people, real actors, film photography, arri alexa, shot on film, imax quality, epic, grand, sweeping, highly detailed, sharp focus, ultra realistic, wide shot, establishing shot, ',
  };

  // 风格对应的负面提示词（避免生成其他风格 + 避免模糊低质）
  const styleNegativeKeywords = {
    realistic: 'anime, cartoon, 2d, manga, animation, drawing, painting, illustration, 3d render, cgi, 3d cartoon, pixar, disney style, stylized, comic, comic book, rendered, 3d, game, video game, game screenshot, plastic, fake, doll, toy, blurry, out of focus, fuzzy, pixelated, low resolution, low quality, noisy, grainy, distorted, deformed, ugly, watermark, text, signature, ',
    anime: 'realistic, photo, 3d render, cgi, photorealistic, hyperrealistic, real person, real human, live action, film, movie, photograph, dslr, camera shot, realistic style, blurry, out of focus, fuzzy, pixelated, low resolution, low quality, noisy, grainy, distorted, deformed, ugly, watermark, text, signature, sketch, line art, unfinished, ',
    '3d': 'anime, 2d, cartoon, manga, realistic, photo, photorealistic, real person, real human, live action, drawing, painting, illustration, comic, 2d animation, hand drawn, blurry, out of focus, fuzzy, pixelated, low resolution, low quality, noisy, grainy, distorted, deformed, ugly, watermark, text, signature, low poly, bad topology, texture error, ',
    cinematic: 'anime, cartoon, 2d, manga, animation, drawing, painting, illustration, 3d render, cgi, pixar, disney, 3d cartoon, stylized, comic, comic book, blurry, out of focus, fuzzy, pixelated, low resolution, low quality, distorted, deformed, ugly, watermark, text, signature, cheap, home video, phone footage, found footage, ',
  };

  // 拼接提示词
  let fullPrompt = prompt;
  let styleNegative = '';
  if (style && styleKeywords[style]) {
    fullPrompt = styleKeywords[style] + prompt;
    styleNegative = styleNegativeKeywords[style] || '';
  }

  // 构建请求体（基础参数）
  const requestBody = {
    model: MODEL_NAME,
    prompt: fullPrompt,
    size,
  };

  // 负面提示词（拼到 prompt 后面，避免参数不支持的问题）
  if (negativePrompt || styleNegative) {
    const combinedNegative = styleNegative + negativePrompt;
    requestBody.prompt = `${fullPrompt}。负面提示词：不要${combinedNegative}`;
  }

  // 图生图模式
  if (mode === 'image2image' && image) {
    requestBody.extra_body = {
      image: [image], // 图生图参数放在 extra_body 里，数组格式
    };
  }

  try {
    const response = await fetch(`${AGNES_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000), // 2 分钟超时
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
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
    // 降级到模拟模式
    console.log('Agnes Image API 失败，降级到模拟模式');
    const mockResult = await mockGenerateImage({ prompt, size, mode, image });
    return {
      ...mockResult,
      success: true,
      mode: 'simulation-fallback',
      error: error.message,
    };
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
