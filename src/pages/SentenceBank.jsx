import { useState } from "react";
import * as XLSX from "xlsx";
import { useSentences } from "../hooks/useSentences.js";
import { createSentence, makeId, ensureSrs } from "../storage/sentencesStore.js";
import { recordDailyNewCount } from "../storage/historyStore.js";

export default function SentenceBank() {
  const { sentences, setSentences } = useSentences();
  const [text, setText] = useState("");
  const [meaning, setMeaning] = useState("");

  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null);

  const [excelFile, setExcelFile] = useState(null);
  const [excelResult, setExcelResult] = useState(null);

  const [backupFile, setBackupFile] = useState(null);
  const [backupResult, setBackupResult] = useState(null);

  function handleAdd(e) {
    e.preventDefault();
    const cleanText = text.trim();
    const cleanMeaning = meaning.trim();
    if (!cleanText || !cleanMeaning) return;

    const sentence = createSentence({
      text: cleanText,
      meaning: cleanMeaning,
      tags: [],
    });

    const next = [sentence, ...sentences];
    setSentences(next);
    recordDailyNewCount(1);

    setText("");
    setMeaning("");
  }

  function handleDelete(id) {
    const next = sentences.filter((s) => s.id !== id);
    setSentences(next);
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
          raw: lines[lines.length - 1] || "",
          reason: "缺少对应中文行",
        });
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
      recordDailyNewCount(added);
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
        recordDailyNewCount(added);
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
      type: "application/json",
    });
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
      <div className="card">
        <h2>添加句子</h2>
        <form onSubmit={handleAdd}>
          <label>英文句子</label>
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="请输入英文句子"
          />

          <label>中文释义</label>
          <input
            className="input"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder="请输入中文释义"
          />

          <button className="button" type="submit">
            添加
            <span className="paw" />
          </button>
        </form>
      </div>

      <div className="card">
        <h2>批量添加（Tab 分隔 或 两行一组）</h2>
        <p>格式一：英文句子{"<Tab>"}中文释义（同一行）</p>
        <p>格式二：英文一行 + 中文下一行</p>
        <textarea
          className="input"
          rows={6}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder="There was a traffic accident in this street, but no one was harmed.\n这街上发生了交通事故，但没有人受伤。\n\nWe were friends and colleagues for more than 20 years.\n20多年来我们既是朋友又是同事。"
        />
        <button className="button" type="button" onClick={handleBulkAdd}>
          批量添加
          <span className="paw" />
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
                  <div key={i} style={{ color: "#a00" }}>
                    行号 {f.lineNumber}：{f.raw}（{f.reason}）
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>从 Excel 导入（.xlsx）</h2>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
        />
        <div style={{ marginTop: 8 }}>
          <button className="button" type="button" onClick={handleExcelImport}>
            开始导入
            <span className="paw" />
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
                  <div key={i} style={{ color: "#a00" }}>
                    行号 {f.lineNumber}：{f.text} / {f.meaning}（{f.reason}）
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>备份与恢复</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button" type="button" onClick={handleExport}>
            导出备份
            <span className="paw" />
          </button>
          <input
            type="file"
            accept=".json"
            onChange={(e) => setBackupFile(e.target.files?.[0] || null)}
          />
          <button className="button" type="button" onClick={handleImport}>
            导入
            <span className="paw" />
          </button>
        </div>

        {backupResult && (
          <div style={{ marginTop: 12 }}>
            <div>新增 {backupResult.added} 条</div>
            <div>覆盖 {backupResult.updated} 条</div>
            <div>失败 {backupResult.failedCount} 条</div>

            {backupResult.failedCount > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong>失败明细（最多前 10 条）：</strong>
                {backupResult.failedPreview.map((f, i) => (
                  <div key={i} style={{ color: "#a00" }}>
                    序号 {f.index}：{f.text || ""}（{f.reason}）
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>句子列表</h2>
        {sentences.length === 0 && <p>暂无句子</p>}
        {sentences.map((s) => (
          <div key={s.id} className="card">
            <div>
              <strong>英文：</strong>
              {s.text}
            </div>
            <div>
              <strong>中文：</strong>
              {s.meaning}
            </div>
            {s.srs?.mastered && (
              <div style={{ marginTop: 6, color: "#2c7a3f" }}>
                已掌握（暂停复习）
              </div>
            )}
            <button className="button delete" onClick={() => handleDelete(s.id)}>
              删除
              <span className="paw" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
