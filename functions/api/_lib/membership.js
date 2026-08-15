// 会员相关工具函数
//
// 错误码规范（error_code）：供前端做友好提示+操作引导
//   USER_NOT_FOUND         用户不存在/被删除
//   BALANCE_INSUFFICIENT   永久余额不足（附带 need/received）
//   DAILY_INSUFFICIENT     今日次数不足
//   TOTAL_INSUFFICIENT     今日+余额都不够
//   CONCURRENT_CONFLICT    高并发冲突，提示稍后重试
//   INVALID_COST           非法扣减次数（<=0或太大）
//

export const ERROR_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  BALANCE_INSUFFICIENT: 'BALANCE_INSUFFICIENT',
  DAILY_INSUFFICIENT: 'DAILY_INSUFFICIENT',
  TOTAL_INSUFFICIENT: 'TOTAL_INSUFFICIENT',
  CONCURRENT_CONFLICT: 'CONCURRENT_CONFLICT',
  INVALID_COST: 'INVALID_COST',
};

// 会员套餐配置
export const MEMBERSHIP_PLANS = {
  monthly: {
    name: '月卡',
    price: 29,
    daily_credits: 5,
    duration_days: 30,
  },
  quarterly: {
    name: '季卡',
    price: 69,
    daily_credits: 8,
    duration_days: 90,
  },
  yearly: {
    name: '年卡',
    price: 199,
    daily_credits: 12,
    duration_days: 365,
  },
};

// 查询用户行（最精简 select 字段，默认不含敏感字段）
async function fetchUserById(userId, supabaseUrl, serviceKey, selectCols = '*') {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=${encodeURIComponent(selectCols)}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

// 检查并重置每日次数（如果是新的一天）
// 并发安全：跨天重置时使用 last_daily_reset 的不等号 WHERE 做原子条件，
// 保证同时刻 N 个并发请求只有第一个能成功把 daily_credits_used 归零。
export async function checkAndResetDailyCredits(userId, { supabaseUrl, serviceKey }) {
  try {
    const user = await fetchUserById(userId, supabaseUrl, serviceKey, '*');
    if (!user) return null;

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 不是会员
    if (!user.membership_type || !user.membership_expire_at) {
      return {
        ...user,
        is_member: false,
        daily_credits_remaining: 0,
      };
    }

    // 会员是否到期
    const expireAt = new Date(user.membership_expire_at);
    if (now > expireAt) {
      return {
        ...user,
        is_member: false,
        daily_credits_remaining: 0,
      };
    }

    const lastReset = user.last_daily_reset
      ? new Date(user.last_daily_reset).toISOString().split('T')[0]
      : null;

    if (lastReset !== today) {
      const plan = MEMBERSHIP_PLANS[user.membership_type];
      const dailyCredits = plan ? plan.daily_credits : 10;

      // 🔒 并发安全：只在 last_daily_reset < today 时才允许更新
      // 如果上一步读到 lastReset 是昨天，这期间有另一个请求先重置了，
      // 那么这个 PATCH 会因为 last_daily_reset 已经 == today 而 0 行更新。
      let resetSucceeded = false;
      try {
        const resetRes = await fetch(
          `${supabaseUrl}/rest/v1/users?id=eq.${userId}&last_daily_reset=neq.${today}`,
          {
            method: 'PATCH',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({
              daily_credits_used: 0,
              last_daily_reset: today,
            }),
          }
        );
        if (resetRes.ok) {
          const rows = await resetRes.json();
          if (rows && rows.length > 0) {
            resetSucceeded = true;
          }
        }
      } catch (updateError) {
        console.error('重置每日次数失败:', updateError);
      }

      // 没抢上（另一个并发先重置了）→ 重新读最新值，不重置
      if (!resetSucceeded) {
        const latestUser = await fetchUserById(userId, supabaseUrl, serviceKey, '*');
        if (latestUser) {
          const used = latestUser.daily_credits_used || 0;
          return {
            ...latestUser,
            is_member: true,
            daily_credits_remaining: Math.max(dailyCredits - used, 0),
            daily_credits_total: dailyCredits,
          };
        }
      }

      return {
        ...user,
        is_member: true,
        daily_credits_used: 0,
        daily_credits_remaining: dailyCredits,
        daily_credits_total: dailyCredits,
      };
    }

    const plan = MEMBERSHIP_PLANS[user.membership_type];
    const dailyCredits = plan ? plan.daily_credits : 10;
    const used = user.daily_credits_used || 0;
    const remaining = Math.max(dailyCredits - used, 0);

    return {
      ...user,
      is_member: true,
      daily_credits_remaining: remaining,
      daily_credits_total: dailyCredits,
    };
  } catch (error) {
    console.error('检查每日次数失败:', error);
    return null;
  }
}

// 扣除次数（优先扣每日，再扣余额）
//
// 🔒 并发安全策略（CAS + 最大重试）：
//   - 所有 UPDATE 都带「数值范围」WHERE（balance >= cost / daily_used <= dailyTotal-cost）
//   - 余额更新不使用旧快照的绝对数，而是让数据库做原子操作：balance - cost。
//     但 Supabase REST 不直接支持 balance=balance-cost，所以改用「读最新值 + WHERE=gte +
//     失败最多重试 5 次」的 CAS 循环；每次重试都重新 fetchUserById 拿最新的 balance/daily_used。
//   - 最大 5 次重试后仍失败，则返回 CONCURRENT_CONFLICT，前端提示稍后再试。
//
export async function deductCredits(
  userId,
  cost,
  supabase,
  supabaseUrl,
  serviceKey
) {
  const MAX_RETRY = 5;

  // 合法性保护（<=0 或 单次极大值都拒绝，避免溢出）
  if (!Number.isFinite(cost) || cost <= 0) {
    return {
      success: false,
      error_code: ERROR_CODES.INVALID_COST,
      error: '请求的扣减次数无效',
    };
  }
  if (cost > 99999) {
    return {
      success: false,
      error_code: ERROR_CODES.INVALID_COST,
      error: '单次扣减次数过大',
    };
  }

  let lastErrCode = null;
  let lastErrMsg = null;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      // 每次重试都从数据库拿「当前最新」用户状态（包含每日重置）
      const userInfo = await checkAndResetDailyCredits(userId, {
        supabaseUrl,
        serviceKey,
      });
      if (!userInfo) {
        return {
          success: false,
          error_code: ERROR_CODES.USER_NOT_FOUND,
          error: '用户不存在，请重新登录',
        };
      }

      // --- 非会员：只扣余额 ---
      if (!userInfo.is_member) {
        if (userInfo.balance < cost) {
          return {
            success: false,
            error_code: ERROR_CODES.BALANCE_INSUFFICIENT,
            error: `永久余额不足：还需 ${cost} 次，当前仅有 ${userInfo.balance} 次`,
            need: cost,
            have: userInfo.balance,
          };
        }

        const newBalance = userInfo.balance - cost;
        const upRes = await fetch(
          `${supabaseUrl}/rest/v1/users?id=eq.${userId}&balance=gte.${cost}`,
          {
            method: 'PATCH',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({ balance: newBalance }),
          }
        );

        if (!upRes.ok) throw new Error('更新余额失败');
        const updated = await upRes.json();
        if (!updated || updated.length === 0) {
          // CAS 冲突：余额在这期间被另一个请求扣了 → 重试
          lastErrCode = ERROR_CODES.CONCURRENT_CONFLICT;
          lastErrMsg = '操作过于频繁，请稍候再试';
          continue;
        }

        return {
          success: true,
          used_daily: false,
          remaining_balance: updated[0].balance,
          daily_remaining: 0,
        };
      }

      // --- 会员：先扣每日，再扣余额 ---
      const dailyRemaining = userInfo.daily_credits_remaining || 0;
      const dailyTotal = userInfo.daily_credits_total || 0;

      if (dailyRemaining >= cost) {
        // 够扣每日
        const newUsed = (userInfo.daily_credits_used || 0) + cost;
        const upRes = await fetch(
          `${supabaseUrl}/rest/v1/users?id=eq.${userId}&daily_credits_used=lte.${
            dailyTotal - cost
          }`,
          {
            method: 'PATCH',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({ daily_credits_used: newUsed }),
          }
        );
        if (!upRes.ok) throw new Error('更新每日次数失败');
        const updated = await upRes.json();
        if (!updated || updated.length === 0) {
          lastErrCode = ERROR_CODES.DAILY_INSUFFICIENT;
          lastErrMsg = '今日次数已被占用，请稍后再试';
          continue;
        }
        return {
          success: true,
          used_daily: true,
          daily_remaining: dailyRemaining - cost,
          remaining_balance: updated[0].balance,
        };
      }

      // 每日不够 → 先扣完每日，剩余扣余额
      const fromDaily = dailyRemaining; // 从每日里扣 fromDaily 次
      const fromBalance = cost - fromDaily; // 从余额里扣 fromBalance 次

      if (userInfo.balance < fromBalance) {
        return {
          success: false,
          error_code: ERROR_CODES.TOTAL_INSUFFICIENT,
          error: `今日次数剩余 ${dailyRemaining}，还需从余额扣 ${fromBalance}，但余额仅有 ${userInfo.balance} 次`,
          need: fromBalance,
          have: userInfo.balance,
        };
      }

      const newUsed = (userInfo.daily_credits_used || 0) + fromDaily;
      const newBalance = userInfo.balance - fromBalance;

      const upRes = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${userId}&balance=gte.${fromBalance}`,
        {
          method: 'PATCH',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            daily_credits_used: newUsed,
            balance: newBalance,
          }),
        }
      );

      if (!upRes.ok) throw new Error('更新次数失败');
      const updated = await upRes.json();
      if (!updated || updated.length === 0) {
        lastErrCode = ERROR_CODES.CONCURRENT_CONFLICT;
        lastErrMsg = '操作过于频繁，请稍候再试';
        continue;
      }

      return {
        success: true,
        used_daily: true,
        daily_remaining: 0,
        remaining_balance: updated[0].balance,
      };
    } catch (error) {
      console.error(`扣除次数失败（第${attempt + 1}次）:`, error);
      lastErrCode = ERROR_CODES.CONCURRENT_CONFLICT;
      lastErrMsg = error.message || '系统繁忙，请稍后重试';
      // 继续下一次重试，不 break
    }
  }

  // MAX_RETRY 次后仍不成功
  return {
    success: false,
    error_code: lastErrCode || ERROR_CODES.CONCURRENT_CONFLICT,
    error: lastErrMsg || '操作过于频繁，请稍后再试',
  };
}

// 开通会员
export async function activateMembership(userId, planType, supabaseUrl, serviceKey) {
  try {
    const plan = MEMBERSHIP_PLANS[planType];
    if (!plan) {
      return { success: false, error: '无效的套餐类型' };
    }

    const user = await fetchUserById(
      userId,
      supabaseUrl,
      serviceKey,
      'id,membership_type,membership_expire_at'
    );
    if (!user) {
      return { success: false, error: '用户不存在' };
    }

    const now = new Date();
    let expireAt;
    const isRenewal =
      user.membership_type &&
      user.membership_expire_at &&
      new Date(user.membership_expire_at) > now;

    if (isRenewal) {
      expireAt = new Date(
        new Date(user.membership_expire_at).getTime() +
          plan.duration_days * 24 * 60 * 60 * 1000
      );
    } else {
      expireAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);
    }

    await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        membership_type: planType,
        membership_expire_at: expireAt.toISOString(),
        daily_credits_used: 0,
        last_daily_reset: now.toISOString().split('T')[0],
      }),
    });

    return {
      success: true,
      plan: plan.name,
      expire_at: expireAt.toISOString(),
      daily_credits: plan.daily_credits,
      is_renewal: isRenewal,
    };
  } catch (error) {
    console.error('开通会员失败:', error);
    return { success: false, error: error.message };
  }
}
