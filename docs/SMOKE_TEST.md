# Shadow Reading Smoke Test

Use this checklist before each release to confirm the golden path still works.

## Environment
- Backend virtualenv activated, run `uvicorn app.main:app --reload`.
- WeChat DevTools connected to the `miniprogram` folder with the latest build.
- Browser/network throttling disabled unless testing slow-network fallback.

## Checklist
1. **Input Flow**
   - Launch小程序 → 输入页。
   - 粘贴 ≥3 句文本（含特殊字符）。
   - 验证字符/句子统计即时刷新；无报错。
2. **Split API & Loading Overlay**
   - 点击“开始练习”。
   - 观察 loading overlay 显示“正在准备第 1 句”，并在句子 + 关键词加载完后自动消失。
   - 若断网，确认 toast“网络异常，使用本地拆分”出现且仍可进入练习。
3. **Sentence Playback**
   - 点击“Listen”，音频应在 2 秒内播放。
   - 点击“重听本句”验证缓存生效（无明显等待）。
4. **语速调节**
   - 拖动滑块到不同档位，立即点击“Listen”，应播放对应语速；再拖回“标准”应无延迟。
5. **关键词弹窗**
   - 点击任一关键词，弹窗显示词与音标。
   - 点击弹窗内“播放”，音频应响起且弹窗保持打开。
6. **下一句 & 完成**
   - 连续点击“下一句”直至结束，观察进度条递增。
   - 结果页展示句子总数、耗时、文本片段；“再练一次”“返回首页”按钮可用。
7. **Logs & Console**
   - 在 DevTools Console 中确认 `[API]` 日志包含成功/失败记录，出现异常时能够定位 request id。

记录任何异常（含截图、日志）在 issue tracker 中，以便回归修复。
