# 編輯手感效能量測

2026-08-20 在 Chrome 實測編輯器主迴圈的量測紀錄。方法是 `PerformanceObserver` 監看 long task（>50ms，一幀預算是 16.7ms），並把 long task 的起始時間對回 pointer 事件，藉此判斷成本落在哪個階段。

**務必用 production build 量測。** dev build 的數字會誤導：同一個節點拖曳在 `pnpm dev` 下每個 `pointermove` 都是 60–70ms，在 `pnpm build && pnpm preview` 下則完全沒有 long task。開發時覺得卡不代表使用者會卡。

## 結果（production build）

測試專案：新建專案，先 122 字符、再加到 6,771 字符（接近真實 CJK 規模），單一 4 節點矩形。

| 動作                                 | 成本            | 判讀               |
| ------------------------------------ | --------------- | ------------------ |
| 拖曳節點（pointerdown、pointermove） | 無 long task    | 拖曳過程順暢       |
| **放開滑鼠（pointerup）**            | **62–72ms**     | 唯一穩定出現的卡頓 |
| **點擊節點（完全不移動）**           | **72ms**        | 與位置提交無關     |
| **點擊空白處（取消選取）**           | **117ms**       | 同上               |
| Undo ×5                              | 無 long task    | 順暢               |
| Cmd+S                                | 無 long task    | 順暢               |
| 編輯後閒置 4 秒                      | 無 long task    | 沒有延遲的重運算   |
| 平移／縮放畫布                       | 無 long task    | 重繪不是瓶頸       |
| Hand 工具點擊                        | 無 long task    | 對照組             |
| 回到字符總覽（6,771 字）             | 196 + 68 + 68ms | 換頁時的可見停頓   |

## 唯一的問題：選取提交約 70ms

每次用 Pointer 工具點擊畫布，pointerup 都會產生約 70–120ms 的 long task。因為任何拖曳都以一次選取開始，這個成本在編輯迴圈裡每次都會付。

**不隨字數成長**：122 字符與 6,771 字符量到的都是 66ms。CJK 規模的專案不會惡化，這點很重要。

已排除的原因（都實測過）：

- **不是 canvas 重繪**：平移縮放會重繪，卻沒有 long task。
- **不是 store action**：`updateNodePosition` 與 `updateNodePositions` 同步耗時都是 0–1ms。
- **不是多次 store 寫入**：以 phase-tagged subscriber 量測，pointerup 只有 1 次寫入。
- **不是 undo 快照**：`partializeTemporalState` 會走訪全部字符，本來是主要嫌疑，但成本不隨字數成長，假設不成立。
- **不是事件派發本身**：Hand 工具點擊同一個位置沒有成本。
- **不是 hit test**：long task 的起點永遠對齊 pointerup，pointerdown 沒有 long task。

剩下的範圍是 `PointerTool.handleDragEnd` / `handleClick` 之後、由選取變更引發的 render。程式化更新節點位置（不改變選取）不會產生 long task，這與「成本來自選取變更的下游 render」一致，但尚未用 profiler 確認到函式層級。

**下一步**：用 Chrome DevTools Performance 錄一次 pointerup，看火焰圖落在哪個 component 的 render。在確認之前不要改動——這輪已經有三個看似合理的假設（undo 快照、多次 store 寫入、canvas 重繪）被實測推翻。
