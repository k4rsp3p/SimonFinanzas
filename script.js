if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

let movements    = JSON.parse(localStorage.getItem('movements'))  || [];
let categories   = JSON.parse(localStorage.getItem('categories')) || ['Gasolina','Comida','Ingreso','Transporte','Otros'];
let currentMonth = new Date();
let selectedType = 'ingreso';
let filterDay    = null;
let dragSrcIndex = null;
let pendingDeleteId = null;

function save() {
  localStorage.setItem('movements',  JSON.stringify(movements));
  localStorage.setItem('categories', JSON.stringify(categories));
}
function getMonthKey(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function formatMonthLabel(d) { return d.toLocaleDateString('es-CO',{month:'long',year:'numeric'}); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
    const day=new Date(m.date).getDate();
    li.innerHTML=
      '<span class="m-date">'+day+'</span>'+
      '<span class="m-cat">'+escHtml(m.category)+'</span>'+
      '<span class="m-desc">'+escHtml(m.description||'')+'</span>'+
      '<span class="m-amount">'+(m.type==='ingreso'?'+':'-')+' COP '+m.amount.toLocaleString('es-CO')+'</span>'+
      '<button class="btn-delete-mov" data-id="'+m.id+'" title="Eliminar">&#128465;</button>';
    li.querySelector('.btn-delete-mov').addEventListener('click',()=>confirmarEliminar(m.id));
    ul.appendChild(li);
  });
}

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

function renderCategorySelect() {
  const sel=document.getElementById('inp-category'),prev=sel.value; sel.innerHTML='';
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
    div.addEventListener('drop',e=>{e.preventDefault();const to=parseInt(div.dataset.index);if(dragSrcIndex!==null&&dragSrcIndex!==to){const[mv]=categories.splice(dragSrcIndex,1);categories.splice(to,0,mv);dragSrcIndex=null;save();renderCatList();renderCategorySelect();}});
    div.querySelector('.btn-delete-cat').addEventListener('click',()=>{categories.splice(i,1);save();renderCatList();renderCategorySelect();});
    container.appendChild(div);
  });
}
function openModal(id)  {document.getElementById(id).classList.add('open');}
function closeModal(id) {document.getElementById(id).classList.remove('open');}

document.getElementById('btn-add').addEventListener('click',()=>{
  document.getElementById('inp-amount').value=''; document.getElementById('inp-description').value='';
  selectedType='ingreso'; document.getElementById('btn-ingreso').classList.add('active'); document.getElementById('btn-gasto').classList.remove('active');
  renderCategorySelect(); openModal('modal-registro');
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
document.getElementById('btn-gear').addEventListener('click',()=>{renderCatList();openModal('modal-categorias');});
document.getElementById('close-categorias').addEventListener('click',()=>closeModal('modal-categorias'));
document.getElementById('close-categorias-2').addEventListener('click',()=>closeModal('modal-categorias'));
document.getElementById('btn-agregar-cat').addEventListener('click',agregarCat);
document.getElementById('inp-new-cat').addEventListener('keypress',e=>{if(e.key==='Enter')agregarCat();});
function agregarCat(){
  const inp=document.getElementById('inp-new-cat'),name=inp.value.trim(); if(name.length<2) return;
  if(categories.map(c=>c.toLowerCase()).includes(name.toLowerCase())){alert('Esa categoria ya existe');return;}
  categories.push(name); inp.value=''; save(); renderCatList(); renderCategorySelect();
}
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
renderMovimientos(); renderCategorySelect();