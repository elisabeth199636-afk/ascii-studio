# ASCII STUDIO

参考用户提供的视频制作的中文 ASCII 图片生成器，纯 HTML / CSS / JavaScript，无运行时外部依赖。

打开 `dist/index.html` 即可上传本地图片（HTTP 预览会自动载入示例）。上传的图片仅存在当前浏览器内存中，不会发送到服务器。

支持：点击、拖放、粘贴图片；30–240 列疏密；独立字符大小；经典、精细、二进制、方块和自定义字符集；亮度、对比度、留白阈值；单色/原色、前景/背景色、明暗反转、透明背景；原图对照、1:1 放大；PNG、SVG、TXT 导出。

四种预设：原色字符、黑白印记、蓝色信号、荧光终端。初始展示蓝色信号；重置参数恢复原色字符。GIF 作为静态图片处理。

文件上限 25 MB，解码后上限 8000 万像素，输出长边最多 4096px。TXT 不含颜色、背景和字号信息；用等宽字体打开。SVG 保留可编辑字符，其字体由打开端提供，可能有轻微渲染差异。

本地预览：`python3 -m http.server 4176 --bind 127.0.0.1 --directory dist`

示例照片：Iván Díaz / Unsplash，https://unsplash.com/photos/a-single-white-flower-with-an-orange-center-JiqlxqEL3BA 。适用 Unsplash License。视频仅用作视觉参考，未复制或发布视频内容。

渐进增强：浏览器支持 `document.modelContext` 时注册 `read_ascii_settings` 与 `configure_ascii`，对所有输入先验证再修改界面；不支持时不影响编辑器。
