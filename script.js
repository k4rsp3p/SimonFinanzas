if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

let movements    = JSON.parse(localStorage.getItem('movements'))  || [];
let categories   = JSON.parse(localStorage.getItem('categories')) || ['Gasolina','Comida','Ingreso','Transporte','Otros'];
let currentMonth = new Date();
let selectedType = 'ingreso';
let filterDay    = null;
let dragSrcIndex = null;
let pendingDeleteId = null;
let geminiKey    = localStorage.getItem('geminiKey') || '';
let recognition  = null;
let isRecording  = false;
let lastTranscript = '';

// ─── HELPERS ─────────────────────────────────────────────
function save() {
  localStorage.setItem('movements',  JSON.stringify(movements));
  localStorage.setItem('categories', JSON.stringify(categories));
}
function getMonthKey(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function formatMonthLabel(d) { return d.toLocaleDateString('es-CO',{month:'long',year:'numeric'}); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ─── RENDER ───────────────────────────────────────────────
function renderMovimientos() {
  const key = getMonthKey(currentMonth);
  let movs = movements.filter(m => getMonthKey(new Date(m.date))===key);
  if (filterDay!==null) movs = movs.filter(m => new Date(m.date).getDate()===filterDay);
  const ingr = movs.filter(m=>m.type==='ingreso').reduce((s,m)=>s+m.amount,0);
  const gast = movs.filter(m=>m.type==='gasto').reduce((s,m)=>s+m.amount,0);
  document.getElementById('current-month').textContent  = formatMonthLabel(currentMonth);
  document.getElementById('total-ingresos').textContent = 'COP '+ingr.toLocaleString('es-CO');
  document.getElementById('total-gastos').textContent   = 'COP '+gast.toLocaleString('es-CO');
  document.getElementById('saldo-neto').textContent     = 'COP '+(ingr-gast).toLocaleString('es-CO');
  const ul = document.getElementById('list-movimientos');
  ul.innerHTML = '';
  if (movs.length===0) {
    const li=document.createElement('li');
    li.innerHTML='<span class="empty-msg">Sin movimientos'+(filterDay?' el día '+filterDay:'')+'</span>';
    ul.appendChild(li); return;
  }
  movs.sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(m => {
    const li=document.createElement('li');
    li.className='movement-'+m.type;
    li.innerHTML=
      '<span class="m-date">'+new Date(m.date).getDate()+'</span>'+
      '<span class="m-cat">'+escHtml(m.category)+'</span>'+
      '<span class="m-desc">'+escHtml(m.description||'')+'</span>'+
      '<span class="m-amount">'+(m.type==='ingreso'?'+':'-')+' COP '+m.amount.toLocaleString('es-CO')+'</span>'+
      '<button class="btn-delete-mov" title="Eliminar">&#128465;</button>';
    li.querySelector('.btn-delete-mov').addEventListener('click',()=>confirmarEliminar(m.id));
    ul.appendChild(li);
  });
}

function renderCategorySelect(selId) {
  const sel=document.getElementById(selId), prev=sel.value; sel.innerHTML='';
  categories.forEach(c=>{const o=document.createElement('option');o.value=o.textContent=c;sel.appendChild(o);});
  if(categories.includes(prev)) sel.value=prev;
}
function renderCatList() {
  const container=document.getElementById('cat-list'); container.innerHTML='';
  categories.forEach((cat,i)=>{
    const div=document.createElement('div');
    div.className='cat-item'; div.draggable=true; div.dataset.index=i;
    div.innerHTML='<span class="drag-handle">&#9776;</span><span class="cat-name">'+escHtml(cat)+'</span><button class="btn-delete-cat">&#128465;</button>';
    div.addEventListener('dragstart',()=>{dragSrcIndex=i;setTimeout(()=>div.classList.add('dragging'),0);});
    div.addEventListener('dragend',()=>{div.classList.remove('dragging');document.querySelectorAll('.cat-item').forEach(el=>el.classList.remove('drag-over'));});
    div.addEventListener('dragover',e=>{e.preventDefault();document.querySelectorAll('.cat-item').forEach(el=>el.classList.remove('drag-over'));div.classList.add('drag-over');});
    div.addEventListener('drop',e=>{e.preventDefault();const to=parseInt(div.dataset.index);if(dragSrcIndex!==null&&dragSrcIndex!==to){const[mv]=categories.splice(dragSrcIndex,1);categories.splice(to,0,mv);dragSrcIndex=null;save();renderCatList();renderCategorySelect('inp-category');}});
    div.querySelector('.btn-delete-cat').addEventListener('click',()=>{categories.splice(i,1);save();renderCatList();renderCategorySelect('inp-category');});
    container.appendChild(div);
  });
}

// ─── ELIMINAR ─────────────────────────────────────────────
function confirmarEliminar(id) {
  const m=movements.find(x=>x.id===id); if(!m) return;
  pendingDeleteId=id;
  const day=new Date(m.date).toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('confirm-detail').innerHTML=
    '<strong>'+(m.type==='ingreso'?'+ Ingreso':'- Gasto')+'</strong><br>'+
    'Monto: COP '+m.amount.toLocaleString('es-CO')+'<br>'+
    'Categoría: '+escHtml(m.category)+'<br>'+
    'Descripción: '+escHtml(m.description||'—')+'<br>'+
    'Fecha: '+day;
  openModal('modal-confirmar');
}
document.getElementById('btn-si-eliminar').addEventListener('click',()=>{
  if(pendingDeleteId!==null){ movements=movements.filter(m=>m.id!==pendingDeleteId); pendingDeleteId=null; save(); closeModal('modal-confirmar'); renderMovimientos(); }
});
document.getElementById('btn-no-eliminar').addEventListener('click',()=>{pendingDeleteId=null;closeModal('modal-confirmar');});
document.getElementById('close-confirmar').addEventListener('click',()=>{pendingDeleteId=null;closeModal('modal-confirmar');});

// ─── MODAL REGISTRO MANUAL ────────────────────────────────
document.getElementById('btn-add').addEventListener('click',()=>{
  document.getElementById('inp-amount').value=''; document.getElementById('inp-description').value='';
  selectedType='ingreso';
  document.getElementById('btn-ingreso').classList.add('active'); document.getElementById('btn-gasto').classList.remove('active');
  renderCategorySelect('inp-category'); openModal('modal-registro');
  setTimeout(()=>document.getElementById('inp-amount').focus(),200);
});
document.getElementById('close-registro').addEventListener('click',()=>closeModal('modal-registro'));
document.getElementById('btn-cancelar').addEventListener('click',()=>closeModal('modal-registro'));
document.getElementById('btn-ingreso').addEventListener('click',()=>{selectedType='ingreso';document.getElementById('btn-ingreso').classList.add('active');document.getElementById('btn-gasto').classList.remove('active');});
document.getElementById('btn-gasto').addEventListener('click',()=>{selectedType='gasto';document.getElementById('btn-gasto').classList.add('active');document.getElementById('btn-ingreso').classList.remove('active');});
document.getElementById('btn-guardar').addEventListener('click',()=>{
  const raw=document.getElementById('inp-amount').value.trim(), amount=parseFloat(raw);
  if(!raw||isNaN(amount)||amount<=0){alert('Ingresa un monto valido');return;}
  const category=document.getElementById('inp-category').value;
  const desc=document.getElementById('inp-description').value.trim();
  movements.push({id:Date.now(),amount,type:selectedType,category,description:desc,date:new Date().toISOString()});
  save(); closeModal('modal-registro'); renderMovimientos();
});

// ─── CATEGORIAS ───────────────────────────────────────────
document.getElementById('btn-gear').addEventListener('click',()=>{renderCatList();openModal('modal-categorias');});
document.getElementById('close-categorias').addEventListener('click',()=>closeModal('modal-categorias'));
document.getElementById('close-categorias-2').addEventListener('click',()=>closeModal('modal-categorias'));
document.getElementById('btn-agregar-cat').addEventListener('click',agregarCat);
document.getElementById('inp-new-cat').addEventListener('keypress',e=>{if(e.key==='Enter')agregarCat();});
function agregarCat(){
  const inp=document.getElementById('inp-new-cat'),name=inp.value.trim(); if(name.length<2) return;
  if(categories.map(c=>c.toLowerCase()).includes(name.toLowerCase())){alert('Esa categoria ya existe');return;}
  categories.push(name); inp.value=''; save(); renderCatList(); renderCategorySelect('inp-category');
}

// ─── FILTRO DÍA ───────────────────────────────────────────
document.getElementById('btn-todo-mes').addEventListener('click',()=>{
  filterDay=null; document.getElementById('inp-dia').value='';
  document.getElementById('btn-todo-mes').classList.add('active');
  document.getElementById('btn-buscar-dia').classList.remove('active');
  renderMovimientos();
});
document.getElementById('btn-buscar-dia').addEventListener('click',()=>{
  const val=parseInt(document.getElementById('inp-dia').value);
  if(isNaN(val)||val<1||val>31){alert('Ingresa un día válido entre 1 y 31');return;}
  filterDay=val; document.getElementById('btn-buscar-dia').classList.add('active');
  document.getElementById('btn-todo-mes').classList.remove('active'); renderMovimientos();
});
document.getElementById('inp-dia').addEventListener('keypress',e=>{if(e.key==='Enter')document.getElementById('btn-buscar-dia').click();});
function cambiarMes(delta){
  currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+delta);
  filterDay=null; document.getElementById('inp-dia').value='';
  document.getElementById('btn-todo-mes').classList.add('active');
  document.getElementById('btn-buscar-dia').classList.remove('active');
  renderMovimientos();
}
document.getElementById('btn-prev').addEventListener('click',()=>cambiarMes(-1));
document.getElementById('btn-next').addEventListener('click',()=>cambiarMes(1));

// ─── GEMINI API KEY CONFIG ────────────────────────────────
function renderKeyStatus() {
  const banner = document.getElementById('key-banner');
  if (geminiKey) {
    banner.innerHTML = '<span class="key-ok-badge">🔑 API Key configurada</span> <button onclick="changeKey()">Cambiar</button>';
    banner.style.background = 'rgba(16,185,129,0.08)';
    banner.style.borderColor = 'rgba(16,185,129,0.25)';
  } else {
    banner.innerHTML = '<span>⚠️ Necesitas configurar tu Gemini API Key para usar la voz</span><button onclick="openModal('modal-apikey')">Configurar</button>';
    banner.style.background = 'rgba(239,68,68,0.1)';
    banner.style.borderColor = 'rgba(239,68,68,0.3)';
  }
}
function changeKey() {
  document.getElementById('inp-apikey').value = geminiKey;
  openModal('modal-apikey');
}
document.getElementById('btn-save-key').addEventListener('click',()=>{
  const k = document.getElementById('inp-apikey').value.trim();
  if (!k) { alert('Ingresa una API Key válida'); return; }
  geminiKey = k;
  localStorage.setItem('geminiKey', k);
  closeModal('modal-apikey');
  renderKeyStatus();
  alert('✅ API Key guardada correctamente');
});
document.getElementById('close-apikey').addEventListener('click',()=>closeModal('modal-apikey'));

// ─── VOZ — WEB SPEECH API ─────────────────────────────────
document.getElementById('btn-voice').addEventListener('click',()=>{
  if (!geminiKey) { openModal('modal-apikey'); return; }
  if (isRecording) { stopRecording(); return; }
  startRecording();
});

function startRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { alert('Tu navegador no soporta grabación de voz. Usa Chrome.'); return; }
  recognition = new SpeechRecognition();
  recognition.lang = 'es-CO';
  recognition.continuous = false;
  recognition.interimResults = true;
  isRecording = true;
  document.getElementById('btn-voice').classList.add('recording');
  document.getElementById('voice-transcript').textContent = '';
  document.getElementById('voice-status').textContent = '🎙️ Escuchando... habla ahora';
  document.getElementById('voice-result-box').style.display = 'none';
  openModal('modal-voz');

  recognition.onresult = e => {
    const transcript = Array.from(e.results).map(r=>r[0].transcript).join('');
    document.getElementById('voice-transcript').textContent = transcript;
    lastTranscript = transcript;
  };
  recognition.onend = () => {
    isRecording = false;
    document.getElementById('btn-voice').classList.remove('recording');
    if (lastTranscript) {
      document.getElementById('voice-status').textContent = '⏳ Procesando con Gemini...';
      processWithGemini(lastTranscript);
    } else {
      document.getElementById('voice-status').textContent = 'No se detectó voz. Intenta de nuevo.';
    }
  };
  recognition.onerror = e => {
    isRecording = false;
    document.getElementById('btn-voice').classList.remove('recording');
    document.getElementById('voice-status').textContent = 'Error: ' + e.error + '. Intenta de nuevo.';
  };
  recognition.start();
}

function stopRecording() {
  if (recognition) recognition.stop();
}

async function processWithGemini(transcript) {
  const catList = categories.join(', ');
  const prompt = `Eres un asistente de finanzas personales. Analiza este texto en español y extrae la información de un movimiento financiero.

Texto: "${transcript}"

Categorías disponibles: ${catList}

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta (sin markdown, sin explicaciones):
{
  "type": "gasto" o "ingreso",
  "amount": número en pesos colombianos (solo el número, sin puntos ni comas),
  "category": "una de las categorías disponibles o la más cercana",
  "description": "descripción corta en máximo 6 palabras"
}

Reglas:
- Si dice "gasté", "pagué", "compré", "salió" → type: "gasto"
- Si dice "recibí", "me pagaron", "gané", "ingresó" → type: "ingreso"
- Convierte palabras a números: "cincuenta mil" → 50000, "dos millones" → 2000000
- Si no puedes identificar el monto, pon 0
- Elige la categoría más cercana de la lista disponible`;

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiKey,
      {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          contents: [{parts: [{text: prompt}]}],
          generationConfig: {temperature: 0.1, maxOutputTokens: 200}
        })
      }
    );
    const data = await res.json();
    if (data.error) { throw new Error(data.error.message); }
    const raw = data.candidates[0].content.parts[0].text.trim();
    const clean = raw.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(clean);
    showVoiceResult(parsed);
  } catch(err) {
    document.getElementById('voice-status').textContent = '❌ Error: ' + err.message;
  }
}

function showVoiceResult(data) {
  document.getElementById('voice-status').textContent = '✅ Listo. Confirma el registro:';
  const box = document.getElementById('voice-result-box');
  box.style.display = 'block';
  box.innerHTML =
    '<div class="voice-result">'+
    '<div class="vr-row"><span class="vr-label">Tipo</span><span class="vr-value" style="color:'+(data.type==='ingreso'?'var(--green)':'var(--red)') +'">'+(data.type==='ingreso'?'+ Ingreso':'- Gasto')+'</span></div>'+
    '<div class="vr-row"><span class="vr-label">Monto</span><span class="vr-value">COP '+Number(data.amount).toLocaleString('es-CO')+'</span></div>'+
    '<div class="vr-row"><span class="vr-label">Categoría</span><span class="vr-value">'+escHtml(data.category)+'</span></div>'+
    '<div class="vr-row"><span class="vr-label">Descripción</span><span class="vr-value">'+escHtml(data.description)+'</span></div>'+
    '</div>'+
    '<div style="display:flex;gap:12px;">'+
    '<button class="btn-secundario" style="flex:1" onclick="closeModal('modal-voz')">Cancelar</button>'+
    '<button class="btn-primario" style="flex:1" onclick="saveVoiceMovement('+JSON.stringify(data).replace(/"/g,'&quot;')+'  )">Guardar</button>'+
    '</div>';
}

function saveVoiceMovement(data) {
  if (!data.amount || data.amount <= 0) { alert('No se detectó un monto válido. Intenta de nuevo.'); return; }
  movements.push({id:Date.now(), amount:Number(data.amount), type:data.type, category:data.category, description:data.description, date:new Date().toISOString()});
  save(); closeModal('modal-voz'); renderMovimientos();
  lastTranscript = '';
}

document.getElementById('close-voz').addEventListener('click',()=>{
  if(recognition) recognition.stop();
  closeModal('modal-voz');
  lastTranscript='';
});
document.getElementById('btn-retry-voice').addEventListener('click',()=>{
  lastTranscript='';
  document.getElementById('voice-transcript').textContent='';
  document.getElementById('voice-result-box').style.display='none';
  document.getElementById('voice-status').textContent='';
  startRecording();
});

// ─── INICIO ───────────────────────────────────────────────
renderMovimientos();
renderCategorySelect('inp-category');
renderKeyStatus();
