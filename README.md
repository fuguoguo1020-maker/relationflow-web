# RelationFlow 网页版

给自己使用的人际关系记录工具。用浏览器管理联系人、互动记录和跟进提醒。

## 数据与隐私

- 联系人和互动记录仅保存在当前浏览器的 IndexedDB 中，不会上传到服务器。
- 更换设备或清理浏览器数据前，请在“设置与数据”中导出 JSON 备份。
- 备份文件为未加密 JSON，请保存在安全的位置。
- GitHub Pages 网站可以被互联网访问。不要把私人记录、备份、密码或令牌提交到代码仓库。

## 本地开发

需要 Node.js 24 或兼容的较新版本。

```sh
npm ci
npm run dev
```

生产构建：

```sh
npm run build
npm run preview
```

## 发布到 GitHub Pages

仓库包含 `.github/workflows/deploy.yml`。将项目推送到 GitHub 的 `main` 分支后，GitHub Actions 会构建并发布 `dist/`。也可以在 Actions 页面手动运行 `Deploy RelationFlow to GitHub Pages`。

首次发布前，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。部署完成后，项目站点通常位于 `https://<账号>.github.io/<仓库名>/`。

此网站没有账号登录或云端同步。若将来需要多设备同步，必须另行部署安全的 API 和数据库服务。
