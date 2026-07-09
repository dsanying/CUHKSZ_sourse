# 港中深课程资料下载页

这是部署到 GitHub Pages 的前端站点。GitHub 只保存站点源码、索引清单和说明；课程资料文件存储在普通蓝奏云。

常用命令：

```bash
npm run dev
npm run build
npm run generate:manifest
npm run sync:lanzou:classic
```

下载页只读取 `site/public/lanzou-manifest.json` 中的蓝奏云普通版链接。
不再生成 GitHub raw、jsDelivr 或 Release 压缩包下载地址。

## 普通蓝奏云同步

本地 Firefox 登录 `up.woozooo.com` 后，可以运行：

```bash
npm run sync:lanzou:classic
```

脚本会读取 Firefox 登录态，查找或创建 `CUHKSZ_sourse` 根文件夹，按课程和资料分类同步文件，并写入 `site/public/lanzou-manifest.json`。

可用环境变量：

- `LANZOU_CLASSIC_COOKIE`：手动传入普通蓝奏云 Cookie。
- `LANZOU_CLASSIC_ROOT_FOLDER_ID`：复用已存在的根文件夹 ID。
- `LANZOU_CLASSIC_ROOT_FOLDER_NAME`：根文件夹名，默认 `CUHKSZ_sourse`。
- `LANZOU_UPLOAD_LIMIT`：只同步前 N 个文件，便于测试。
- `LANZOU_CLASSIC_SPLIT_SIZE`：超限文件分片大小，默认约 `95M`。

普通蓝奏云免费账号的后台直链接口返回“未开放”，因此站点保存稳定分享链接；
若后续接入可用的点击时直链解析器，可写入 `downloadUrl` 字段覆盖分享链接。
