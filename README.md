# 11356053 北商課程查詢選課系統

國立臺北商業大學課程查詢與選課網站（課程作業）。課程資料取自學校公開開課資訊，範圍為 113-1～115-1，目前開放資訊管理、應用外語、企業管理三系所有學制，其餘系所標示「準備中」。

## 功能

- 課程查詢：學期、系所群組、學制、系所、必選修、星期、關鍵字
- 課程詳情
- 假登入：任意學號與密碼即可登入
- 加選／退選：自動檢查衝堂、重複科目、人數額滿、學分上限（25）
- 我的課表：週課表與已選課程清單

## 執行（Python）

```bash
pip install -r requirements.txt
python app/app.py
```

開啟 http://127.0.0.1:5000

## 靜態版（GitHub Pages）

`docs/` 為不需後端的靜態版本，登入與選課資料存在瀏覽器。
Settings → Pages → Branch 選 `main`、資料夾選 `/docs`。

## 更新資料

```bash
python scripts/scrape_ntub.py
python scripts/build_data.py
python scripts/build_static.py
```

## 專案結構

```
app/app.py              Flask 後端與 API
app/templates/          頁面
app/static/             樣式、前端程式、courses.json
scripts/scrape_ntub.py  課程資料爬蟲
scripts/build_data.py   原始資料轉換
scripts/build_static.py 輸出靜態版
data/raw.json           原始課程資料
docs/                   GitHub Pages 靜態版
```

本網站為課程作業，非學校官方系統。
