# ASCII STUDIO

参考用户提供的视频制作的中文 ASCII 图片生成器，纯 HTML / CSS / JavaScript，无运行时外部依赖。

[在线使用](https://ascii-studio-juzi.elisabeth199636.chatgpt.site) · [GitHub 仓库](https://github.com/elisabeth199636-afk/ascii-studio)

这是与 [UI Motion Collection](https://github.com/elisabeth199636-afk/ui-motion-collection) 并列维护的独立项目。GitHub 仓库公开，可查看源码并在本地运行；在线网站目前仍为私有，需要相应账号的访问权限。

打开 `dist/index.html` 即可上传本地图片；初始页面显示居中的上传提示，不会自动载入参考图片。上传的图片仅存在当前浏览器内存中，不会发送到服务器。

支持：点击、拖放、粘贴图片；30–240 列疏密；独立字符大小；经典、精细、二进制、方块和自定义字符集；亮度、对比度、留白阈值；单色/原色、前景/背景色、明暗反转、透明背景；原图对照、固定 2 倍放大；PNG、SVG、TXT 导出。

四种预设：原色字符、黑白印记、蓝色信号、荧光终端。初始选中蓝色信号参数，上传图片后才显示字符画；重置参数恢复原色字符。GIF 作为静态图片处理。

风格预设下方可直接调整背景色、字符色和透明背景。支持原生取色器及 3 位 / 6 位 HEX 输入（可省略 `#`），有效颜色实时更新预览及 PNG / SVG 导出。修改字符色会自动切换为单色；修改背景色会关闭透明背景。Enter 确认、Escape 撤销本次颜色输入，切换预设会恢复该预设的配色。

文件上限 25 MB，解码后上限 8000 万像素，输出尺寸由图像比例决定，宽度最多 1800px、高度最多 2400px，不随疏密变化。TXT 不含颜色、背景和字号信息；用等宽字体打开。SVG 保留可编辑字符，其字体由打开端提供，可能有轻微渲染差异。

本地预览：`python3 -m http.server 4176 --bind 127.0.0.1 --directory dist`

文件结构：`dist/` 是可直接托管的完整网站，`dist/ascii-core.js` 是图像采样与字符映射逻辑，`tests/` 保存核心算法的回归测试，`.openai/hosting.json` 是现有 Sites 部署配置。GitHub 保存项目源码与历史，网站发布仍由 Sites 管理。

示例照片：Iván Díaz / Unsplash，https://unsplash.com/photos/a-single-white-flower-with-an-orange-center-JiqlxqEL3BA 。适用 Unsplash License。视频仅用作视觉参考，未复制或发布视频内容。

渐进增强：浏览器支持 `document.modelContext` 时注册 `read_ascii_settings` 与 `configure_ascii`，对所有输入先验证再修改界面；不支持时不影响编辑器。

自动用源图的明暗范围保留浅色图案层次；透明像素不参与明暗范围统计。放大模式保持 2 倍适应画布比例，参数变更保持当前位置并同步重绘。

回归验证：`node --test tests/ascii-core.test.cjs`。

数值输入：疏密、字符大小、亮度、对比度和留白阈值的数值均可直接点击编辑，与滑块双向同步；有效输入实时预览，Enter 确认、Escape 撤销。输入暂时为空时保留画面，确认时将超出范围的值限制到允许范围；对比度支持两位小数。
