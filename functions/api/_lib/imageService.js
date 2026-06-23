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
}) {
  // 没有 API Key 时使用模拟模式
  if (!apiKey) {
    return mockGenerateImage({ prompt, size });
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
  if (negativePrompt) {
    fullPrompt += `, negative: ${negativePrompt}`;
  }

  try {
    const response = await fetch(`${AGNES_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: fullPrompt,
        size,
        extra_body: {
          response_format: 'url',
        },
      }),
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
      };
    } else {
      throw new Error('返回数据格式不正确');
    }
  } catch (error) {
    console.error('Agnes Image API 错误:', error);
    throw error;
  }
}

// 模拟生成图片（测试用）
function mockGenerateImage({ prompt, size }) {
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
