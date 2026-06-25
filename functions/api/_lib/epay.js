// 易支付工具函数

// 生成签名（MD5）- 使用 Web Crypto API，支持中文
export async function generateSign(params, key) {
  // 按字母排序参数
  const sortedKeys = Object.keys(params).sort();
  
  // 拼接成 key=value&key=value 格式
  let signStr = '';
  sortedKeys.forEach((k, index) => {
    const value = params[k];
    if (value !== '' && value !== undefined && value !== null) {
      if (index > 0 && signStr !== '') signStr += '&';
      signStr += `${k}=${value}`;
    }
  });

  // 直接拼接密钥
  signStr += key;

  // 使用 Web Crypto API 计算 MD5
  const encoder = new TextEncoder();
  const data = encoder.encode(signStr);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  
  // 转成十六进制字符串（小写）
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 验证签名
export async function verifySign(params, key) {
  const sign = params.sign;
  if (!sign) return false;

  // 去掉 sign 和 sign_type
  const paramsToSign = { ...params };
  delete paramsToSign.sign;
  delete paramsToSign.sign_type;

  const calculatedSign = await generateSign(paramsToSign, key);
  return calculatedSign === sign.toLowerCase();
}
