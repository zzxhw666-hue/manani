# 璀璨宝石：个人主视角 Demo

入口：`/splendor-3d-demo.html`。右上角可切换四个体验座位，也可用 `?seat=zhou`、`?seat=kai`、`?seat=an` 打开对应视角。

## 本轮范围

- 前景只有当前座位的珠宝行：声望、六色筹码、五色永久折扣、自己的预留牌。
- 其余三位按相对座次排列在顶部；对手只展示预留数量。
- 换座位不改变行动玩家。所有数据都是演示用固定数据，不是联网身份认证或权限控制。
- 卡牌为薄纸厚度的圆角实体；牌堆逐张建模。筹码有独立倒角、边缘和层间隙。
- 宝石采用独立切面法线的冠部、腰部、亭部网格，结合既有宝石图片贴图与实时物理材质反射；不是 CSS 圆形或整幅概念图覆盖，也不是光线追踪级真实宝石光学模拟。
- 木桌、桌垫、托盘隔断、包边、台灯和个人桌面处于同一个 WebGL 场景。
- 点击银行筹码，再点“体验拿取”可观看移向自己桌面的动画；不修改真实对局。

## 素材与工具

Three.js 本地模块驱动实体几何、实时灯光、阴影和环境反射，许可证见 `public/vendor/THREE-LICENSE.txt`。

本轮用内置 imagegen（不是 CLI/API）生成 `public/assets/table-club/walnut-albedo-v2.png`，用于木桌和木框表面。原有宝石与卡面美术继续复用。木纹生成提示词全文：

> Use case: stylized-concept. Asset type: tileable photorealistic albedo texture for a real-time 3D tabletop mesh. Produce ONLY the flat wood surface texture, edge-to-edge square. Dark antique American walnut, rich deep warm chocolate brown with subtle amber grain, slightly worn oiled finish, irregular natural flowing grain and small subtle pores, no dramatic knots. Orthographic top-down scan, evenly diffuse illumination, NO baked bright reflections, NO shadows, NO perspective, NO objects, NO tabletop borders, NO typography. Fine believable detail, premium old board-game club furniture. Seamless tileable edges. 2048 x 2048.

## 验收

`npm test` 包含四座位主视角、自己的资源切换、对手预留信息、回合归属、数据隔离和错误座位的行为测试。

Chrome 开启远程调试后，使用 Node 22+ 运行浏览器验收：

```sh
node tools/check-splendor-demo.mjs http://localhost:4203 http://localhost:9224 /tmp/splendor-preview.png
```

验证四个座位、三档桌面分辨率、真实 WebGL 绘制、鼠标射线选择、拿取动画、选择重置、视口边界和浏览器错误。截图是实际浏览器渲染，不是生成的效果图。

本轮未替换正式游戏界面，未增加多人网络协议。人物肖像、贵族肖像与完整室内布景尚未达到参考图精度，后续应以实际画面继续验收，而不是用主观百分比代表完成度。
