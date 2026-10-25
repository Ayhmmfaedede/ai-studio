import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const HISTORY_KEY = "ai-studio-history-v1";

const modes = [
  { value: "answer", label: "الجواب فقط", desc: "إجابة مباشرة بدون شرح إضافي" },
  { value: "simple", label: "جواب + شرح مبسّط", desc: "الإجابة أولًا ثم شرح بالعربي" },
  { value: "steps", label: "خطوة بخطوة", desc: "شرح طريقة الحل بالترتيب" },
  { value: "examples", label: "شرح مع أمثلة", desc: "أمثلة تساعدك تفهم" },
  { value: "teach", label: "علّمني بالتلميحات", desc: "ساعدني أحاول قبل الحل" }
];

function readHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function App() {
  const [question, setQuestion] = useState("");
  const [image, setImage] = useState(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [answerMode, setAnswerMode] = useState("answer");
  const [answerLanguage, setAnswerLanguage] = useState("same");
  const [detail, setDetail] = useState("medium");
  const [history, setHistory] = useState(() => readHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [lastRequest, setLastRequest] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
    } catch {
      // History is a convenience; the app still works if browser storage is unavailable.
    }
  }, [history]);

  function chooseImage(file) {
    setError("");
    setAnswer("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("اختر ملف صورة من فضلك.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError("حجم الصورة كبير. اختر صورة أصغر من 6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage({ name: file.name, dataUrl: reader.result, type: file.type });
    reader.onerror = () => setError("لم نتمكن من قراءة الصورة. حاول مرة أخرى.");
    reader.readAsDataURL(file);
  }

  async function requestAnswer({ promptText, imageDataUrl, mode, followupOnly = false }) {
    const response = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: promptText,
        imageDataUrl: imageDataUrl || null,
        preferences: {
          answerMode: mode || answerMode,
          answerLanguage,
          detail,
          followupOnly
        }
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "حدث خطأ غير متوقع.");
    return data.answer || "";
  }

  async function askAI(event) {
    event?.preventDefault();
    setError("");
    setAnswer("");
    setCopied(false);
    if (!question.trim() && !image) {
      setError("اكتب سؤالك أو ارفع صورة أولًا.");
      return;
    }
    setLoading(true);
    const request = {
      question: question.trim(),
      imageDataUrl: image?.dataUrl || null,
      imageName: image?.name || "",
      answerMode,
      answerLanguage,
      detail
    };
    setLastRequest(request);
    try {
      const text = await requestAnswer({
        promptText: request.question,
        imageDataUrl: request.imageDataUrl,
        mode: request.answerMode
      });
      setAnswer(text);
      const entry = {
        id: Date.now(),
        question: request.question || (request.imageName ? `صورة: ${request.imageName}` : "سؤال"),
        answer: text,
        createdAt: new Date().toLocaleString(),
        preferences: { answerMode, answerLanguage, detail }
      };
      setHistory(old => [entry, ...old].slice(0, 30));
    } catch (err) {
      setError(err.message || "تعذّر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }

  async function explainMore() {
    if (!lastRequest || loading) return;
    setLoading(true);
    setError("");
    try {
      const text = await requestAnswer({
        promptText: `أريد شرحًا إضافيًا لهذه الإجابة:\n${answer}\n\nالسؤال الأصلي: ${lastRequest.question || "السؤال الموجود في الصورة"}`,
        imageDataUrl: lastRequest.imageDataUrl,
        mode: "simple",
        followupOnly: true
      });
      setAnswer(old => `${old}\n\n— شرح إضافي —\n${text}`);
    } catch (err) {
      setError(err.message || "تعذّر الحصول على شرح إضافي.");
    } finally {
      setLoading(false);
    }
  }

  async function copyAnswer() {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("تعذّر النسخ تلقائيًا. حدّد الإجابة وانسخها يدويًا.");
    }
  }

  function resetAll() {
    setQuestion("");
    setImage(null);
    setAnswer("");
    setError("");
    setLastRequest(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function loadHistory(entry) {
    setQuestion(entry.question.startsWith("صورة: ") ? "" : entry.question);
    setAnswer(entry.answer);
    setLastRequest(null);
    setShowHistory(false);
    setImage(null);
  }

  function clearHistory() {
    setHistory([]);
  }

  return (
    <main className="app-shell">
      <nav className="topbar">
        <a className="brand" href="#" aria-label="AI Studio home">
          <span className="brand-mark"><span>✦</span></span>
          <span>AI <b>STUDIO</b></span>
        </a>
        <button type="button" className="history-toggle" onClick={() => setShowHistory(v => !v)}>
          <span>◷</span> سجل الأسئلة <b>{history.length}</b>
        </button>
      </nav>

      <section className="hero">
        <div className="eyebrow"><span>✧</span> THINK CLEARER · LEARN FASTER</div>
        <h1>كل سؤال له <span>إجابة.</span><br />على طريقتك.</h1>
        <p className="subtitle">اختَر طريقة الإجابة، اكتب سؤالك أو أرفق صورة،<br className="desktop-break" /> وخلي الباقي علينا.</p>
      </section>

      <section className="workspace">
        {showHistory && (
          <section className="panel history-panel">
            <div className="history-heading">
              <div><span className="tiny-label">YOUR RECENT QUESTIONS</span><h2>سجل الأسئلة</h2></div>
              <div className="history-actions">
                {history.length > 0 && <button type="button" className="text-button" onClick={clearHistory}>مسح السجل</button>}
                <button type="button" className="close-button" onClick={() => setShowHistory(false)} aria-label="إغلاق">×</button>
              </div>
            </div>
            {history.length === 0 ? <p className="empty-history">لسه ما عندك أسئلة محفوظة.</p> : (
              <div className="history-list">
                {history.map(item => (
                  <button type="button" className="history-item" key={item.id} onClick={() => loadHistory(item)}>
                    <span className="history-dot">✦</span>
                    <span className="history-item-text"><b>{item.question}</b><small>{item.createdAt}</small></span>
                    <span className="history-arrow">↗</span>
                  </button>
                ))}
              </div>
            )}
            <p className="privacy-note">السجل محفوظ في هذا المتصفح على جهازك فقط.</p>
          </section>
        )}

        <form className="composer panel" onSubmit={askAI}>
          <div className="panel-heading">
            <div><span className="tiny-label">PERSONALIZE YOUR ANSWER</span><h2>اختَر كيف يجاوبك</h2></div>
            <span className="sparkle">✳</span>
          </div>

          <div className="settings-grid">
            <label className="setting-field">
              <span>طريقة الإجابة</span>
              <select value={answerMode} onChange={e => setAnswerMode(e.target.value)}>
                {modes.map(mode => <option value={mode.value} key={mode.value}>{mode.label}</option>)}
              </select>
              <small>{modes.find(mode => mode.value === answerMode)?.desc}</small>
            </label>
            <label className="setting-field">
              <span>لغة الإجابة</span>
              <select value={answerLanguage} onChange={e => setAnswerLanguage(e.target.value)}>
                <option value="same">نفس لغة السؤال</option>
                <option value="en">الإنجليزية</option>
                <option value="nl">الهولندية</option>
                <option value="ar">العربية</option>
              </select>
              <small>يمكنك تغييرها بأي وقت</small>
            </label>
            <label className="setting-field">
              <span>مستوى التفصيل</span>
              <select value={detail} onChange={e => setDetail(e.target.value)}>
                <option value="short">قصير ومباشر</option>
                <option value="medium">متوسط وواضح</option>
                <option value="detailed">تفصيلي</option>
              </select>
              <small>الافتراضي متوسط</small>
            </label>
          </div>

          <label className="input-label" htmlFor="question">سؤالك أو تعليماتك</label>
          <textarea id="question" value={question} onChange={e => setQuestion(e.target.value)}
            placeholder="مثلاً: حل السؤال أو اشرح لي هذه الفكرة..." rows="4" maxLength={12000} />
          {image && <div className="attached-file"><span className="file-icon">▧</span><span className="file-name">{image.name}</span>
            <button type="button" className="remove-file" onClick={() => { setImage(null); if (fileRef.current) fileRef.current.value = ""; }} aria-label="إزالة الصورة">×</button></div>}
          <div className="composer-footer">
            <div className="tools">
              <button type="button" className="upload-button" onClick={() => fileRef.current?.click()}><span>＋</span> أرفق صورة</button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => chooseImage(e.target.files?.[0])} />
              <span className="hint">PNG · JPG · WEBP · حتى 6 MB</span>
            </div>
            <button className="send-button" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> جاري التفكير</> : <>اسأل AI <span>↗</span></>}
            </button>
          </div>
        </form>

        {error && <div className="error-message" role="alert"><span>!</span>{error}</div>}
        {loading && <div className="panel loading-panel"><div className="loading-orb">✦</div><div><b>عم نجهّز إجابتك...</b><p>نرتّب الإجابة حسب اختياراتك.</p></div></div>}

        {answer && !loading && (
          <section className="results">
            <article className="panel answer-card">
              <div className="result-heading">
                <div className="result-icon answer-icon">✦</div>
                <div><span className="tiny-label">YOUR ANSWER</span><h2>الإجابة</h2></div>
                <button className="copy-button" type="button" onClick={copyAnswer}><span>{copied ? "✓" : "▢"}</span> {copied ? "تم النسخ" : "انسخ الإجابة"}</button>
              </div>
              <div className="answer-text" dir="auto">{answer}</div>
            </article>
            <div className="result-actions">
              <button type="button" className="secondary-button" onClick={explainMore} disabled={loading}>✧ اشرح أكثر</button>
              <button type="button" className="new-question" onClick={resetAll}>＋ سؤال جديد</button>
            </div>
          </section>
        )}

        {!answer && !loading && (
          <div className="feature-grid">
            <div className="feature"><span className="feature-symbol purple">▧</span><div><b>يفهم الصور</b><p>ارفع صورة سؤال أو ورقة.</p></div></div>
            <div className="feature"><span className="feature-symbol blue">▢</span><div><b>جواب قابل للنسخ</b><p>انسخ الإجابة بضغطة.</p></div></div>
            <div className="feature"><span className="feature-symbol gold">↻</span><div><b>اسأل وتابع</b><p>اطلب شرحًا إضافيًا متى احتجت.</p></div></div>
          </div>
        )}
      </section>
      <footer><span>AI STUDIO</span><span>مصنوع للتعلّم والاكتشاف <b>✦</b></span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);