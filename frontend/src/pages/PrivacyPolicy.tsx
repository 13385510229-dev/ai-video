const PrivacyPolicy = () => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 animate-fade-in">
      <div className="mb-12">
        <h1 className="text-3xl font-bold mb-4">隐私政策</h1>
        <p className="text-gray-400">版本：1.0 | 生效日期：2024年1月1日</p>
      </div>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">1. 信息收集</h2>
          <p className="mb-4">
            本服务仅收集用户的邮箱地址，用于登录验证和账户管理。邮箱地址是用户唯一的身份标识。
          </p>
          <p className="mb-4">
            用户在使用服务过程中生成的内容（视频、图片）会被存储，以便用户随时查看和管理。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">2. 信息使用</h2>
          <p className="mb-4">
            用户邮箱仅用于发送登录验证码，不会用于发送营销邮件或其他非必要通知。
          </p>
          <p className="mb-4">
            用户生成的内容仅用于提供服务，不会被用于训练AI模型或分享给第三方。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">3. 信息存储与安全</h2>
          <p className="mb-4">
            用户数据存储在安全的云服务器上，采用行业标准的加密技术保护数据安全。
          </p>
          <p className="mb-4">
            本服务定期进行安全审计，确保用户数据不受未经授权的访问。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">4. 信息共享</h2>
          <p className="mb-4">
            本服务不会向任何第三方出售、出租或分享用户的个人信息。
          </p>
          <p className="mb-4">
            仅在法律要求或保护服务安全的情况下，可能会向执法机构提供必要信息。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">5. 用户权利</h2>
          <p className="mb-4">
            用户有权查看、导出和删除自己的个人数据。可以在"个人中心"页面进行相关操作。
          </p>
          <p className="mb-4">
            用户删除账户后，所有相关数据将在30天内被永久删除。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">6. Cookie 使用</h2>
          <p className="mb-4">
            本服务使用少量必要的Cookie来维持用户登录状态。用户可以通过浏览器设置管理Cookie。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">7. 隐私政策变更</h2>
          <p className="mb-4">
            本隐私政策可能会不定期更新。重大变更将通过邮箱通知用户。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-white">8. 联系方式</h2>
          <p>如有任何隐私相关问题，请通过以下方式联系我们：</p>
          <p className="text-gray-400 mt-2">邮箱：privacy@aivideo.example.com</p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;