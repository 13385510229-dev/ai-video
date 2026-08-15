// 管理员审计日志工具
//
// 设计目标：
// 1. 容错优先 —— 审计日志失败绝不阻塞主业务流程（最多 console.warn）
// 2. 字段宽松 —— 即使 admin_logs 表缺少某些字段也能尽量写入
// 3. 调用简单 —— 任何管理员接口一行 await writeAdminLog(env, {...}) 即可
//
// 期望的 admin_logs 表结构（在 Supabase 后台执行下面 SQL 即可创建）：
//
//   create table if not exists public.admin_logs (
//     id bigserial primary key,
//     action text not null,                  -- confirm_payment / add_credits / disable_user / enable_user
//     target_user_id bigint,                 -- 被操作的用户 ID（可空）
//     target_order_id bigint,                -- 被操作的订单 ID（可空）
//     amount integer,                        -- 余额变化（可空，正负数）
//     detail jsonb,                          -- 详细操作内容（JSON）
//     operator_ip text,                      -- 操作者 IP
//     user_agent text,                       -- 操作者 UA
//     created_at timestamptz default now()
//   );
//   -- 给查询加索引
//   create index if not exists admin_logs_created_at_idx on public.admin_logs (created_at desc);
//   create index if not exists admin_logs_action_idx on public.admin_logs (action);
//   create index if not exists admin_logs_target_user_id_idx on public.admin_logs (target_user_id);

/**
 * 从 Request 中安全地提取客户端 IP
 */
function getClientIp(request) {
  if (!request) return 'unknown';
  try {
    return (
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      request.headers.get('X-Real-IP') ||
      'unknown'
    );
  } catch (_) {
    return 'unknown';
  }
}

function getUserAgent(request) {
  if (!request) return null;
  try {
    return request.headers.get('User-Agent')?.slice(0, 500) || null;
  } catch (_) {
    return null;
  }
}

/**
 * 写一条管理员审计日志
 *
 * @param env {Record<string, any>} Workers env
 * @param entry {{
 *   action: string,
 *   targetUserId?: number|string|null,
 *   targetOrderId?: number|string|null,
 *   amount?: number|null,
 *   detail?: any,
 *   request?: Request,
 * }}
 * @returns {Promise<boolean>} 是否写入成功
 */
export async function writeAdminLog(env, entry) {
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  const {
    action,
    targetUserId = null,
    targetOrderId = null,
    amount = null,
    detail = null,
    request = null,
  } = entry || {};

  if (!action) return false;

  const payload = {
    action: String(action).slice(0, 64),
    target_user_id: targetUserId != null ? targetUserId : null,
    target_order_id: targetOrderId != null ? targetOrderId : null,
    amount: typeof amount === 'number' ? amount : null,
    detail: detail != null ? JSON.stringify(detail).slice(0, 4000) : null,
    operator_ip: getClientIp(request),
    user_agent: getUserAgent(request),
  };

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/admin_logs`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // 表不存在 / 字段不匹配 / RLS 拦截 都会走到这里。只 warn 不抛出。
      console.warn(`[adminLog] 写入失败 status=${res.status} action=${action}:`, errText.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[adminLog] 写入异常 action=${action}:`, err?.message || err);
    return false;
  }
}
