# 港中深课程资料下载页

这是部署到 GitHub Pages 的前端站点。仓库根目录继续保存课程资料，站点构建时会扫描根目录生成资料清单。

常用命令：

```bash
npm run dev
npm run build
npm run generate:manifest
npm run package:archives
```

单文件下载会按 `蓝奏云 -> GitHub raw -> jsDelivr` 自动兜底。只有
`site/public/lanzou-manifest.json` 中存在对应文件链接时才会优先使用蓝奏云；
如果蓝奏云未同步、链接缺失、请求超时或请求失败，下载按钮会自动尝试
GitHub raw，再尝试 jsDelivr。

## 蓝奏云同步

GitHub Actions 会在构建前运行 `npm run sync:lanzou`。未配置密钥时脚本会
自动跳过，不影响 GitHub Pages 部署。

需要在仓库 Secrets 中配置：

- `LANZOU_APP_TOKEN`：蓝奏云优享版登录后的 `appToken`。
- `LANZOU_UUID`：蓝奏云前端请求中的 `uuid`/`devCode`。
- `LANZOU_COOKIE`：可选，完整 Cookie；遇到接口鉴权问题时填写。
- `LANZOU_ACCOUNT`：可选，蓝奏云账号标识，用于生成七牛上传 key。
- `LANZOU_ROOT_FOLDER_ID`：可选，已创建的 `CUHKSZ_sourse` 文件夹 ID；
  不填时脚本会在根目录查找或创建同名文件夹。

同步脚本只会把成功上传并拿到链接的文件写入 `lanzou-manifest.json`，因此
单个文件同步失败时，网页仍会正确回退到 GitHub raw/jsDelivr。

课程目录下载使用固定 Release `course-archives` 中的课程压缩包。
