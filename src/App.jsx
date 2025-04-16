import React, { useState, useEffect } from 'react';
import Chart from 'chart.js/auto';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

function App() {
  const [user, setUser] = useState({ name: '', age: '', gender: '', history: '' });
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value });
  };

  const handleFiles = async (e) => {
    const fileList = Array.from(e.target.files).slice(0, 4);
    setFiles(fileList);
    setResults([]);
    setLoading(true);

    const newResults = [];

    for (const file of fileList) {
      const text = await file.text();
      const row = text.trim().split(/\r?\n/)[0];
      const values = row.split(',').map(x => Number(x.trim())).filter(x => !isNaN(x));
      if (values.length !== 20) {
        newResults.push({ filename: file.name, values: [], risk: 0, reply: '❗ 上傳的資料格式有誤，請提供 20 筆 ECG 數值。' });
        continue;
      }

      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const risk = avg > 0.35 ? 0.78 : 0.12;

      const prompt = `
這是一位使用者的 ECG 心電圖特徵（共 20 項純數值），僅供 AI 醫療輔助用途：
使用者基本資料如下：
- 姓名：${user.name || '匿名'}
- 年齡：${user.age}
- 性別：${user.gender}
- 病史描述：${user.history || '無'}

請模擬心臟科醫師的判斷方式，根據以下 ECG 數據趨勢，
推估該使用者在 1～3 年內是否可能罹患心臟衰竭，
並提供簡潔明確的建議、風險說明與健康提醒（請條列列出）。

ECG 數據如下：
${values.join(', ')}
      `;

      const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + import.meta.env.VITE_OPENAI_API_KEY
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }]
        })
      });
      const json = await gptRes.json();
      const reply = json.choices?.[0]?.message?.content || "無法取得建議";

      newResults.push({ filename: file.name, values, risk, reply });
    }

    setResults(newResults);
    setLoading(false);
  };

  useEffect(() => {
    results.forEach((r, i) => {
      const canvasId = `chart-${i}`;
      const ctx = document.getElementById(canvasId);
      if (ctx && r.values.length > 0) {
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: r.values.map((_, i) => i + 1),
            datasets: [{
              label: 'ECG 波形',
              data: r.values,
              fill: false,
              borderColor: 'green',
              tension: 0.3
            }]
          }
        });
      }
    });
  }, [results]);

  const exportPDF = async () => {
    const doc = new jsPDF();
    const content = document.getElementById("report");
    const canvas = await html2canvas(content);
    const imgData = canvas.toDataURL("image/png");
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    doc.save('ECG_Report.pdf');
  };

  return (
    <div className="container">
      <img src="/gary_logo.png" alt="Logo" style={{ width: 120, marginBottom: '1rem' }} />
      <h1>ECG 心臟風險 AI 預測</h1>
      <form>
        <input type="text" name="name" placeholder="姓名（可留空）" onChange={handleChange} />
        <input type="number" name="age" placeholder="年齡" required onChange={handleChange} />
        <select name="gender" onChange={handleChange}>
          <option value="">請選擇性別</option>
          <option value="男">男</option>
          <option value="女">女</option>
          <option value="其他">其他</option>
        </select>
        <textarea name="history" rows="2" placeholder="病史說明（可留空）" onChange={handleChange} />
      </form>
      <input type="file" accept=".csv" multiple onChange={handleFiles} />
      {loading && <p>分析中請稍候...</p>}
      <div id="report">
        {results.map((r, i) => (
          <div key={i} className="report-block">
            <h3>{r.filename}</h3>
            <p><strong>預測風險：</strong>{(r.risk * 100).toFixed(1)}%</p>
            {r.values.length > 0 && <canvas id={`chart-${i}`} style={{ maxHeight: '200px' }}></canvas>}
            <h4>AI 分析與建議</h4>
            <p>{r.reply}</p>
          </div>
        ))}
      </div>
      {results.length > 0 && (
        <button onClick={exportPDF}>匯出 PDF 報告</button>
      )}
    </div>
  );
}

export default App;
