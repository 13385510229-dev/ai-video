# AI 视频 & 图片生成平台

一个完整可商用的 AI 生成网站，支持视频生成和图片生成，采用 Netflix 风格黑白简约设计。

## 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS
- **后端**：Cloudflare Pages Functions（零外部依赖）
- **数据库**：Supabase (PostgreSQL)
- **认证**：JWT + 邮箱验证码登录
- **AI 视频**：Agnes AI（免费 API）+ 模拟模式兜底
- **AI 图片**：Agnes Image 2.1 Flash + 模拟模式兜底
- **支付**：手动确认支付（完全免费）

## 功能特性

### 用户端
- 🎬 文字生成视频，支持多种风格、时长、比例
- 🎨 文字生成图片，支持多种风格、尺寸
- 📁 视频历史记录管理，自动刷新生成状态
- 🖼️ 图片历史记录管理
- 💎 充值套餐系统，视频图片共用余额
- 👤 个人中心
- 📧 邮箱验证码登录

### 管理后台
- 📊 数据统计仪表盘
- 📋 订单管理，手动确认支付
- 👥 用户管理，调整用户余额
- 🔐 管理员密码登录

## 部署步骤

### 第一步：创建 Supabase 数据库

1. 访问 https://supabase.com 注册账号
2. 创建新项目，区域选择新加坡（Southeast Asia）
3. 在 SQL Editor 中执行以下 SQL 创建表：

```sql
-- users 表
create table users (
  id bigint primary key generated always as identity,
  email text unique not null,
  balance integer default 0,
  created_at timestamp with time zone default now()
);

-- videos 表
create table videos (
  id bigint primary key generated always as identity,
  user_id bigint references users(id),
  prompt text not null,
  negative_prompt text,
  style text,
  duration integer default 5,
  aspect_ratio text default '16:9',
  task_id text,
  status text default 'pending',
  video_url text,
  thumbnail_url text,
  error_message text,
  cost integer default 1,
  created_at timestamp with time zone default now()
);

-- orders 表
create table orders (
  id bigint primary key generated always as identity,
  user_id bigint references users(id),
  order_no text unique not null,
  amount decimal(10,2) not null,
  credits integer not null,
  status text default 'pending',
  paid_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- images 表
create table images (
  id bigint primary key generated always as identity,
  user_id bigint references users(id),
  prompt text not null,
  negative_prompt text,
  style text,
  size text default '1024x768',
  image_url text,
  status text default 'processing',
  error_message text,
  cost integer default 1,
  created_at timestamp with time zone default now()
);
```

4. 在 Project Settings → API 中获取：
   - Project URL
   - service_role key（注意：不是 anon key）

### 第二步：部署到 Cloudflare Pages

1. 访问 https://dash.cloudflare.com 登录
2. 进入 Workers & Pages → Create → Pages → Connect to Git
3. 选择你的 GitHub 仓库
4. 配置构建设置：
   - **Build command**: `cd frontend && npm install && npm run build`
   - **Build output directory**: `frontend/dist`
5. 点击 Save and Deploy（第一次构建可能会失败，没关系，继续下一步）

### 第三步：配置环境变量

在 Cloudflare Pages 项目设置中，找到 Environment variables，添加以下变量：

| 变量名 | 说明 | 必填 |
|--------|------|------|
| SUPABASE_URL | Supabase 项目 URL | ✅ |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service_role key | ✅ |
| JWT_SECRET | JWT 签名密钥（任意字符串） | ✅ |
| ADMIN_PASSWORD | 管理员密码，默认 admin123 | ✅ |
| AGNES_API_KEY | Agnes AI API Key | ❌ |
| RESEND_API_KEY | Resend 邮件 API Key | ❌ |
| SMTP_FROM_EMAIL | 发件邮箱 | ❌ |
| SMTP_FROM_NAME | 发件人名称 | ❌ |
| PAYMENT_MODE | 支付模式，默认 manual | ❌ |
| PAYMENT_QR_CODE | 收款码图片 URL | ❌ |

**注意**：环境变量添加后，需要重新部署才能生效。

### 第四步：获取 Agnes AI API Key（可选）

1. 访问 https://platform.agnes-ai.com 注册账号
2. 在 API Keys 页面创建新的 API Key
3. 将 Key 填入环境变量 AGNES_API_KEY

不配置的话会使用模拟模式，生成的是示例视频，适合测试。

### 第五步：配置邮件服务（可选）

1. 访问 https://resend.com 注册账号
2. 获取 API Key，填入 RESEND_API_KEY
3. 配置发件邮箱 SMTP_FROM_EMAIL 和 SMTP_FROM_NAME

不配置的话会使用模拟模式，验证码会打印在 Functions 日志中，适合测试。

## 本地开发

### 前端开发

```bash
cd frontend
npm install
npm run dev
```

前端运行在 http://localhost:3000

### 后端开发

后端是 Cloudflare Pages Functions，需要部署到 Cloudflare 才能运行。
本地可以使用 `wrangler pages dev` 命令测试（需要安装 wrangler）。

## 项目结构

```
ai-video-full/
├── frontend/              # 前端代码
│   ├── src/
│   │   ├── api/          # API 封装
│   │   ├── components/   # 公共组件
│   │   ├── pages/        # 页面组件
│   │   ├── store/        # 状态管理
│   │   ├── types/        # TypeScript 类型
│   │   ├── App.tsx       # 主应用
│   │   ├── main.tsx      # 入口文件
│   │   └── index.css     # 全局样式
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
├── functions/            # 后端 Cloudflare Functions
│   └── api/
│       ├── _lib/         # 工具库（零依赖）
│       │   ├── supabase.js
│       │   ├── auth.js
│       │   ├── emailService.js
│       │   ├── videoService.js
│       │   └── imageService.js
│       ├── auth/         # 认证接口
│       ├── videos/       # 视频接口
│       ├── images/       # 图片接口
│       ├── payment/      # 支付接口
│       └── admin/        # 管理后台接口
├── .env.example          # 环境变量示例
└── README.md             # 说明文档
```

## 管理后台

访问路径：`/admin`

默认密码：admin123（请在环境变量中修改）

功能：
- 查看平台统计数据
- 管理订单，确认支付
- 管理用户，调整余额

## 套餐配置

默认套餐：
- 10次：¥9.9
- 30次：¥24.9
- 100次：¥69.9

如需修改，编辑 `frontend/src/pages/Recharge.tsx` 和 `functions/api/payment/create-order.js`。

## 消耗次数规则

### 视频
- 5秒：1次
- 10秒：2次
- 30秒：3次

### 图片
- 1张：1次

视频和图片共用余额。

## 注意事项

1. **新用户福利**：首次登录赠送 3 次免费生成机会
2. **视频生成时间**：视频生成大约需要 5-10 分钟
3. **图片生成时间**：图片生成大约需要几秒到几十秒
4. **模拟模式**：不配置 Agnes AI API Key 时，使用模拟视频/图片
5. **手动支付**：用户扫码付款后，需要管理员手动确认到账
6. **数据安全**：SUPABASE_SERVICE_ROLE_KEY 有全部权限，请勿泄露
7. **共用余额**：视频生成和图片生成共用用户余额

## 常见问题

### Q: 构建失败怎么办？
A: 检查构建命令是否正确，确保是 `cd frontend && npm install && npm run build`

### Q: Functions 不生效怎么办？
A: 确保 functions 目录在项目根目录，并且文件名正确（如 login.js 对应 POST 请求）

### Q: 邮箱收不到验证码怎么办？
A: 测试阶段可以不配置 Resend，验证码会打印在 Functions 日志中

### Q: Agnes AI 生成失败怎么办？
A: 免费 API 可能排队或超时，系统会自动重试，也可以检查 API Key 是否正确

## License

MIT
