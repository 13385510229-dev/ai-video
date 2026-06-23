const TermsOfService = () => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 animate-fade-in">
      <div className="mb-12">
        <h1 className="text-3xl font-bold mb-4">服务条款</h1>
        <p className="text-gray-400">版本：1.0 | 生效日期：2024年1月1日</p>
      </div>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">1. 服务概述</h2>
          <p className="mb-4">
            AI Video Generator（以下简称"本服务"）是一个基于人工智能技术的视频和图片生成平台。用户可以通过输入文字描述，生成相应的视频或图片内容。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">2. 用户注册与登录</h2>
          <p className="mb-4">
            用户通过邮箱验证码完成登录。首次登录时，系统会自动创建账户并分配免费生成次数。用户需确保提供的邮箱地址真实有效。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">3. 服务使用</h2>
          <p className="mb-4">
            用户使用本服务生成的内容（视频、图片）归用户所有，但用户需确保生成内容不违反法律法规和公序良俗。
          </p>
          <p className="mb-4">
            本服务不对生成内容的准确性、完整性或适用性提供任何保证。生成内容可能存在质量差异，用户需自行判断是否符合需求。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">4. 充值与消费</h2>
          <p className="mb-4">
            用户可以通过购买套餐获取额外的生成次数。套餐价格和包含次数以页面展示为准。
          </p>
          <p className="mb-4">
            虚拟商品一经购买，概不退款。用户余额仅可用于本服务的生成消费，不可兑换现金。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">5. 服务变更与终止</h2>
          <p className="mb-4">
            本服务保留随时修改、暂停或终止服务的权利，无需提前通知用户。
          </p>
          <p className="mb-4">
            如服务终止，用户剩余余额将按照合理方式处理。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">6. 免责声明</h2>
          <p className="mb-4">
            本服务对因使用服务产生的任何直接或间接损失不承担责任。用户需自行承担使用本服务的风险。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">7. 联系方式</h2>
          <p>如有任何问题或建议，请通过以下方式联系我们：</p>
          <p className="text-gray-400 mt-2">邮箱：support@aivideo.example.com</p>
        </section>
      </div>
    </div>
  );
};

export default TermsOfService;