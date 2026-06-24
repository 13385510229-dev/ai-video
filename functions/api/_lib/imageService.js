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

  // 风格关键词
  const styleKeywords = {
    realistic: 'realistic, photo-realistic, hyperrealistic, ',
    anime: 'anime style, manga, 2d illustration, ',
    '3d': '3d render, octane render, CGI, ',
    cinematic: 'cinematic, film grain, movie shot, dramatic lighting, ',
  };

  // 拼接提示词
  let fullPrompt = prompt;
  if (style && styleKeywords[style]) {
    fullPrompt = styleKeywords[style] + prompt;
  }

  // 构建请求体
  const requestBody = {
    model: MODEL_NAME,
    prompt: fullPrompt,
    size,
    extra_body: {
      response_format: 'url',
    },
  };

  // 负面提示词
  if (negativePrompt) {
    requestBody.negative_prompt = negativePrompt;
  }

  // 图生图模式
  if (mode === 'image2image' && image) {
    requestBody.extra_body.image = [image];
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

// 常用尺寸
export const IMAGE_SIZES = [
  { value: '1024x768', label: '横屏 1024×768' },
  { value: '768x1024', label: '竖屏 768×1024' },
  { value: '1024x1024', label: '方形 1024×1024' },
  { value: '1280x720', label: '高清横屏 1280×720' },
  { value: '720x1280', label: '高清竖屏 720×1280' },
];

// 风格
export const IMAGE_STYLES = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: '3d', label: '3D渲染' },
  { value: 'cinematic', label: '电影感' },
];
