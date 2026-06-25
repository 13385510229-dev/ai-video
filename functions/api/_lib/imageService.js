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

  // 风格关键词（加强版）
  const styleKeywords = {
    realistic: 'photorealistic, hyperrealistic, ultra realistic, real photo, 8k uhd, dslr, high quality, highly detailed, sharp focus, ',
    anime: 'anime style, manga, 2d illustration, japanese anime, vibrant colors, cel shading, anime artwork, ',
    '3d': '3d render, octane render, CGI, 3d animation, pixar style, disney style, 3d cartoon, ',
    cinematic: 'cinematic, film grain, movie shot, dramatic lighting, hollywood style, anamorphic lens, cinematic color grading, ',
  };

  // 风格对应的负面提示词
  const styleNegativeKeywords = {
    realistic: 'anime, cartoon, 2d, manga, animation, drawing, painting, illustration, ',
    anime: 'realistic, photo, 3d render, cgi, photorealistic, hyperrealistic, ',
    '3d': 'anime, 2d, cartoon, manga, realistic, photo, photorealistic, ',
    cinematic: '', // 电影感是通用风格，不需要反向
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

// 常用尺寸（Agnes Image 支持的尺寸）
export const IMAGE_SIZES = [
  { value: '1024x768', label: '横屏 1024×768（推荐）' },
  { value: '768x1024', label: '竖屏 768×1024' },
  { value: '1024x1024', label: '方形 1024×1024' },
  { value: '1536x1024', label: '宽屏 1536×1024' },
  { value: '1024x1536', label: '长屏 1024×1536' },
];

// 风格
export const IMAGE_STYLES = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: '3d', label: '3D渲染' },
  { value: 'cinematic', label: '电影感' },
];
