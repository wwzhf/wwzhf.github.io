# 写文章

这里是「写文章」页面，介绍本站的写作与发布流程（内容在 `src/content/spec/writing.md`，可自由修改）。

## ✍️ 新建一篇文章

在博客目录（`D:\zcode\data\web\blog`）执行：

```bash
pnpm new-post 文章标题
```

会自动在 `src/content/posts/` 下生成带格式的 Markdown 文件。

## 📝 文章头部常用字段

```yaml
---
title: 文章标题
published: 2026-08-30
description: 简介摘要
image: /cover.jpg
tags: [标签1, 标签2]
category: 分类名
draft: false
---
```

## 🚀 发布上线

```bash
git add .
git commit -m "新文章"
git push
```

推送后 GitHub Actions 会自动构建并在约 2~3 分钟内发布上线。
