// 会员相关工具函数

// 会员套餐配置
export const MEMBERSHIP_PLANS = {
  monthly: {
    name: '月卡',
    price: 39,
    daily_credits: 10,
    duration_days: 30,
  },
  quarterly: {
    name: '季卡',
    price: 99,
    daily_credits: 15,
    duration_days: 90,
  },
  yearly: {
    name: '年卡',
    price: 299,
    daily_credits: 20,
    duration_days: 365,
  },
};

// 检查并重置每日次数（如果是新的一天）
export async function checkAndResetDailyCredits(userId, { supabaseUrl, serviceKey }) {
  try {
    // 获取用户信息（用原生 fetch）
    const userQueryRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=*`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });

    if (!userQueryRes.ok) {
      return null;
    }

    const users = await userQueryRes.json();
    if (!users?.[0]) {
      return null;
    }

    const user = users[0];

    // 不是会员，直接返回
    if (!user.membership_type || !user.membership_expire_at) {
      return {
        ...user,
        is_member: false,
        daily_credits_remaining: 0,
      };
    }

    // 检查会员是否到期
    const now = new Date();
    const expireAt = new Date(user.membership_expire_at);
    if (now > expireAt) {
      // 会员已到期
      return {
        ...user,
        is_member: false,
        daily_credits_remaining: 0,
      };
    }

    // 获取今天的日期（YYYY-MM-DD）
    const today = now.toISOString().split('T')[0];
    const lastReset = user.last_daily_reset 
      ? new Date(user.last_daily_reset).toISOString().split('T')[0] 
      : null;

    // 如果今天还没重置过，就重置
    if (lastReset !== today) {
      const plan = MEMBERSHIP_PLANS[user.membership_type];
      const dailyCredits = plan ? plan.daily_credits : 10;

      // 更新用户的每日次数和重置日期
      try {
        await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            daily_credits_used: 0,
            last_daily_reset: today,
          }),
        });
      } catch (updateError) {
        console.error('重置每日次数失败:', updateError);
      }

      return {
        ...user,
        is_member: true,
        daily_credits_used: 0,
        daily_credits_remaining: dailyCredits,
        daily_credits_total: dailyCredits,
      };
    }

    // 今天已经重置过了，计算剩余次数
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

// 扣除次数（优先扣每日次数，再扣余额）
export async function deductCredits(userId, cost, supabase, supabaseUrl, serviceKey) {
  try {
    // 先检查并重置每日次数
    const userInfo = await checkAndResetDailyCredits(userId, { supabaseUrl, serviceKey });
    if (!userInfo) {
      return { success: false, error: '用户不存在' };
    }

    // 不是会员，直接扣余额
    if (!userInfo.is_member) {
      if (userInfo.balance < cost) {
        return { success: false, error: '余额不足' };
      }
      
      // 带条件更新，防止并发扣成负数
      const balanceUpdateRes = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${userId}&balance=gte.${cost}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ balance: userInfo.balance - cost }),
        }
      );

      if (!balanceUpdateRes.ok) {
        throw new Error('更新余额失败');
      }

      const updated = await balanceUpdateRes.json();
      if (!updated || updated.length === 0) {
        // 没有更新到行，说明并发了或者余额不足
        return { success: false, error: '余额不足' };
      }

      return { 
        success: true, 
        used_daily: false, 
        remaining_balance: updated[0].balance,
      };
    }

    // 是会员，先扣每日次数
    const dailyRemaining = userInfo.daily_credits_remaining || 0;
    const dailyTotal = userInfo.daily_credits_total || 0;
    
    if (dailyRemaining >= cost) {
      // 每日次数够用，扣每日次数
      const newUsed = (userInfo.daily_credits_used || 0) + cost;
      
      const dailyUpdateRes = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${userId}&daily_credits_used=lte.${dailyTotal - cost}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ daily_credits_used: newUsed }),
        }
      );

      if (!dailyUpdateRes.ok) {
        throw new Error('更新每日次数失败');
      }

      const updated = await dailyUpdateRes.json();
      if (!updated || updated.length === 0) {
        // 并发了，重新查一下再判断
        return { success: false, error: '今日次数不足' };
      }

      return { 
        success: true, 
        used_daily: true, 
        daily_remaining: dailyRemaining - cost,
        remaining_balance: userInfo.balance,
      };
    } else {
      // 每日次数不够，先扣完每日次数，剩下的扣余额
      const remainingCost = cost - dailyRemaining;
      if (userInfo.balance < remainingCost) {
        return { success: false, error: '今日次数和余额都不足' };
      }

      const newUsed = (userInfo.daily_credits_used || 0) + dailyRemaining;
      const newBalance = userInfo.balance - remainingCost;

      // 同时更新每日次数和余额，带余额条件
      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${userId}&balance=gte.${remainingCost}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ 
            daily_credits_used: newUsed,
            balance: newBalance,
          }),
        }
      );

      if (!updateRes.ok) {
        throw new Error('更新次数失败');
      }

      const updated = await updateRes.json();
      if (!updated || updated.length === 0) {
        return { success: false, error: '余额不足' };
      }

      return { 
        success: true, 
        used_daily: true, 
        daily_remaining: 0,
        remaining_balance: updated[0].balance,
      };
    }
  } catch (error) {
    console.error('扣除次数失败:', error);
    return { success: false, error: error.message };
  }
}

// 开通会员
export async function activateMembership(userId, planType, supabaseUrl, serviceKey) {
  try {
    const plan = MEMBERSHIP_PLANS[planType];
    if (!plan) {
      return { success: false, error: '无效的套餐类型' };
    }

    // 先查用户当前的会员状态
    const userQueryRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=membership_type,membership_expire_at`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });

    if (!userQueryRes.ok) {
      throw new Error('查询用户失败');
    }

    const users = await userQueryRes.json();
    if (!users?.[0]) {
      return { success: false, error: '用户不存在' };
    }

    const user = users[0];
    const now = new Date();
    let expireAt;

    // 判断是新开通还是续费
    if (user.membership_type && user.membership_expire_at) {
      const currentExpireAt = new Date(user.membership_expire_at);
      
      if (currentExpireAt > now) {
        // 会员还没到期，续费：在现有基础上延长
        expireAt = new Date(currentExpireAt.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);
      } else {
        // 会员已到期，从现在开始算
        expireAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);
      }
    } else {
      // 从未开通过会员，从现在开始算
      expireAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);
    }

    // 更新用户会员信息
    await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
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
      is_renewal: user.membership_type && new Date(user.membership_expire_at) > now,
    };
  } catch (error) {
    console.error('开通会员失败:', error);
    return { success: false, error: error.message };
  }
}
