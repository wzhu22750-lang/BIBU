# 💌 BIBU！哔卟哔卟

<p align="center">
  <img src="docs/media/banner.svg" alt="BIBU！哔卟哔卟 · 两个人，一整个像素小宇宙" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-fff238?style=flat-square&amp;labelColor=20211d&amp;logo=react&amp;logoColor=20211d" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-7-04bcf0?style=flat-square&amp;labelColor=20211d&amp;logo=typescript&amp;logoColor=04bcf0" alt="TypeScript 7" />
  <img src="https://img.shields.io/badge/Vite-8-2aeea4?style=flat-square&amp;labelColor=20211d&amp;logo=vite&amp;logoColor=2aeea4" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Supabase-ffa6e8?style=flat-square&amp;labelColor=20211d&amp;logo=supabase&amp;logoColor=ffa6e8" alt="Supabase" />
  <img src="https://img.shields.io/badge/Capacitor-8-fffef7?style=flat-square&amp;labelColor=20211d&amp;logo=capacitor&amp;logoColor=fffef7" alt="Capacitor 8" />
  <img src="https://img.shields.io/badge/Vitest-fffef7?style=flat-square&amp;labelColor=20211d&amp;logo=vitest&amp;logoColor=fffef7" alt="Vitest" />
  <img src="https://img.shields.io/badge/%E7%A7%81%E6%9C%89%E7%A9%BA%E9%97%B4-%E4%BB%85%E9%99%90%202%20%E4%BA%BA-ffa6e8?style=flat-square&amp;labelColor=20211d" alt="私有空间，仅限 2 人" />
</p>

> 两个人，一整个小宇宙 ✨

一个灵感来自于溜溜的“BIBU”所创建的小软件，核心功能是每天都可以随时随地“BIBU”对方，表达想念。

<p align="center">
  <img src="docs/media/home.png" width="45%" alt="小窝：恋爱天数、像素小伙伴与今日寄语" />
  <img src="docs/media/photos.png" width="45%" alt="照片墙：按回忆时间正序或倒序翻看" />
</p>
<p align="center">
  <img src="docs/media/chat.png" width="45%" alt="悄悄话：只属于两个人的聊天" />
  <img src="docs/media/wardrobe.png" width="45%" alt="萌宠衣橱：像素小动物与全套装备" />
</p>

---

## 🕹️ 我们俩的一天，长这样

- **早上想 TA 了就戳一下** —— 屏幕中央那颗像素心心，长按会像小扇面一样展开 6 种情绪：哔卟哔卟、想你、抱一下、快来、晚安、我回来啦。
  松手就发射。对方手机/网页会「哔卟」一声，配着专属像素小动画 + 震动 + 音效（自己合成的小方波，不是随便找的音效文件 🔊）
- **一起走过多少天，它记得比我们都清楚** —— 恋爱天数按自然日算，开始那天是第 0 天，2 月 29 日也不会算错 🗓️
  纪念日、倒计时都收在一个「值得期待」里，配了 **100 款**手绘级像素场景图标（可搜索可分类），每次翻到一个小图标都会「啊，是那天」🌊🍰🚂
- **悄悄话是只给我们俩的** —— 中文输入法不打断、支持翻很久以前的消息、草稿自动留、没网也能先写进待发队列，联网自己发出去 💬
- **照片墙是私密的** —— 照片存在私有存储桶里，链接是限时 1 小时的；打开过的照片会留在本机缓存里，地铁里没信号也能翻（本地压缩到 1280px，不占空间）📸
  每张回忆还能写上「发生日期」「那天的心情」，甚至关联到某个纪念日或某句悄悄话——点一下就能跳过去 🔗
- **想一起变好的时候** —— 各自开专注计时，互相看得到对方在努力；Android 上还真的读得到今天屏幕用了多久（**只在本机读，不上传**），该休息了会提醒你 ⏳
- **换装可以玩一下午** —— 27 款复古像素小动物、60+ 件衣服帽子配饰（外加 10 套整套搭配），有的还会互相打架（兼容矩阵会告诉你哪顶帽子不适合哪只小动物 👒）
  喜欢的搭配可以「部署」成头像
- **每天一张每日任务** —— 两个人各自完成，一起攒连续天数 🔥

---

## 🎨 它有多「像素」

- 全站不用圆角卡片、不用毛玻璃、不用渐变——只有 2px 黑描边、硬边投影和「按下去会往右下角位移 2px」的物理手感
- 品牌字体 `Press Start 2P`，中文走系统字保证长文可读
- **所有图标都是矢量 SVG**，一个 emoji 都没有，连 `♥`、`→` 都是画的 🖌️
- 主色是那种很吵的黄 `#fff238`，配奶油白底纸和水绿/粉红点缀

---

## 🧱 技术宅的心血（想抄作业的看这里）

| 你在乎的 | 它是什么                                                                                    |
| -------- | ------------------------------------------------------------------------------------------- |
| 前端     | React 19 + TypeScript + Vite 8                                                              |
| 后端     | Supabase（PostgreSQL + RLS + Storage + Realtime + Deno Edge Functions）                     |
| 手机端   | Capacitor 8 + 自写 Kotlin 原生插件（通知 / AlarmManager 提醒 / UsageStats / 深链接 / 震动） |
| 离线     | IndexedDB 图片 LRU 缓存、消息/事件/照片三套待发队列、24h 离线快照                           |
| 质量     | Vitest + PGlite 跑真实 PostgreSQL 的 RLS/RPC 测试（400+ 用例）                              |

几个我比较较真的地方：

- **写操作全部「意图先落盘」**：没网也敢点，联网后用固定 UUID 幂等重试，服务端回执逐字段核对过才删队列
- **权限是真的关死的**：每张表都开 RLS，浏览器端只有公开密钥，业务表连 INSERT 权限都不给，全走 RPC
- **照片走限时签名链接**，不对外公开；删除前还会校验「这张是不是你传的」
- **APK 走热更新**：`server.url` 指向线上站点，改网页 → 推 main → APK 打开就是新版，不用重新打包 🚀

---

## 🚀 想自己搭一个？

需要 Node.js 22.12 或更高——就两条命令：

```bash
npm install
npm run dev
```

打开终端里那个地址（默认 `http://localhost:5173`）就能玩：

- **开箱即用**：不配任何环境变量时是本地演示模式，数据留在浏览器里（上面的截图就是这么拍的）
- **默认共享库**：App 内置了一个公开的 Supabase 项目凭据，不自己搭后端也能体验双人登录与同步

Web 部署（Vercel）：构建预设选 **Vite**，Build Command `npm run build`，Output Directory `dist`，环境变量填下面那两项。

<details>
<summary><b>接自己的 Supabase 项目（可选）</b></summary>

```bash
cp .env.example .env.local
```

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-anon-key
```

只填公开前端密钥，**绝对不要**把 `service_role` 密钥放进前端。
然后去 Supabase 后台 **Authentication → URL Configuration** 配置：

- **Site URL**：`https://你的域名`
- **Redirect URLs**：`http://localhost:5173`、`https://你的域名`、`love.bibu.space://`（Android 深链接）

</details>

<details>
<summary><b>Android 打包（可选）</b></summary>

```bash
npm run android:sync          # 编译前端并同步到 Android 工程
npm run android:build         # 出 Debug APK
npm run android:release:check # 发布前门禁检查
npm run android:release:build # 签名 Release APK
```

产物在 `android/app/build/outputs/apk/`。

</details>

---

## ⚠️ 说句实话（重要）

1. **消息不是绝对送达**：网页完全关掉、手机深度休眠时，推送依赖系统通道和网络，别拿它当紧急联络方式
2. **每个账号只能属于一个空间，每个空间严格 2 人**，所有数据靠 RLS 隔离
3. **屏幕使用时间只在本机读**，具体用了哪些 App 不会上传云端
4. **不是端到端加密**：现在是基于数据库角色的权限隔离（RLS），别拿它存证件照 💥

---

## 📚 文档索引

- 本地架构、命令与分支开发指南 → [DEVELOPMENT.md](DEVELOPMENT.md)
- 表结构、RLS 权限与生命周期设计 → [DATABASE.md](DATABASE.md)
- 视觉语言、色彩 Token 与组件规范 → [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
- 测试套件与发版验收清单 → [VERIFICATION.md](VERIFICATION.md)
- 完成度、已知问题与发布阻塞项 → [CURRENT_STATUS.md](CURRENT_STATUS.md)

---

写它花的时间比谈恋爱还多（不是），但每次看到那颗心心被点亮，都觉得值 💗
有想抄作业的、想问细节的，评论区/Issue 见 👋

---

#情侣App #独立开发 #像素风 #程序员日常 #React #Supabase #Capacitor #自己动手丰衣足食 #恋爱日常 #SideProject
