const express        = require("express");
const session        = require("express-session");
const axios          = require("axios");
const fs             = require("fs");
const path           = require("path");

const app  = express();
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;

// ─── Config ────────────────────────────────────────────────────────────────────
const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID;     // من Developer Portal → OAuth2
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET; // من Developer Portal → OAuth2
const DASHBOARD_URL         = process.env.DASHBOARD_URL;          // مثال: https://yourapp.railway.app
const DASHBOARD_SECRET      = process.env.DASHBOARD_SECRET || "change_this_secret_123";
const SUPPORT_ROLE_ID       = process.env.SUPPORT_ROLE_ID;

const REDIRECT_URI = `${DASHBOARD_URL}/auth/callback`;

// ─── Settings Storage ──────────────────────────────────────────────────────────
const SETTINGS_FILE = path.join(__dirname, "settings.json");

function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE))
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
      panelTitle:       "🎫 نظام التيكتات",
      panelDescription: "تحتاج مساعدة؟ اضغط على الزر أدناه لفتح تيكت.\nسيقوم فريق الدعم بالرد عليك في أقرب وقت.",
      panelColor:       "#5865f2",
      panelButtonText:  "فتح تيكت",
      panelButtonEmoji: "🎫",
      welcomeTitle:     "🎫 تيكت",
      welcomeDescription: "أهلاً {user}!\n\nتم فتح تيكتك. سيتواصل معك فريق الدعم قريباً.\nاشرح مشكلتك بالتفصيل.",
      welcomeColor:     "#57f287",
      claimColor:       "#fee75c",
      closeReason:      "تم إغلاق التيكت",
    }));
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}

function saveSettings(s) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); }

function loadTickets() {
  const f = path.join(__dirname, "tickets.json");
  if (!fs.existsSync(f)) return { counter: 0, tickets: {} };
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: DASHBOARD_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 86400000 },
}));

// ─── Auth Middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ─── HTML Helper ──────────────────────────────────────────────────────────────
function page(title, body, user = null) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — لوحة التحكم</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f1117;--card:#1a1d27;--border:#2a2d3e;--accent:#5865f2;
  --accent2:#57f287;--text:#e2e8f0;--muted:#8892a4;--danger:#ed4245;--warn:#fee75c;
}
body{font-family:'Cairo',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
a{color:var(--accent);text-decoration:none}
/* Nav */
nav{background:var(--card);border-bottom:1px solid var(--border);padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:60px;position:sticky;top:0;z-index:100}
.nav-brand{font-size:18px;font-weight:800;color:var(--accent)}
.nav-links{display:flex;gap:8px}
.nav-links a{color:var(--muted);padding:6px 14px;border-radius:8px;font-size:14px;font-weight:600;transition:.2s}
.nav-links a:hover,.nav-links a.active{background:var(--accent);color:#fff}
.nav-user{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--muted)}
.nav-user img{width:32px;height:32px;border-radius:50%}
/* Layout */
.container{max-width:1100px;margin:0 auto;padding:32px 24px}
/* Cards */
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px}
.card-title{font-size:16px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
/* Grid */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
/* Stat */
.stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center}
.stat .num{font-size:36px;font-weight:800;color:var(--accent)}
.stat .lbl{color:var(--muted);font-size:13px;margin-top:4px}
/* Forms */
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px}
.form-group input,.form-group textarea,.form-group select{
  width:100%;background:#0d1117;border:1px solid var(--border);border-radius:8px;
  padding:10px 14px;color:var(--text);font-family:'Cairo',sans-serif;font-size:14px;outline:none;transition:.2s;
}
.form-group input:focus,.form-group textarea:focus,.form-group select:focus{border-color:var(--accent)}
.form-group textarea{resize:vertical;min-height:80px}
/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:8px;font-family:'Cairo',sans-serif;font-weight:700;font-size:14px;border:none;cursor:pointer;transition:.2s}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:#4752c4}
.btn-success{background:var(--accent2);color:#000}.btn-success:hover{opacity:.85}
.btn-danger{background:var(--danger);color:#fff}.btn-danger:hover{opacity:.85}
.btn-warn{background:var(--warn);color:#000}.btn-warn:hover{opacity:.85}
.btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text)}.btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
/* Table */
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:right;color:var(--muted);font-weight:600;padding:10px 14px;border-bottom:1px solid var(--border)}
td{padding:10px 14px;border-bottom:1px solid var(--border)15}
tr:hover td{background:rgba(255,255,255,.02)}
/* Badge */
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700}
.badge-green{background:#57f28722;color:#57f287}
.badge-yellow{background:#fee75c22;color:#fee75c}
.badge-red{background:#ed424522;color:#ed4245}
/* Alert */
.alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
.alert-success{background:#57f28718;border:1px solid #57f28740;color:#57f287}
.alert-error{background:#ed424518;border:1px solid #ed424540;color:#ed4245}
/* Preview */
.preview-embed{background:#2b2d31;border-radius:4px;border-left:4px solid #5865f2;padding:12px 16px;max-width:400px;margin-top:12px}
.preview-embed .p-title{font-weight:700;font-size:15px;margin-bottom:6px}
.preview-embed .p-desc{font-size:14px;color:#b5bac1;line-height:1.5;white-space:pre-wrap}
/* Login */
.login-center{display:flex;align-items:center;justify-content:center;min-height:100vh}
.login-card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:48px;text-align:center;max-width:420px;width:100%}
.login-card h1{font-size:28px;font-weight:800;margin-bottom:8px}
.login-card p{color:var(--muted);margin-bottom:32px;font-size:15px}
.btn-discord{background:#5865f2;color:#fff;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:700;display:inline-flex;align-items:center;gap:10px;transition:.2s}
.btn-discord:hover{background:#4752c4}
/* Responsive */
@media(max-width:700px){.grid-2,.grid-3{grid-template-columns:1fr}.nav-links{display:none}}
/* Toast */
#toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#57f287;color:#000;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;opacity:0;transition:.3s;z-index:999;pointer-events:none}
#toast.show{opacity:1}
</style>
</head>
<body>
${user ? `
<nav>
  <span class="nav-brand">🎫 لوحة التحكم</span>
  <div class="nav-links">
    <a href="/dashboard" class="${title==="الرئيسية"?"active":""}">🏠 الرئيسية</a>
    <a href="/dashboard/panel" class="${title==="البانل"?"active":""}">📋 البانل</a>
    <a href="/dashboard/tickets" class="${title==="التيكتات"?"active":""}">🎫 التيكتات</a>
    <a href="/dashboard/settings" class="${title==="الإعدادات"?"active":""}">⚙️ الإعدادات</a>
    <a href="/dashboard/messages" class="${title==="الرسائل"?"active":""}">💬 الرسائل</a>
  </div>
  <div class="nav-user">
    <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
    <span>${user.username}</span>
    <a href="/logout" style="color:var(--danger);font-size:13px">خروج</a>
  </div>
</nav>` : ""}
<div class="container">${body}</div>
<div id="toast"></div>
<script>
function toast(msg,ok=true){const t=document.getElementById('toast');t.textContent=msg;t.style.background=ok?'#57f287':'#ed4245';t.style.color=ok?'#000':'#fff';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
async function post(url,data){
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  return r.json();
}
</script>
</body></html>`;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// Login page
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.send(page("تسجيل الدخول", `
    <div class="login-center">
      <div class="login-card">
        <div style="font-size:48px;margin-bottom:16px">🎫</div>
        <h1>لوحة التحكم</h1>
        <p>سجّل دخولك بحساب ديسكورد للوصول إلى إعدادات البوت</p>
        <a href="/auth/discord" class="btn-discord">
          <svg width="20" height="20" viewBox="0 0 71 55" fill="white"><path d="M60.1 4.9A58.5 58.5 0 0 0 45.7.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.3 37.3 0 0 0 25.7.5a.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 11 4.9a.2.2 0 0 0-.1.1C1.6 18.7-1 32.2.3 45.5a.2.2 0 0 0 .1.1 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.1 36.1 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.2 47.2 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.6 58.6 0 0 0 17.8-9 .2.2 0 0 0 .1-.1c1.5-15.6-2.5-29-10.5-41a.2.2 0 0 0-.1-.1zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2zm23.7 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2z"/></svg>
          تسجيل الدخول بديسكورد
        </a>
      </div>
    </div>
  `));
});

// Discord OAuth redirect
app.get("/auth/discord", (req, res) => {
  const params = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         "identify guilds",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// OAuth callback
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect("/login");

  try {
    // Get token
    const tokenRes = await axios.post("https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id:     DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    // Get user
    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });

    req.session.user         = userRes.data;
    req.session.accessToken  = tokenRes.data.access_token;
    res.redirect("/dashboard");
  } catch (e) {
    console.log("[OAuth Error]", e.message);
    res.redirect("/login?error=1");
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// ── Dashboard Home ─────────────────────────────────────────────────────────────
app.get("/dashboard", requireAuth, (req, res) => {
  const data     = loadTickets();
  const tickets  = Object.values(data.tickets);
  const open     = tickets.filter(t => !t.closed).length;
  const claimed  = tickets.filter(t => t.claimed && !t.closed).length;
  const total    = data.counter;
  const settings = loadSettings();

  res.send(page("الرئيسية", `
    <h2 style="margin-bottom:24px;font-size:22px;font-weight:800">🏠 الرئيسية</h2>
    <div class="grid-3" style="margin-bottom:24px">
      <div class="stat"><div class="num" style="color:#57f287">${open}</div><div class="lbl">تيكتات مفتوحة</div></div>
      <div class="stat"><div class="num" style="color:#fee75c">${claimed}</div><div class="lbl">مكلايمة</div></div>
      <div class="stat"><div class="num">${total}</div><div class="lbl">إجمالي كل الوقت</div></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">🎫 آخر التيكتات</div>
        ${tickets.filter(t=>!t.closed).slice(-5).reverse().map(t=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="font-weight:600">#${t.ticketNumber} — ${t.username}</span>
            <span class="badge ${t.claimed?"badge-yellow":"badge-green"}">${t.claimed?"مكلايم":"مفتوح"}</span>
          </div>
        `).join("") || "<p style='color:var(--muted)'>لا توجد تيكتات مفتوحة</p>"}
      </div>

      <div class="card">
        <div class="card-title">⚡ إجراءات سريعة</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <a href="/dashboard/panel" class="btn btn-primary" style="justify-content:center">📋 تعديل البانل</a>
          <a href="/dashboard/messages" class="btn btn-ghost" style="justify-content:center">💬 تعديل الرسائل</a>
          <a href="/dashboard/settings" class="btn btn-ghost" style="justify-content:center">⚙️ الإعدادات</a>
          <a href="/dashboard/tickets" class="btn btn-ghost" style="justify-content:center">🎫 إدارة التيكتات</a>
        </div>
      </div>
    </div>
  `, req.session.user));
});

// ── Panel Settings ─────────────────────────────────────────────────────────────
app.get("/dashboard/panel", requireAuth, (req, res) => {
  const s = loadSettings();
  res.send(page("البانل", `
    <h2 style="margin-bottom:24px;font-size:22px;font-weight:800">📋 إعدادات البانل</h2>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">✏️ تعديل البانل</div>
        <div class="form-group">
          <label>عنوان البانل</label>
          <input type="text" id="panelTitle" value="${s.panelTitle}">
        </div>
        <div class="form-group">
          <label>وصف البانل</label>
          <textarea id="panelDescription">${s.panelDescription}</textarea>
        </div>
        <div class="form-group">
          <label>لون الإمبد (HEX)</label>
          <input type="color" id="panelColor" value="${s.panelColor}" style="height:40px;cursor:pointer">
        </div>
        <div class="form-group">
          <label>نص زر الفتح</label>
          <input type="text" id="panelButtonText" value="${s.panelButtonText}">
        </div>
        <div class="form-group">
          <label>إيموجي الزر</label>
          <input type="text" id="panelButtonEmoji" value="${s.panelButtonEmoji}">
        </div>
        <button class="btn btn-primary" onclick="savePanel()">💾 حفظ التغييرات</button>
      </div>

      <div class="card">
        <div class="card-title">👁️ معاينة</div>
        <div class="preview-embed" id="previewEmbed" style="border-left-color:${s.panelColor}">
          <div class="p-title" id="previewTitle">${s.panelTitle}</div>
          <div class="p-desc" id="previewDesc">${s.panelDescription}</div>
        </div>
        <div style="margin-top:12px">
          <button style="background:${s.panelColor};color:#fff;border:none;border-radius:6px;padding:8px 18px;font-family:'Cairo',sans-serif;font-weight:700;font-size:14px;cursor:pointer" id="previewBtn">
            <span id="previewBtnEmoji">${s.panelButtonEmoji}</span>
            <span id="previewBtnText">${s.panelButtonText}</span>
          </button>
        </div>
        <p style="color:var(--muted);font-size:12px;margin-top:16px">* المعاينة تقريبية</p>
      </div>
    </div>

    <script>
    // Live preview
    function updatePreview(){
      document.getElementById('previewTitle').textContent = document.getElementById('panelTitle').value;
      document.getElementById('previewDesc').textContent  = document.getElementById('panelDescription').value;
      document.getElementById('previewEmbed').style.borderLeftColor = document.getElementById('panelColor').value;
      document.getElementById('previewBtn').style.background = document.getElementById('panelColor').value;
      document.getElementById('previewBtnText').textContent  = document.getElementById('panelButtonText').value;
      document.getElementById('previewBtnEmoji').textContent = document.getElementById('panelButtonEmoji').value;
    }
    ['panelTitle','panelDescription','panelColor','panelButtonText','panelButtonEmoji'].forEach(id=>{
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    async function savePanel(){
      const r = await post('/api/settings', {
        panelTitle:       document.getElementById('panelTitle').value,
        panelDescription: document.getElementById('panelDescription').value,
        panelColor:       document.getElementById('panelColor').value,
        panelButtonText:  document.getElementById('panelButtonText').value,
        panelButtonEmoji: document.getElementById('panelButtonEmoji').value,
      });
      toast(r.ok ? '✅ تم الحفظ بنجاح!' : '❌ حدث خطأ', r.ok);
    }
    </script>
  `, req.session.user));
});

// ── Messages Settings ──────────────────────────────────────────────────────────
app.get("/dashboard/messages", requireAuth, (req, res) => {
  const s = loadSettings();
  res.send(page("الرسائل", `
    <h2 style="margin-bottom:24px;font-size:22px;font-weight:800">💬 تعديل رسائل البوت</h2>

    <div class="card">
      <div class="card-title">🎫 رسالة الترحيب عند فتح التيكت</div>
      <div class="grid-2">
        <div>
          <div class="form-group">
            <label>العنوان</label>
            <input type="text" id="welcomeTitle" value="${s.welcomeTitle}">
          </div>
          <div class="form-group">
            <label>الوصف <small style="color:var(--muted)">(استخدم {user} لمنشن الفاتح و {num} لرقم التيكت)</small></label>
            <textarea id="welcomeDescription" rows="5">${s.welcomeDescription}</textarea>
          </div>
          <div class="form-group">
            <label>اللون</label>
            <input type="color" id="welcomeColor" value="${s.welcomeColor}" style="height:40px;cursor:pointer">
          </div>
        </div>
        <div>
          <p style="color:var(--muted);font-size:13px;margin-bottom:12px">معاينة:</p>
          <div class="preview-embed" id="welcomePreview" style="border-left-color:${s.welcomeColor}">
            <div class="p-title" id="wPreviewTitle">${s.welcomeTitle}</div>
            <div class="p-desc" id="wPreviewDesc">${s.welcomeDescription}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🟡 رسالة الكلايم</div>
      <div class="form-group">
        <label>لون إمبد الكلايم</label>
        <input type="color" id="claimColor" value="${s.claimColor}" style="height:40px;cursor:pointer">
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔒 سبب الإغلاق الافتراضي</div>
      <div class="form-group">
        <label>النص الافتراضي عند عدم ذكر سبب</label>
        <input type="text" id="closeReason" value="${s.closeReason}">
      </div>
    </div>

    <button class="btn btn-primary" onclick="saveMessages()">💾 حفظ جميع الرسائل</button>

    <script>
    function updateWelcomePreview(){
      document.getElementById('wPreviewTitle').textContent = document.getElementById('welcomeTitle').value;
      document.getElementById('wPreviewDesc').textContent  = document.getElementById('welcomeDescription').value;
      document.getElementById('welcomePreview').style.borderLeftColor = document.getElementById('welcomeColor').value;
    }
    ['welcomeTitle','welcomeDescription','welcomeColor'].forEach(id=>{
      document.getElementById(id).addEventListener('input', updateWelcomePreview);
    });
    async function saveMessages(){
      const r = await post('/api/settings',{
        welcomeTitle:       document.getElementById('welcomeTitle').value,
        welcomeDescription: document.getElementById('welcomeDescription').value,
        welcomeColor:       document.getElementById('welcomeColor').value,
        claimColor:         document.getElementById('claimColor').value,
        closeReason:        document.getElementById('closeReason').value,
      });
      toast(r.ok ? '✅ تم حفظ الرسائل!' : '❌ حدث خطأ', r.ok);
    }
    </script>
  `, req.session.user));
});

// ── Tickets Management ─────────────────────────────────────────────────────────
app.get("/dashboard/tickets", requireAuth, (req, res) => {
  const data    = loadTickets();
  const tickets = Object.values(data.tickets).filter(t => !t.closed).reverse();

  res.send(page("التيكتات", `
    <h2 style="margin-bottom:24px;font-size:22px;font-weight:800">🎫 إدارة التيكتات</h2>

    <div class="card">
      <div class="card-title">📋 التيكتات المفتوحة (${tickets.length})</div>
      ${tickets.length ? `
      <table>
        <thead>
          <tr>
            <th>رقم</th><th>الفاتح</th><th>الحالة</th><th>الكلايم</th><th>المدة</th><th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map(t => {
            const dur = Math.round((Date.now() - t.createdAt) / 60000);
            return `<tr>
              <td><b>#${t.ticketNumber}</b></td>
              <td>${t.username}</td>
              <td><span class="badge ${t.locked?"badge-red":"badge-green"}">${t.locked?"مقفل":"مفتوح"}</span></td>
              <td>${t.claimed ? `<span class="badge badge-yellow">${t.claimedByName}</span>` : "<span style='color:var(--muted)'>—</span>"}</td>
              <td style="color:var(--muted)">${dur < 60 ? dur+"د" : Math.round(dur/60)+"س"}</td>
              <td>
                <button class="btn btn-warn" style="padding:4px 10px;font-size:12px" onclick="addMember('${t.channelId}')">+ عضو</button>
                <button class="btn btn-danger" style="padding:4px 10px;font-size:12px;margin-right:4px" onclick="deleteTicket('${t.channelId}','${t.ticketNumber}')">حذف</button>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>` : "<p style='color:var(--muted)'>لا توجد تيكتات مفتوحة حالياً</p>"}
    </div>

    <script>
    async function deleteTicket(channelId, num){
      if(!confirm('هل تريد حذف التيكت #'+num+'؟')) return;
      const r = await post('/api/ticket/delete', { channelId });
      toast(r.ok ? '✅ تم حذف التيكت' : '❌ '+r.error, r.ok);
      if(r.ok) setTimeout(()=>location.reload(), 1500);
    }
    async function addMember(channelId){
      const userId = prompt('أدخل Discord User ID للعضو:');
      if(!userId) return;
      const r = await post('/api/ticket/add-member', { channelId, userId });
      toast(r.ok ? '✅ تم الإضافة' : '❌ '+r.error, r.ok);
    }
    </script>
  `, req.session.user));
});

// ── Settings ───────────────────────────────────────────────────────────────────
app.get("/dashboard/settings", requireAuth, (req, res) => {
  const supportRoleId    = process.env.SUPPORT_ROLE_ID    || "";
  const categoryId       = process.env.CATEGORY_ID        || "";
  const panelChannelId   = process.env.PANEL_CHANNEL_ID   || "";
  const archiveChannelId = process.env.ARCHIVE_CHANNEL_ID || "";

  res.send(page("الإعدادات", `
    <h2 style="margin-bottom:24px;font-size:22px;font-weight:800">⚙️ الإعدادات</h2>

    <div class="card">
      <div class="card-title">🔧 إعدادات Railway Variables</div>
      <p style="color:var(--muted);font-size:13px;margin-bottom:16px">هذه القيم تُقرأ من Railway Variables — لتغييرها عدّل في Railway مباشرة</p>
      <table>
        <tr><th>المتغير</th><th>القيمة الحالية</th><th>الحالة</th></tr>
        <tr><td>TOKEN</td><td style="color:var(--muted)">●●●●●●●●</td><td><span class="badge badge-green">✓ موجود</span></td></tr>
        <tr><td>SUPPORT_ROLE_ID</td><td style="font-family:monospace;font-size:12px">${supportRoleId||"—"}</td><td><span class="badge ${supportRoleId?"badge-green":"badge-red"}">${supportRoleId?"✓":"✗ مطلوب"}</span></td></tr>
        <tr><td>PANEL_CHANNEL_ID</td><td style="font-family:monospace;font-size:12px">${panelChannelId||"—"}</td><td><span class="badge ${panelChannelId?"badge-green":"badge-red"}">${panelChannelId?"✓":"✗ مطلوب"}</span></td></tr>
        <tr><td>ARCHIVE_CHANNEL_ID</td><td style="font-family:monospace;font-size:12px">${archiveChannelId||"—"}</td><td><span class="badge ${archiveChannelId?"badge-green":"badge-red"}">${archiveChannelId?"✓":"✗ مطلوب"}</span></td></tr>
        <tr><td>CATEGORY_ID</td><td style="font-family:monospace;font-size:12px">${categoryId||"—"}</td><td><span class="badge badge-yellow">اختياري</span></td></tr>
        <tr><td>DISCORD_CLIENT_ID</td><td style="font-family:monospace;font-size:12px">${DISCORD_CLIENT_ID||"—"}</td><td><span class="badge ${DISCORD_CLIENT_ID?"badge-green":"badge-red"}">${DISCORD_CLIENT_ID?"✓":"✗ مطلوب للداشبورد"}</span></td></tr>
        <tr><td>DASHBOARD_URL</td><td style="font-family:monospace;font-size:12px">${DASHBOARD_URL||"—"}</td><td><span class="badge ${DASHBOARD_URL?"badge-green":"badge-red"}">${DASHBOARD_URL?"✓":"✗ مطلوب للداشبورد"}</span></td></tr>
      </table>
    </div>

    <div class="card">
      <div class="card-title">ℹ️ معلومات النظام</div>
      <table>
        <tr><td>إصدار Node.js</td><td style="font-family:monospace">${process.version}</td></tr>
        <tr><td>وقت التشغيل</td><td>${Math.floor(process.uptime()/3600)}س ${Math.floor((process.uptime()%3600)/60)}د</td></tr>
        <tr><td>إجمالي التيكتات</td><td>${loadTickets().counter}</td></tr>
      </table>
    </div>
  `, req.session.user));
});

// ── API: Save Settings ─────────────────────────────────────────────────────────
app.post("/api/settings", requireAuth, (req, res) => {
  try {
    const current = loadSettings();
    const updated = { ...current, ...req.body };
    saveSettings(updated);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Delete Ticket ─────────────────────────────────────────────────────────
app.post("/api/ticket/delete", requireAuth, async (req, res) => {
  try {
    const { channelId } = req.body;
    const f = path.join(__dirname, "tickets.json");
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    delete d.tickets[channelId];
    fs.writeFileSync(f, JSON.stringify(d, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── API: Add Member ────────────────────────────────────────────────────────────
app.post("/api/ticket/add-member", requireAuth, (req, res) => {
  // يحتاج البوت يكون متصل — هذا placeholder
  res.json({ ok: true, note: "تحتاج إعادة تشغيل البوت مع API مشترك" });
});

// ── Root redirect ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.redirect(req.session.user ? "/dashboard" : "/login"));

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🌐 الداشبورد شغال على المنفذ ${PORT}`));

module.exports = { loadSettings };
