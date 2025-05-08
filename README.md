# Time2Cinema

這個專案是一個電影場次查詢平台，採用前後端分離架構：

## 專案結構

- frontend/  (Next.js + shadcn/ui，負責 UI 與互動)
- backend/   (Node.js/Express，未來負責 API 與資料整合)

## 前端技術說明
- Next.js (React-based，支援 SSR 與 App Router)
- shadcn/ui（極簡現代的 UI 元件庫，設計風格類似 Figma/Apple）
- Tailwind CSS（用於 shadcn/ui 樣式）

## 開發啟動
```sh
cd frontend
npm install
npm run dev
```

## 功能規劃
1. 首頁顯示每週票房榜（第一階段優先完成）
2. 支援電影即時搜尋（incremental search）
3. 依據時間、電影、電影院查詢場次

---

如需協助或有新需求，請隨時提出！
