import { useState } from "react";
import * as XLSX from "xlsx";
import { useSentences } from "../hooks/useSentences.js";
import { createSentence, makeId, ensureSrs } from "../storage/sentencesStore.js";
import { BOOKS } from "../data/books.js";

export default function SentenceBank() {
  const { sentences, setSentences } = useSentences();
  const [addMode, setAddMode] = useState("bulk");

  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null);

  const [excelFile, setExcelFile] = useState(null);
  const [excelResult, setExcelResult] = useState(null);

  const [backupFile, setBackupFile] = useState(null);
  const [backupResult, setBackupResult] = useState(null);

  const [selectedBook, setSelectedBook] = useState(null);
  const [bookImportResult, setBookImportResult] = useState(null);

  function handleDelete(id) {
    const next = sentences.filter((s) => s.id !== id);
    setSentences(next);
  }

  function handleBookImport() {
    if (!selectedBook) return;

    const existingTexts = new Set(sentences.map((s) => s.text));
    const toAdd = [];
    let skipped = 0;

    for (const { text, meaning } of selectedBook.sentences) {
      if (existingTexts.has(text)) {
        skipped += 1;
        continue;
      }
      existingTexts.add(text);
      toAdd.push(
        createSentence({
          text,
          meaning,
          tags: [],
        })
      );
    }

    if (toAdd.length > 0) {
      const next = [...toAdd, ...sentences];
      setSentences(next);
    }

    setBookImportResult({ added: toAdd.length, skipped });
  }

  function handleBulkAdd() {
    const rawLines = bulkText.split(/\r?\n/);
    const lines = rawLines.map((l) => l.trim()).filter(Boolean);

    const failed = [];
    let added = 0;
    let skipped = 0;

    const existingTexts = new Set(sentences.map((s) => s.text));
    const toAdd = [];

    const hasTab = lines.some((l) => l.includes("\t"));

    if (hasTab) {
      lines.forEach((line, idx) => {
        const lineNumber = idx + 1;

        const tabIndex = line.indexOf("\t");
        if (tabIndex === -1) {
          failed.push({ lineNumber, raw: line, reason: "缺少 Tab 分隔" });
          return;
        }

        const left = line.slice(0, tabIndex).trim();
        const right = line.slice(tabIndex + 1).trim();

        if (!left) {
          failed.push({ lineNumber, raw: line, reason: "英文为空" });
          return;
        }
        if (!right) {
          failed.push({ lineNumber, raw: line, reason: "中文为空" });
          return;
        }

        if (existingTexts.has(left)) {
          skipped += 1;
          return;
        }

        existingTexts.add(left);
        toAdd.push(
          createSentence({
            text: left,
            meaning: right,
            tags: [],
          })
        );
        added += 1;
      });
    } else {
      if (lines.length % 2 !== 0) {
        failed.push({
          lineNumber: lines.length,
          raw: lines[lines.length - 1] || "", reason: "缺少对应中文行" });
      }

      for (let i = 0; i + 1 < lines.length; i += 2) {
        const lineNumber = i + 1;
        const left = lines[i].trim();
        const right = lines[i + 1].trim();

        if (!left) {
          failed.push({ lineNumber, raw: lines[i], reason: "英文为空" });
          continue;
        }
        if (!right) {
          failed.push({ lineNumber: i + 2, raw: lines[i + 1], reason: "中文为空" });
          continue;
        }

        if (existingTexts.has(left)) {
          skipped += 1;
          continue;
        }

        existingTexts.add(left);
        toAdd.push(
          createSentence({
            text: left,
            meaning: right,
            tags: [],
          })
        );
        added += 1;
      }
    }

    if (toAdd.length > 0) {
      const next = [...toAdd, ...sentences];
      setSentences(next);
    }

    setBulkResult({
      added,
      skipped,
      failedCount: failed.length,
      failedPreview: failed.slice(0, 10),
    });
  }

  function parseExcelRows(rows) {
    const existingTexts = new Set(sentences.map((s) => s.text));
    const failed = [];
    const toAdd = [];
    let added = 0;
    let skipped = 0;

    if (rows.length === 0) {
      return { added, skipped, failed };
    }

    const firstRow = rows[0] || [];
    const a1 = String(firstRow[0] || "");
    const b1 = String(firstRow[1] || "");
    const hasHeader = a1.includes("英文") || b1.includes("中文");

    const startIndex = hasHeader ? 1 : 0;

    for (let i = startIndex; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const lineNumber = i + 1;

      const rawText = row[0] != null ? String(row[0]) : "";
      const rawMeaning = row[1] != null ? String(row[1]) : "";

      const textVal = rawText.trim();
      const meaningVal = rawMeaning.trim();

      if (!textVal) {
        failed.push({ lineNumber, text: rawText, meaning: rawMeaning, reason: "英文为空" });
        continue;
      }
      if (!meaningVal) {
        failed.push({ lineNumber, text: rawText, meaning: rawMeaning, reason: "中文为空" });
        continue;
      }

      if (existingTexts.has(textVal)) {
        skipped += 1;
        continue;
      }

      existingTexts.add(textVal);
      toAdd.push(
        createSentence({
          text: textVal,
          meaning: meaningVal,
          tags: [],
        })
      );
      added += 1;
    }

    return { added, skipped, failed, toAdd };
  }

  function handleExcelImport() {
    if (!excelFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target.result;
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

      const { added, skipped, failed, toAdd } = parseExcelRows(rows);

      if (toAdd && toAdd.length > 0) {
        const next = [...toAdd, ...sentences];
        setSentences(next);
      }

      setExcelResult({
        added,
        skipped,
        failedCount: failed.length,
        failedPreview: failed.slice(0, 10),
      });
    };

    reader.readAsArrayBuffer(excelFile);
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleExport() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const filename = `sentences-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
      now.getDate()
    )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;

    const payload = {
      version: 1,
      exportedAt: Date.now(),
      data: sentences,
    };

    downloadJson(filename, payload);
  }

  function normalizeImportedItem(item) {
    if (!item || typeof item !== "object") return { ok: false, reason: "无效记录" };

    const rawText = item.text != null ? String(item.text) : "";
    const rawMeaning = item.meaning != null ? String(item.meaning) : "";
    const textVal = rawText.trim();
    const meaningVal = rawMeaning.trim();

    if (!textVal) return { ok: false, reason: "英文为空", text: rawText };
    if (!meaningVal) return { ok: false, reason: "中文为空", text: rawText };

    const tagsVal = [];

    const now = Date.now();
    const normalized = ensureSrs({
      id: item.id ? String(item.id) : makeId(),
      text: textVal,
      meaning: meaningVal,
      tags: tagsVal,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : now,
      srs: item.srs,
    });

    return { ok: true, value: normalized };
  }

  function handleImport() {
    if (!backupFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      let payload;
      try {
        payload = JSON.parse(e.target.result);
      } catch {
        setBackupResult({
          added: 0,
          updated: 0,
          failedCount: 1,
          failedPreview: [{ index: 1, text: "", reason: "JSON 解析失败" }],
        });
        return;
      }

      if (!payload || payload.version !== 1 || !Array.isArray(payload.data)) {
        setBackupResult({
          added: 0,
          updated: 0,
          failedCount: 1,
          failedPreview: [{ index: 1, text: "", reason: "格式不正确或 version!=1" }],
        });
        return;
      }

      const existingById = new Map(sentences.map((s) => [s.id, s]));
      let added = 0;
      let updated = 0;
      const failed = [];

      for (let i = 0; i < payload.data.length; i += 1) {
        const item = payload.data[i];
        const res = normalizeImportedItem(item);
        if (!res.ok) {
          failed.push({ index: i + 1, text: res.text || "", reason: res.reason });
          continue;
        }

        const normalized = res.value;
        if (existingById.has(normalized.id)) {
          existingById.set(normalized.id, normalized);
          updated += 1;
        } else {
          existingById.set(normalized.id, normalized);
          added += 1;
        }
      }

      const next = Array.from(existingById.values());
      setSentences(next);

      setBackupResult({
        added,
        updated,
        failedCount: failed.length,
        failedPreview: failed.slice(0, 10),
      });
    };

    reader.readAsText(backupFile, "utf-8");
  }

  return (
    <div>
      <div className='card'>
        <h2>📚 从书籍导入</h2>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>选择一本书，快速导入精选句子</p>

        <div className="chip-grid" style={{ marginBottom: 16 }}>
          {BOOKS.map((book) => (
            <button
              key={book.id}
              type="button"
              className={`chip ${selectedBook?.id === book.id ? "active" : ""}`}
              onClick={() => {
                setSelectedBook(book);
                setBookImportResult(null);
              }}
            >
              {book.title}
            </button>
          ))}
        </div>

        {selectedBook && (
          <div style={{ padding: 16, background: "rgba(14,165,233,0.06)", border: "1px solid var(--border-cyan)", borderRadius: 10, marginBottom: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>书名</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{selectedBook.title}</div>
            </div>
            <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>分类</div>
                <div style={{ fontSize: 14, color: "var(--cyan)" }}>{selectedBook.category}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>句子数</div>
                <div style={{ fontSize: 14, color: "var(--cyan)" }}>{selectedBook.sentences.length} 条</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>描述</div>
              <div style={{ fontSize: 13, color: "var(--ink)" }}>{selectedBook.description}</div>
            </div>
          </div>
        )}

        <button
          className='button'
          type='button'
          onClick={handleBookImport}
          disabled={!selectedBook}
          style={{ width: "100%" }}
        >
          {selectedBook ? `导入 ${selectedBook.sentences.length} 条句子` : "请先选择一本书"}
          <span className='paw' />
        </button>

        {bookImportResult && (
          <div style={{ marginTop: 12 }}>
            {bookImportResult.added > 0 && (
              <div style={{ color: "#22c55e" }}>✅ 成功导入 {bookImportResult.added} 条</div>
            )}
            {bookImportResult.skipped > 0 && (
              <div style={{ color: "#f97316" }}>⏭️ 跳过重复 {bookImportResult.skipped} 条</div>
            )}
            {bookImportResult.added === 0 && bookImportResult.skipped > 0 && (
              <div style={{ color: "#f97316" }}>已全部导入过，无新句子</div>
            )}
          </div>
        )}
      </div>

      <div className='card'>
        <h2>✏️ 自行添加</h2>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>选择添加方式</p>

        <div className="segmented" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={addMode === "bulk" ? "active" : ""}
            onClick={() => setAddMode("bulk")}
          >
            文本粘贴
          </button>
          <button
            type="button"
            className={addMode === "excel" ? "active" : ""}
            onClick={() => setAddMode("excel")}
          >
            Excel 导入
          </button>
        </div>

        {addMode === "bulk" && (
          <>
            <p style={{ color: "var(--muted)", marginTop: 12, marginBottom: 8 }}>格式一：英文句子{"<Tab>"}中文释义（同一行）</p>
            <p style={{ color: "var(--muted)", marginBottom: 12 }}>格式二：英文一行 + 中文下一行</p>
            <textarea
              className='input' rows={6}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="There was a traffic accident in this street, but no one was harmed.\n这街上发生了交通事故，但没有人受伤。\n\nWe were friends and colleagues for more than 20 years.\n20多年来我们既是朋友又是同事。"
            />
            <button className='button' type='button' onClick={handleBulkAdd} style={{ width: "100%", marginTop: 12 }}>
              添加
              <span className='paw' />
            </button>

            {bulkResult && (
              <div style={{ marginTop: 12 }}>
                <div>成功添加 {bulkResult.added} 条</div>
                <div>跳过重复 {bulkResult.skipped} 条</div>
                <div>失败 {bulkResult.failedCount} 行</div>

                {bulkResult.failedCount > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <strong>失败明细（最多前 10 行）：</strong>
                    {bulkResult.failedPreview.map((f, i) => (
                      <div key={i} style={{ color: "#dc2626" }}>
                        行号 {f.lineNumber}：{f.raw}（{f.reason}）
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {addMode === "excel" && (
          <>
            <input
              type="file" accept=".xlsx" onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
            />
            <div style={{ marginTop: 12 }}>
              <button className='button' type='button' onClick={handleExcelImport} style={{ width: "100%" }}>
                导入
                <span className='paw' />
              </button>
            </div>

            {excelResult && (
              <div style={{ marginTop: 12 }}>
                <div>成功添加 {excelResult.added} 条</div>
                <div>跳过重复 {excelResult.skipped} 条</div>
                <div>失败 {excelResult.failedCount} 行</div>

                {excelResult.failedCount > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <strong>失败明细（最多前 10 行）：</strong>
                    {excelResult.failedPreview.map((f, i) => (
                      <div key={i} style={{ color: "#dc2626" }}>
                        行号 {f.lineNumber}：{f.text} / {f.meaning}（{f.reason}）
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className='card'>
        <h2 style={{ marginTop: 0 }}>💾 备份与恢复</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <button className='button' type='button' onClick={handleExport} style={{ padding: "10px 12px" }}>
            📥 导出备份
          </button>
          <label className="button secondary" style={{ cursor: "pointer" }}>
            📂 选择文件
            <input
              type="file" accept=".json" onChange={(e) => setBackupFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
          </label>
          <button className='button' type='button' onClick={handleImport} disabled={!backupFile} style={{ padding: "10px 12px" }}>
            📤 导入
          </button>
        </div>

        {backupResult && (
          <div style={{ padding: 16, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>新增</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>{backupResult.added}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>覆盖</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f97316" }}>{backupResult.updated}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>失败</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{backupResult.failedCount}</div>
              </div>
            </div>

            {backupResult.failedCount > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(34,197,94,0.2)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>失败明细（最多前 10 条）</div>
                {backupResult.failedPreview.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#ef4444", marginBottom: 4 }}>
                    • 序号 {f.index}：{f.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className='card'>
        <h2 style={{ marginTop: 0 }}>📚 句子列表（共 {sentences.length} 条）</h2>
        {sentences.length === 0 && (
          <p style={{ color: "var(--muted)", textAlign: "center", padding: "24px 0", margin: 0 }}>
            暂无句子，请添加开始学习
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {sentences.map((s, idx) => (
            <div
              key={s.id}
              style={{
                padding: 16,
                background: idx % 2 === 0 ? "transparent" : "rgba(59,130,246,0.04)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
                transition: "all 0.3s ease"}}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(59,130,246,0.08)";
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "rgba(59,130,246,0.04)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>英文</div>
                <div style={{ fontSize: 14, color: "var(--ink)", marginBottom: 8, fontFamily: "monospace", wordBreak: "break-word" }}>
                  {s.text}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>中文</div>
                <div style={{ fontSize: 14, color: "var(--cyan)" }}>
                  {s.meaning}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                {s.srs?.mastered && (
                  <span className='tag success'>✓ 已掌握</span>
                )}
                <button
                  className='button delete' type="button" onClick={() => handleDelete(s.id)}
                  style={{ padding: "6px 12px", fontSize: 12, width: 80 }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}