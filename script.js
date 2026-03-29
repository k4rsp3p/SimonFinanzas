
// Limpiar service workers viejos
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
  navigator.serviceWorker.register('./sw.js');
}

// ─── ESTADO ──────────────────────────────────────────────
var movements    = JSON.parse(localStorage.getItem('movements'))  || [];
var categories   = JSON.parse(localStorage.getItem('categories')) || ['Gasolina','Comida','Ingreso','Transporte','Otros'];
var currentMonth = new Date();
var selectedType = 'ingreso';
var filterDay    = null;
var dragSrcIndex = null;
var pendingDeleteId = null;
var geminiKey    = localStorage.getItem('geminiKey') || '';
var recognition  = null;
var isRecording  = false;
var lastTranscript = '';

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

// ─── RENDER PRINCIPAL ─────────────────────────────────────
function renderMovimientos() {
  var key = getMonthKey(currentMonth);
  var movs = movements.filter(function(m){ return getMonthKey(new Date(m.date))===key; });
  if (filterDay!==null) movs = movs.filter(function(m){ return new Date(m.date).getDate()===filterDay; });
  var ingr = movs.filter(function(m){return m.type==='ingreso';}).reduce(function(s,m){return s+m.amount;},0);
  var gast = movs.filter(function(m){return m.type==='gasto';}).reduce(function(s,m){return s+m.amount;},0);
  document.getElementById('current-month').textContent  = formatMonthLabel(currentMonth);
  document.getElementById('total-ingresos').textContent = 'COP '+ingr.toLocaleString('es-CO');
  document.getElementById('total-gastos').textContent   = 'COP '+gast.toLocaleString('es-CO');
  document.getElementById('saldo-neto').textContent     = 'COP '+(ingr-gast).toLocaleString('es-CO');
  var ul = document.getElementById('list-movimientos');
  ul.innerHTML = '';
  if (movs.length===0) {
    var li=document.createElement('li');
    li.innerHTML='<span class="empty-msg">Sin movimientos'+(filterDay?' el día '+filterDay:'')+'</span>';
    ul.appendChild(li); return;
  }
  movs.sort(function(a,b){return new Date(b.date)-new Date(a.date);}).forEach(function(m) {
    var li=document.createElement('li');
    li.className='movement-'+m.type;
    li.innerHTML=
      '<span class="m-date">'+new Date(m.date).getDate()+'</span>'+
      '<span class="m-cat">'+escHtml(m.category)+'</span>'+
      '<span class="m-desc">'+escHtml(m.description||'')+'</span>'+
      '<span class="m-amount">'+(m.type==='ingreso'?'+':'-')+' COP '+m.amount.toLocaleString('es-CO')+'</span>'+
      '<button class="btn-delete-mov">🗑</button>';
    li.querySelector('.btn-delete-mov').addEventListener('click',function(){ confirmarEliminar(m.id); });
    ul.appendChild(li);
  });
}

// ─── CATEGORIAS SELECT ────────────────────────────────────
function renderCategorySelect(selId) {
  var sel=document.getElementById(selId), prev=sel.value;
  sel.innerHTML='';
  categories.forEach(function(c){
    var o=document.createElement('option'); o.value=o.textContent=c; sel.appendChild(o);
  });
  if(categories.includes(prev)) sel.value=prev;
}

// ─── CATEGORIAS LISTA ─────────────────────────────────────
function renderCatList() {
  var container=document.getElementById('cat-list'); container.innerHTML='';
  categories.forEach(function(cat,i){
    var div=document.createElement('div');
    div.className='cat-item'; div.draggable=true; div.dataset.index=i;
    div.innerHTML='<span class="drag-handle">☰</span><span class="cat-name">'+escHtml(cat)+'</span><button class="btn-delete-cat">🗑</button>';
    div.addEventListener('dragstart',function(){dragSrcIndex=i;setTimeout(function(){div.classList.add('dragging');},0);});
    div.addEventListener('dragend',function(){div.classList.remove('dragging');document.querySelectorAll('.cat-item').forEach(function(el){el.classList.remove('drag-over');});});
    div.addEventListener('dragover',function(e){e.preventDefault();document.querySelectorAll('.cat-item').forEach(function(el){el.classList.remove('drag-over');});div.classList.add('drag-over');});
    div.addEventListener('drop',function(e){
      e.preventDefault();
      var to=parseInt(div.dataset.index);
      if(dragSrcIndex!==null&&dragSrcIndex!==to){
        var mv=categories.splice(dragSrcIndex,1)[0];
        categories.splice(to,0,mv);
        dragSrcIndex=null; save(); renderCatList(); renderCategorySelect('inp-category');
      }
    });
    div.querySelector('.btn-delete-cat').addEventListener('click',function(){
      categories.splice(i,1); save(); renderCatList(); renderCategorySelect('inp-category');
    });
    container.appendChild(div);
  });
}

// ─── ELIMINAR CON CONFIRMACION ────────────────────────────
function confirmarEliminar(id) {
  var m=movements.find(function(x){return x.id===id;}); if(!m) return;
  pendingDeleteId=id;
  var day=new Date(m.date).toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('confirm-detail').innerHTML=
    '<strong>'+(m.type==='ingreso'?'+ Ingreso':'- Gasto')+'</strong><br>'+
    'Monto: COP '+m.amount.toLocaleString('es-CO')+'<br>'+
    'Categoría: '+escHtml(m.category)+'<br>'+
    'Descripción: '+escHtml(m.description||'—')+'<br>'+
    'Fecha: '+day;
  openModal('modal-confirmar');
}
document.getElementById('btn-si-eliminar').addEventListener('click',function(){
  if(pendingDeleteId!==null){
    movements=movements.filter(function(m){return m.id!==pendingDeleteId;});
    pendingDeleteId=null; save(); closeModal('modal-confirmar'); renderMovimientos();
  }
});
document.getElementById('btn-no-eliminar').addEventListener('click',function(){pendingDeleteId=null;closeModal('modal-confirmar');});
document.getElementById('close-confirmar').addEventListener('click',function(){pendingDeleteId=null;closeModal('modal-confirmar');});

// ─── MODAL REGISTRO MANUAL ────────────────────────────────
document.getElementById('btn-add').addEventListener('click',function(){
  document.getElementById('inp-amount').value='';
  document.getElementById('inp-description').value='';
  selectedType='ingreso';
  document.getElementById('btn-ingreso').classList.add('active');
  document.getElementById('btn-gasto').classList.remove('active');
  renderCategorySelect('inp-category');
  openModal('modal-registro');
  setTimeout(function(){document.getElementById('inp-amount').focus();},200);
});
document.getElementById('close-registro').addEventListener('click',function(){closeModal('modal-registro');});
document.getElementById('btn-cancelar').addEventListener('click',function(){closeModal('modal-registro');});
document.getElementById('btn-ingreso').addEventListener('click',function(){
  selectedType='ingreso';
  document.getElementById('btn-ingreso').classList.add('active');
  document.getElementById('btn-gasto').classList.remove('active');
});
document.getElementById('btn-gasto').addEventListener('click',function(){
  selectedType='gasto';
  document.getElementById('btn-gasto').classList.add('active');
  document.getElementById('btn-ingreso').classList.remove('active');
});
document.getElementById('btn-guardar').addEventListener('click',function(){
  var raw=document.getElementById('inp-amount').value.trim();
  var amount=parseFloat(raw);
  if(!raw||isNaN(amount)||amount<=0){alert('Ingresa un monto valido');return;}
  var category=document.getElementById('inp-category').value;
  var desc=document.getElementById('inp-description').value.trim();
  movements.push({id:Date.now(),amount:amount,type:selectedType,category:category,description:desc,date:new Date().toISOString()});
  save(); closeModal('modal-registro'); renderMovimientos();
});

// ─── MODAL CATEGORIAS ─────────────────────────────────────
document.getElementById('btn-gear').addEventListener('click',function(){renderCatList();openModal('modal-categorias');});
document.getElementById('close-categorias').addEventListener('click',function(){closeModal('modal-categorias');});
document.getElementById('close-categorias-2').addEventListener('click',function(){closeModal('modal-categorias');});
document.getElementById('btn-agregar-cat').addEventListener('click',agregarCat);
document.getElementById('inp-new-cat').addEventListener('keypress',function(e){if(e.key==='Enter')agregarCat();});
function agregarCat(){
  var inp=document.getElementById('inp-new-cat'), name=inp.value.trim();
  if(name.length<2) return;
  if(categories.map(function(c){return c.toLowerCase();}).includes(name.toLowerCase())){alert('Esa categoria ya existe');return;}
  categories.push(name); inp.value=''; save(); renderCatList(); renderCategorySelect('inp-category');
}

// ─── FILTRO DÍA ───────────────────────────────────────────
document.getElementById('btn-todo-mes').addEventListener('click',function(){
  filterDay=null; document.getElementById('inp-dia').value='';
  document.getElementById('btn-todo-mes').classList.add('active');
  document.getElementById('btn-buscar-dia').classList.remove('active');
  renderMovimientos();
});
document.getElementById('btn-buscar-dia').addEventListener('click',function(){
  var val=parseInt(document.getElementById('inp-dia').value);
  if(isNaN(val)||val<1||val>31){alert('Ingresa un día válido entre 1 y 31');return;}
  filterDay=val;
  document.getElementById('btn-buscar-dia').classList.add('active');
  document.getElementById('btn-todo-mes').classList.remove('active');
  renderMovimientos();
});
document.getElementById('inp-dia').addEventListener('keypress',function(e){if(e.key==='Enter')document.getElementById('btn-buscar-dia').click();});

// ─── MESES ────────────────────────────────────────────────
function cambiarMes(delta){
  currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+delta);
  filterDay=null; document.getElementById('inp-dia').value='';
  document.getElementById('btn-todo-mes').classList.add('active');
  document.getElementById('btn-buscar-dia').classList.remove('active');
  renderMovimientos();
}
document.getElementById('btn-prev').addEventListener('click',function(){cambiarMes(-1);});
document.getElementById('btn-next').addEventListener('click',function(){cambiarMes(1);});

// ─── API KEY ──────────────────────────────────────────────
function renderKeyStatus() {
  var banner=document.getElementById('key-banner');
  if(geminiKey){
    banner.className='key-banner has-key';
    banner.innerHTML='<span>🔑 API Key configurada correctamente</span><button id="btn-change-key">Cambiar</button>';
    document.getElementById('btn-change-key').addEventListener('click',function(){
      document.getElementById('inp-apikey').value=geminiKey;
      openModal('modal-apikey');
    });
  } else {
    banner.className='key-banner no-key';
    banner.innerHTML='<span>⚠️ Configura tu Gemini API Key para usar la voz</span><button id="btn-open-key">Configurar</button>';
    document.getElementById('btn-open-key').addEventListener('click',function(){ openModal('modal-apikey'); });
  }
}
document.getElementById('btn-save-key').addEventListener('click',function(){
  var k=document.getElementById('inp-apikey').value.trim();
  if(!k){alert('Ingresa una API Key válida');return;}
  geminiKey=k; localStorage.setItem('geminiKey',k);
  closeModal('modal-apikey'); renderKeyStatus();
  alert('✅ API Key guardada correctamente');
});
document.getElementById('close-apikey').addEventListener('click',function(){closeModal('modal-apikey');});

// ─── VOZ ──────────────────────────────────────────────────
document.getElementById('btn-voice').addEventListener('click',function(){
  if(!geminiKey){openModal('modal-apikey');return;}
  if(isRecording){stopRecording();return;}
  startRecording();
});

function startRecording(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert('Tu navegador no soporta voz. Usa Chrome.');return;}
  recognition=new SR();
  recognition.lang='es-CO';
  recognition.continuous=false;
  recognition.interimResults=true;
  isRecording=true;
  lastTranscript='';
  document.getElementById('btn-voice').classList.add('recording');
  document.getElementById('voice-transcript-text').textContent='';
  document.getElementById('voice-status').textContent='🎙️ Escuchando... habla ahora';
  document.getElementById('voice-result-box').style.display='none';
  openModal('modal-voz');
  recognition.onresult=function(e){
    var t=Array.from(e.results).map(function(r){return r[0].transcript;}).join('');
    document.getElementById('voice-transcript-text').textContent=t;
    lastTranscript=t;
  };
  recognition.onend=function(){
    isRecording=false;
    document.getElementById('btn-voice').classList.remove('recording');
    if(lastTranscript){
      document.getElementById('voice-status').textContent='⏳ Procesando con Gemini...';
      processWithGemini(lastTranscript);
    } else {
      document.getElementById('voice-status').textContent='No se detectó voz. Intenta de nuevo.';
    }
  };
  recognition.onerror=function(e){
    isRecording=false;
    document.getElementById('btn-voice').classList.remove('recording');
    document.getElementById('voice-status').textContent='Error: '+e.error+'. Intenta de nuevo.';
  };
  recognition.start();
}

function stopRecording(){ if(recognition) recognition.stop(); }

function processWithGemini(transcript){
  var catList=categories.join(', ');
  var prompt='Eres un asistente de finanzas personales. Analiza este texto en español y extrae la información de un movimiento financiero.\n\nTexto: "'+transcript+'"\n\nCategorías disponibles: '+catList+'\n\nResponde ÚNICAMENTE con un JSON válido con esta estructura (sin markdown, sin explicaciones):\n{"type":"gasto o ingreso","amount":número,"category":"categoría","description":"descripción corta"}\n\nReglas:\n- gasté/pagué/compré → gasto. recibí/gané/me pagaron → ingreso\n- Convierte palabras a números: cincuenta mil → 50000\n- Si no hay monto claro pon 0\n- Usa la categoría más cercana de la lista';

  fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key='+geminiKey,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{temperature:0.1,maxOutputTokens:200}
    })
  })
  .then(function(r){return r.json();})
  .then(function(data){
    if(data.error) throw new Error(data.error.message);
    var raw=data.candidates[0].content.parts[0].text.trim();
    var clean=raw.replace(/```json|```/g,'').trim();
    var parsed=JSON.parse(clean);
    showVoiceResult(parsed);
  })
  .catch(function(err){
    document.getElementById('voice-status').textContent='❌ Error: '+err.message;
  });
}

function showVoiceResult(data){
  document.getElementById('voice-status').textContent='✅ Confirma el registro:';
  var box=document.getElementById('voice-result-box');
  box.style.display='block';
  box.innerHTML=
    '<div class="voice-result">'+
    '<div class="vr-row"><span class="vr-label">Tipo</span><span class="vr-value" style="color:'+(data.type==='ingreso'?'var(--green)':'var(--red)')+'">'+( data.type==='ingreso'?'+ Ingreso':'- Gasto')+'</span></div>'+
    '<div class="vr-row"><span class="vr-label">Monto</span><span class="vr-value">COP '+Number(data.amount).toLocaleString('es-CO')+'</span></div>'+
    '<div class="vr-row"><span class="vr-label">Categoría</span><span class="vr-value">'+escHtml(data.category)+'</span></div>'+
    '<div class="vr-row"><span class="vr-label">Descripción</span><span class="vr-value">'+escHtml(data.description)+'</span></div>'+
    '</div>'+
    '<div style="display:flex;gap:12px;margin-top:4px;">'+
    '<button id="btn-cancel-voice" class="btn-secundario">Cancelar</button>'+
    '<button id="btn-confirm-voice" class="btn-primario">Guardar</button>'+
    '</div>';
  document.getElementById('btn-cancel-voice').addEventListener('click',function(){closeModal('modal-voz');});
  document.getElementById('btn-confirm-voice').addEventListener('click',function(){saveVoiceMovement(data);});
}

function saveVoiceMovement(data){
  if(!data.amount||data.amount<=0){alert('No se detectó un monto válido.');return;}
  movements.push({id:Date.now(),amount:Number(data.amount),type:data.type,category:data.category,description:data.description,date:new Date().toISOString()});
  save(); closeModal('modal-voz'); renderMovimientos(); lastTranscript='';
}

document.getElementById('close-voz').addEventListener('click',function(){
  if(recognition) recognition.stop();
  isRecording=false;
  document.getElementById('btn-voice').classList.remove('recording');
  closeModal('modal-voz'); lastTranscript='';
});
document.getElementById('btn-retry-voice').addEventListener('click',function(){
  lastTranscript='';
  document.getElementById('voice-transcript-text').textContent='';
  document.getElementById('voice-result-box').style.display='none';
  document.getElementById('voice-status').textContent='';
  startRecording();
});

// ─── INICIO ───────────────────────────────────────────────
renderMovimientos();
renderCategorySelect('inp-category');
renderKeyStatus();
