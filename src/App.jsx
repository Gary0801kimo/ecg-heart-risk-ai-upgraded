import React, { useState } from 'react';
import Chart from 'chart.js/auto';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

function App() {
  const [user, setUser] = useState({ name: '', age: '', gender: '', history: '' });
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const chartRefs = React.useRef([]);

  const handleChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value });
  };

  const handleFiles = async (e) => {
    const fileList = Array.from(e.target.files).slice(0, 4);
    setFiles(fileList);
    setResults([]);
    chartRefs.current = [];
    setLoading(true);
    const newResults = [];

    for (const file of fileList) {
      const text = await file.text();
      const row = text.trim().split(/\r?\n/)[0];
      const values = row.split(',').map(Number);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const risk = avg > 0.35 ? 0.78 : 0.12;

      const prompt = `
以下是一位使用者的 ECG 心電圖特徵（共 20 項數值），為醫療輔助評估用途。
使用者資料如下：
姓名：${user.name || '匿名'}
年齡：${user.age}
性別：${user.gender}
病史描述：${user.history || '無'}

請模擬心臟科醫師，根據 ECG 數值波動趨勢判斷此人在 1～3 年內是否可能罹患心臟衰竭，並給出風險說明、預防建議與就醫建議。

ECG 數據如下：
${values.join(', ')}

請條列回應，並以親切語氣呈現。
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

  const renderChart = (values, canvasId) => {
    const ctx = document.getElementById(canvasId);
    if (ctx) {
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: values.map((_, i) => i + 1),
          datasets: [{
            label: 'ECG 波形',
            data: values,
            fill: false,
            borderColor: 'green',
            tension: 0.3
          }]
        }
      });
    }
  };

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
            <canvas id={`chart-${i}`} style={{ maxHeight: '200px' }}></canvas>
            {setTimeout(() => renderChart(r.values, `chart-${i}`), 100)}
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
