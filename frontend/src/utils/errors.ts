// 统一的「错误信息 → 用户可理解的中文提示」翻译层
//
// 目标：无论错误来自哪里（HTTP 4xx/5xx、网络断开、业务 error_code、try/catch），
// 所有按钮最终展示给用户的错误都是「哪里错了 + 应该怎么操作」的口语化文案，
// 并且错误类别（CREDIT_* / AUTH_* / RATE_LIMIT / NETWORK）统一，方便后续上报。
//

export type ErrorCategory =
  | 'CREDIT_BALANCE'       // 永久余额不足（引导充值）
  | 'CREDIT_DAILY'         // 今日次数用完（引导次日再来/买次卡）
  | 'CREDIT_TOTAL'         // 今日+余额都不够
  | 'CREDIT_CONCURRENT'    // 并发冲突，稍后重试
  | 'AUTH_UNAUTHORIZED'    // 未登录或登录失效（引导去登录）
  | 'AUTH_FORBIDDEN'       // 无权限（如管理员密码错误）
  | 'RATE_LIMIT'           // 限流（告诉用户要等多久）
  | 'INPUT_VALIDATION'     // 参数不合法（具体告诉哪里错）
  | 'NETWORK'              // 断网/CORS/跨域/超时
  | 'SERVER_ERROR'         // 5xx 服务器错误
  | 'PAYMENT_FAILED'       // 支付相关失败
  | 'UPLOAD_FAILED'        // 上传失败（尺寸/格式/魔数不通过）
  | 'UNKNOWN';             // 兜底

export interface FriendlyError {
  category: ErrorCategory;
  /** 一句话标题（告诉用户发生了什么） */
  title: string;
  /** 2~3 句正文（告诉用户为什么、该怎么办），可以带换行 */
  detail: string;
  /** 可选：建议用户点击的动作，方便按钮外面额外渲染「去充值 / 去登录 / 重试」链接 */
  suggestedAction?: {
    label: string;
    to: string; // 内部路由：/recharge / /login / ''
    externalUrl?: string;
  };
}

// 后端业务错误码（与 functions/api/_lib/auth.js 的 RATE_LIMITED 等保持一致）
const BIZ_CODE: Record<string, ErrorCategory> = {
  // membership.js
  USER_NOT_FOUND: 'AUTH_UNAUTHORIZED',
  BALANCE_INSUFFICIENT: 'CREDIT_BALANCE',
  DAILY_INSUFFICIENT: 'CREDIT_DAILY',
  TOTAL_INSUFFICIENT: 'CREDIT_TOTAL',
  CONCURRENT_CONFLICT: 'CREDIT_CONCURRENT',
  INVALID_COST: 'INPUT_VALIDATION',
  // auth.js 里的通用错误码
  RATE_LIMITED: 'RATE_LIMIT',
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  FORBIDDEN: 'AUTH_FORBIDDEN',
  BAD_REQUEST: 'INPUT_VALIDATION',
};

/**
 * 把「任何形状的错误」翻译成用户看得懂的 FriendlyError。
 *
 * 传入 err 可以是这些来源：
 *   1. axios 的 catch(err)：err.response?.data 有 { error, error_code, message, need, have, retry_after }
 *   2. 原生 fetch 的 throw new Error('xxx') / 'NetworkError'
 *   3. 后端 200 但是 res.data.success=false：{ success:false, message:'', error_code?:'' }
 *   4. 前端校验失败的原始字符串（如 '请输入邮箱'，category 固定 INPUT_VALIDATION）
 */
export function formatError(err: any, fallbackTitle = '操作失败'): FriendlyError {
  // --- Case A：纯字符串错误（前端本地校验） ---
  if (typeof err === 'string') {
    return {
      category: 'INPUT_VALIDATION',
      title: fallbackTitle,
      detail: err,
    };
  }
  if (!err) {
    return {
      category: 'UNKNOWN',
      title: fallbackTitle,
      detail: '发生了未知错误，请稍后重试。',
    };
  }

  // 解包 axios 响应体
  const respData = err?.response?.data ?? err?.data ?? err;
  const httpStatus: number | undefined = err?.status ?? err?.response?.status ?? respData?.status;
  const bizErrorCode: string | undefined =
    respData?.error_code ?? respData?.code;
  const rawMsg: string | undefined =
    respData?.error ?? respData?.message ?? err?.message ?? undefined;

  // --- Case B：HTTP 401 / 403（不管什么错误码，优先用 HTTP 语义） ---
  if (httpStatus === 401 || bizErrorCode === 'UNAUTHORIZED' || bizErrorCode === 'USER_NOT_FOUND') {
    return {
      category: 'AUTH_UNAUTHORIZED',
      title: '登录状态已失效',
      detail: '可能是你太久没操作、账号在别处登录，或者本地缓存被清除了。\n请重新登录后再试一次。',
      suggestedAction: { label: '去登录', to: '/login' },
    };
  }
  if (httpStatus === 403 || bizErrorCode === 'FORBIDDEN') {
    return {
      category: 'AUTH_FORBIDDEN',
      title: '没有操作权限',
      detail: '当前账号不允许执行这个操作。\n如果你是管理员，请检查管理员密码是否正确。',
    };
  }
  if (httpStatus === 429 || bizErrorCode === 'RATE_LIMITED') {
    const sec: number = Number(respData?.retry_after) || 30;
    return {
      category: 'RATE_LIMIT',
      title: '操作太频繁啦',
      detail: `为了避免系统被刷，我们暂时限制了请求速度。\n请等待 ${sec} 秒后再点击即可。`,
    };
  }
  if (httpStatus === 400 || bizErrorCode === 'BAD_REQUEST' || bizErrorCode === 'INVALID_COST') {
    return {
      category: 'INPUT_VALIDATION',
      title: '提交的参数有问题',
      detail: rawMsg
        ? `服务器说：${rawMsg}\n请检查后再试一次。`
        : '请检查输入的内容是否符合要求（例如字数限制、格式、是否必填）。',
    };
  }
  if (httpStatus && httpStatus >= 500 && httpStatus < 600) {
    return {
      category: 'SERVER_ERROR',
      title: '服务器正在开小差',
      detail: '不是你的操作问题，服务器内部临时出错了。\n请稍后再试，如果一直出现请联系管理员。',
    };
  }

  // --- Case C：后端 200 但业务成功=false 的错误码 ---
  if (bizErrorCode && BIZ_CODE[bizErrorCode]) {
    const cat = BIZ_CODE[bizErrorCode];
    const need: number = Number(respData?.need);
    const have: number = Number(respData?.have);

    switch (cat) {
      case 'CREDIT_BALANCE': {
        const shortfall = Number.isFinite(need) ? Math.max(need - have, 1) : 1;
        return {
          category: cat,
          title: '永久次数不够了',
          detail: Number.isFinite(have)
            ? `这次需要消耗 ${need} 次，但你只有 ${have} 次永久余额。\n还差 ${shortfall} 次，充值后就能继续生成。`
            : rawMsg || '永久余额不足，请先充值。',
          suggestedAction: { label: '去充值', to: '/recharge' },
        };
      }
      case 'CREDIT_DAILY':
        return {
          category: cat,
          title: '今日免费次数已用完',
          detail:
            '会员每天送的免费次数今天已经全部用完了。\n明天会自动重置，或者你也可以购买次卡立即使用。',
          suggestedAction: { label: '去充值', to: '/recharge' },
        };
      case 'CREDIT_TOTAL':
        return {
          category: cat,
          title: '今日次数和永久余额都不够',
          detail: Number.isFinite(have)
            ? `扣完今日次数后还差 ${need - 0 || need} 次，但永久余额只剩 ${have} 次。\n充值后就能继续生成。`
            : rawMsg || '今日次数和永久余额都不足，请先充值。',
          suggestedAction: { label: '去充值', to: '/recharge' },
        };
      case 'CREDIT_CONCURRENT':
        return {
          category: cat,
          title: '刚才和别的请求挤到一起了',
          detail: rawMsg || '可能你同时点了两个生成任务，或者系统正在处理另一个请求。\n请等 2 秒再点一次即可，不会重复扣费。',
        };
      case 'RATE_LIMIT':
        return {
          category: cat,
          title: '操作太频繁啦',
          detail: rawMsg || '请等一会儿再点击，避免账号被限制。',
        };
      default:
        break;
    }
  }

  // --- Case D：网络错误（没有 status、message 含 Network/CORS/Failed to fetch） ---
  const msgLower = String(rawMsg || '').toLowerCase();
  const errNameLower = String(err?.name || '').toLowerCase();
  if (
    !httpStatus &&
    (msgLower.includes('network') ||
      msgLower.includes('cors') ||
      msgLower.includes('failed to fetch') ||
      msgLower.includes('timeout') ||
      msgLower.includes('请求超时') ||
      errNameLower === 'networkerror')
  ) {
    return {
      category: 'NETWORK',
      title: '网络连接不上',
      detail:
        '可能是你的 Wi-Fi/流量断了，或者网站服务器暂时无法访问。\n请检查网络后刷新页面再试。',
    };
  }

  // --- Case E：上传文件的典型错误识别 ---
  if (msgLower.includes('文件') || msgLower.includes('图片') || msgLower.includes('upload')) {
    return {
      category: 'UPLOAD_FAILED',
      title: '图片上传失败',
      detail:
        rawMsg ||
        '请检查：\n1. 格式：只能上传 JPG / PNG，不能上传 GIF / WebP / 动图\n2. 大小：单张图片不能超过 8MB\n3. 文件是否损坏，可以换一张图片再试',
    };
  }

  // --- Case F：支付相关的典型错误识别 ---
  if (msgLower.includes('支付') || msgLower.includes('订单') || msgLower.includes('pay')) {
    return {
      category: 'PAYMENT_FAILED',
      title: '支付操作失败',
      detail: rawMsg || '请确认你已经扫码完成付款，或者稍后再查询订单状态。',
    };
  }

  // --- Case G：兜底（保留原始非技术消息，但隐藏堆栈） ---
  const safeRaw =
    rawMsg && !/<|at |Error:|stack/i.test(rawMsg) ? `（${rawMsg}）` : '';
  return {
    category: 'UNKNOWN',
    title: fallbackTitle,
    detail: `没能成功完成这次操作${safeRaw}。\n请刷新页面再试，如果一直出现请联系管理员。`,
  };
}

/** 把 FriendlyError 转成一行文字（旧代码只传 string 的错误框时临时用） */
export function friendlyToLine(fe: FriendlyError): string {
  return `${fe.title}：${fe.detail.replace(/\n/g, ' ')}`;
}
