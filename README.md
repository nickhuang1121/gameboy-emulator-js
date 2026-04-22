# 🕹️ Game Boy Emulator (JavaScript)

🔗 Demo: https://nickhuang1121.github.io/gameboy-emulator-js/

---

## 📌 專案介紹（中文）

這是一個使用 JavaScript 開發的瀏覽器版 Game Boy 模擬器，從零開始實作，涵蓋 CPU 指令執行、記憶體管理與卡匣機制（MBC5）。本專案著重於還原 Game Boy 的核心運作邏輯，並透過模組化架構拆分 CPU、記憶體與渲染流程，以提升可維護性與擴展性。

---

## ✨ 特色功能

- 🧠 CPU 指令解碼與執行（Opcode Engine）
- 💾 記憶體管理與記憶體映射（Memory Mapping）
- 🎮 MBC5 卡匣支援（Bank Switching）
- 🧩 模組化架構（CPU / Memory / Renderer 分離）
- 🌐 可直接於瀏覽器運行（GitHub Pages）

---

## 🧪 測試 ROM（重要）

本專案提供作者自行製作的 **MBC5 測試 ROM**，可用於驗證模擬器功能：

- 驗證 MBC5 bank switching 是否正常
- 測試 CPU 指令執行流程
- 作為 emulator 開發學習範例

👉 可直接載入此 ROM 進行測試，無需額外下載遊戲檔案。

---

## 🏗️ 架構說明

專案採用模組化設計，主要分為：

- **CPU Module**：負責指令解析與執行
- **Memory Module**：處理記憶體讀寫與映射
- **Cartridge (MBC5)**：控制 ROM / RAM bank 切換
- **Renderer**：負責畫面輸出

---

## 🚀 未來規劃

- 提升指令週期精準度（Cycle Accuracy）
- 完整 PPU / 顯示模組
- 聲音模擬（APU）
- 支援更多測試 ROM

---

## 📌 Project Overview (English)

This is a browser-based Game Boy emulator built from scratch using JavaScript. It implements core CPU instruction execution, memory management, and cartridge handling (MBC5). The project uses a modular architecture to separate CPU, memory, and rendering logic for better scalability and maintainability.

---

## ✨ Features

- Opcode-based CPU execution
- Memory management & mapping
- MBC5 cartridge support (bank switching)
- Modular architecture (CPU / Memory / Renderer)
- Runs directly in the browser

---

## 🧪 Test ROM

This project includes a **custom-built MBC5 test ROM created by the author**, which can be used to:

- Verify MBC5 bank switching behavior  
- Test CPU instruction execution  
- Serve as a learning resource for emulator development  

👉 The ROM can be loaded directly without external files.

---

## 🏗️ Architecture

- **CPU Module** – instruction decoding & execution  
- **Memory Module** – memory access & mapping  
- **Cartridge (MBC5)** – ROM/RAM bank switching  
- **Renderer** – display output  

---

## 🚀 Future Work

- Cycle-accurate execution  
- Full PPU implementation  
- Audio (APU) support  
- More test ROM compatibility  

---

## 👨‍💻 Author

Nick Huang
