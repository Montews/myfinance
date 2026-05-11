const API_URL = "https://script.google.com/macros/s/AKfycbxm2z43fEhKi_dlfYGryK5S-Q0ZkZ7c3Gf7jUWCcsw9JLDMNvvQ1cvVpRqCWzG_DltZ/exec";

let cPizza, cFluxo, cEficiencia, cResultado;
let dataGlobais = { gastos: [], faturas: [], assinaturas: [], contas: [], hist: [] };

let timelineMestra = [];
let state = { fluxo: 0, eficiencia: 0, resultado: 0 };
let calDetalhesMap = {};

let dataCal = new Date();
let dataCat = new Date();

let modoFluxo = 'AMBOS';
let modoDiario = 'GASTO';

const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

function getV(obj, chaves) {
    if (!obj) return null;
    let keys = Object.keys(obj);
    for (let c of chaves) {
        let target = c.toLowerCase().trim();
        let found = keys.find(k => k.toLowerCase().trim().replace(/;/g, '') === target);
        if (found && obj[found] !== undefined && obj[found] !== null && obj[found] !== '') {
            return obj[found];
        }
    }
    return null;
}

function parseMoeda(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    let s = String(v).trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
}

function fmt(v) { return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0); }

function extrairMesAno(dataStr) {
    if(!dataStr) return ""; let s = String(dataStr);
    if (s.includes('-')) { let p = s.split('-'); if (p.length >= 3) return `${p[1]}/${p[0]}`; }
    if (s.includes('/')) { let p = s.split('/'); if (p.length === 3) return `${p[1]}/${p[2]}`; if (p.length === 2) return `${p[0]}/${p[1]}`; }
    let d = new Date(dataStr); if (!isNaN(d)) return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    return "";
}

function extrairDia(dataStr) {
    if(!dataStr) return -1; let s = String(dataStr);
    if(s.includes('T')) s = s.split('T')[0];
    if(s.includes('-')) { let p = s.split('-'); if(p.length>=3) return parseInt(p[2]); }
    if(s.includes('/')) { let p = s.split('/'); if(p.length>=3) return parseInt(p[0]); }
    let d = new Date(dataStr); if(!isNaN(d)) return d.getDate();
    let num = parseInt(s); return isNaN(num) ? -1 : num;
}

function gerarLinhaDoTempo(chavesMesAnoSet) {
    let arr = Array.from(chavesMesAnoSet);
    let datas = [];
    arr.forEach(str => {
        let [m, y] = str.split('/'); let i = MESES.findIndex(x => x.startsWith(m));
        if(i === -1 || !y) return;
        let year = y.length === 2 ? parseInt("20" + y) : parseInt(y);
        if(year >= 2024 && year <= 2040) datas.push(new Date(year, i, 1));
    });
    if (datas.length === 0) return [];
    datas.sort((a,b) => a-b);
    let minD = datas[0]; let min = new Date(minD.getFullYear(), minD.getMonth() - 1, 1);
    let maxD = datas[datas.length - 1]; let max = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 1);
    let resultado = []; let atual = new Date(min);
    while (atual <= max) {
        resultado.push(`${MESES[atual.getMonth()]}/${String(atual.getFullYear()).slice(-2)}`);
        atual.setMonth(atual.getMonth() + 1);
    }
    return resultado;
}

function carregarTimelineMestra() {
    let mesesSet = new Set();
    dataGlobais.hist.forEach(h => {
        let m = String(getV(h, ['mes']) || '');
        if(m.includes('/')) { let p = m.split('/'); let ano = p[1].length === 4 ? p[1].slice(-2) : p[1]; mesesSet.add(`${p[0].toUpperCase()}/${ano}`); }
    });
    dataGlobais.gastos.forEach(g => {
        let d = getV(g, ['data']);
        if(d) { let m = extrairMesAno(d); if(m && m.includes('/')) { let p = m.split('/'); let i = parseInt(p[0]) - 1; if (i >= 0 && i < 12) { let ano = p[1].length === 4 ? p[1].slice(-2) : p[1]; mesesSet.add(`${MESES[i]}/${ano}`); } } }
    });
    timelineMestra = gerarLinhaDoTempo(mesesSet);
    state.fluxo = Math.max(0, timelineMestra.length - 5);
    state.eficiencia = Math.max(0, timelineMestra.length - 6);
    state.resultado = Math.max(0, timelineMestra.length - 6);
}

function atualizarBotoes(idLeft, idRight, currentIdx, windowSize) {
    let maxIdx = Math.max(0, timelineMestra.length - windowSize);
    let btnL = document.getElementById(idLeft); let btnR = document.getElementById(idRight);
    if(btnL) { btnL.disabled = (currentIdx <= 0); btnL.style.opacity = (currentIdx <= 0) ? '0.1' : '1'; btnL.style.cursor = (currentIdx <= 0) ? 'not-allowed' : 'pointer'; }
    if(btnR) { btnR.disabled = (currentIdx >= maxIdx); btnR.style.opacity = (currentIdx >= maxIdx) ? '0.1' : '1'; btnR.style.cursor = (currentIdx >= maxIdx) ? 'not-allowed' : 'pointer'; }
}

const tooltipPointValue = (isPercent = false, addLabel = false) => ({
    interaction: { mode: 'point', intersect: true },
    plugins: {
        legend: { display: false },
        tooltip: {
            displayColors: false,
            callbacks: {
                title: () => null,
                label: (ctx) => {
                    let textVal = isPercent ? `${fmt(ctx.raw)}%` : `R$ ${fmt(ctx.raw)}`;
                    if(addLabel) textVal = `${ctx.dataset.label}: ${textVal}`;
                    if (ctx.label && ctx.label.includes('/')) {
                        let partes = ctx.label.split('/'); let m = partes[0].toUpperCase(); let y = partes[1];
                        return [`${m}/${y}`, textVal];
                    }
                    return textVal;
                }
            },
            bodyFont: { weight: 'bold', size: 12 }, bodyAlign: 'center', padding: 10
        }
    },
    maintainAspectRatio: false, scales: { x: { grid: { display: false } } }
});

async function chamarMotor(tipoAcao, payload = {}) {
    const url = `${API_URL}?tipo=${tipoAcao}`;
    const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    return await response.json();
}

window.addEventListener('load', () => { carregarDashboard(); });

async function carregarDashboard() {
    atualizarStatus('conectando');
    try {
        const [rContas, rFat, rGastos, rHist] = await Promise.all([ fetch(`${API_URL}?tipo=contas_resumo`), fetch(`${API_URL}?tipo=faturas_resumo`), fetch(`${API_URL}?tipo=todos`), fetch(`${API_URL}?tipo=historico_resumo`) ]);
        dataGlobais.contas = await rContas.json() || []; dataGlobais.faturas = await rFat.json() || []; dataGlobais.gastos = await rGastos.json() || []; dataGlobais.hist = await rHist.json() || []; dataGlobais.assinaturas = await chamarMotor('obter_assinaturas') || [];
        carregarTimelineMestra(); esconderLoadings(); renderizarTudo(); atualizarStatus('sucesso');
    } catch (e) { console.error(e); atualizarStatus('erro'); }
}

function esconderLoadings() { document.querySelectorAll('.overlay-loading').forEach(el => el.style.display = 'none'); }

function renderizarTudo() {
    renderizarKPIs(); renderizarCategorias(); renderizarCalendario();
    renderizarFluxo(); renderizarProjecaoParcelas();
    renderizarHistoricoEficiencia(); renderizarHistoricoResultado();
}
function renderizarKPIs() {
    // 1. LIQUIDEZ IMEDIATA (Apenas o que está no Débito)
    let saldoImediato = dataGlobais.contas.reduce((a, b) => a + parseMoeda(getV(b, ['saldo_debito'])), 0);
    document.getElementById('kpi-patrimonio').innerText = fmt(saldoImediato);

    // 2. FATURAS ABERTAS
    let fatAberta = 0;
    let vencendoBreve = 0;
    const hj = new Date();
    const hjLimpo = new Date(hj.getFullYear(), hj.getMonth(), hj.getDate());

    dataGlobais.faturas.forEach(f => {
        let isPago = String(getV(f, ['status', 'situacao'])).toUpperCase() === 'PAGO';
        if (!isPago) {
            fatAberta += parseMoeda(getV(f, ['valor_total', 'valor', 'valor_fatura']));
            // Lógica de alerta de vencimento (mantida)
            let dVenc = parseInt(getV(f, ['dia_vencimento', 'dia_venc', 'dia']));
            if (isNaN(dVenc)) dVenc = extrairDia(getV(f, ['data_vencimento', 'vencimento', 'data']));
            if(dVenc > 0) {
                let dataV = new Date(hjLimpo.getFullYear(), hjLimpo.getMonth(), dVenc);
                let diffDias = Math.ceil((dataV.getTime() - hjLimpo.getTime()) / 86400000);
                if (diffDias >= 0 && diffDias <= 3) vencendoBreve++;
            }
        }
    });
    document.getElementById('kpi-faturas').innerText = fmt(fatAberta);

    // 3. CÁLCULO DO RUNWAY (Sobrevivência)
    // Pegamos a média de saídas do histórico (últimos 3 meses ou o que houver disponível)
    let historicoSaidas = dataGlobais.hist.filter(h => String(getV(h, ['fluxo'])).toUpperCase() === 'SAIDA');
    let mediaGastos = 0;
    if (historicoSaidas.length > 0) {
        let somaSaidas = historicoSaidas.slice(-3).reduce((a, b) => a + parseMoeda(getV(b, ['valor'])), 0);
        mediaGastos = somaSaidas / Math.min(historicoSaidas.length, 3);
    }

    let runway = 0;
    if (mediaGastos > 0) {
        runway = saldoImediato / mediaGastos;
    }
    // Mostra com 1 casa decimal (ex: 4.5 meses)
    document.getElementById('kpi-projecao').innerText = runway.toFixed(1);

    // 4. TAXA DE POUPANÇA (Mês Atual)
    const refBRReal = `${String(hj.getMonth() + 1).padStart(2, '0')}/${hj.getFullYear()}`;
    let entradasMes = dataGlobais.gastos.filter(g => String(getV(g, ['tipo'])||'').toUpperCase() === 'ENTRADA' && extrairMesAno(getV(g, ['data'])) === refBRReal).reduce((a,b) => a + parseMoeda(getV(b, ['valor'])), 0);
    let saidasMes = dataGlobais.gastos.filter(g => String(getV(g, ['tipo'])||'').toUpperCase() === 'SAIDA' && extrairMesAno(getV(g, ['data'])) === refBRReal).reduce((a,b) => a + parseMoeda(getV(b, ['valor'])), 0);

    let txPoupanca = 0;
    if (entradasMes > 0 && entradasMes > saidasMes) { txPoupanca = ((entradasMes - saidasMes) / entradasMes) * 100; }
    document.getElementById('kpi-poupanca').innerText = Math.round(txPoupanca);

    // Alerta inteligente (mantido)
    const alertaBox = document.getElementById('alerta-inteligente');
    if(alertaBox) {
        if(vencendoBreve > 0) {
            document.getElementById('alerta-texto').innerText = `Você tem ${vencendoBreve} fatura(s) vencendo nos próximos 3 dias.`;
            alertaBox.classList.remove('hidden');
        } else { alertaBox.classList.add('hidden'); }
    }
}


function mudarMesCalendario(d) { dataCal.setMonth(dataCal.getMonth() + d); renderizarCalendario(); }

function setModoDiario(modo) {
    modoDiario = modo;
    ['btn-dia-entrada', 'btn-dia-gasto'].forEach(id => {
        document.getElementById(id).classList.remove('bg-white', 'text-indigo-700');
        document.getElementById(id).classList.add('text-indigo-100');
    });
    let activeId = modo === 'ENTRADA' ? 'btn-dia-entrada' : 'btn-dia-gasto';
    document.getElementById(activeId).classList.add('bg-white', 'text-indigo-700');
    document.getElementById(activeId).classList.remove('text-indigo-100');
    renderizarCalendario();
}

function renderizarCalendario() {
    const grid = document.getElementById('calendar-grid');
    const mes = dataCal.getMonth(); const ano = dataCal.getFullYear();
    document.getElementById('cal-titulo').innerText = `${MESES[mes]} ${ano}`;
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const start = new Date(ano, mes, 1).getDay(); const hj = new Date();
    document.getElementById('area-faturas-clique').classList.add('hidden'); // Começa escondido
    let ent = Array(diasNoMes).fill(0); let sai = Array(diasNoMes).fill(0);
    const refBR = `${String(mes + 1).padStart(2, '0')}/${ano}`;
    dataGlobais.gastos.forEach(g => {
        let d = getV(g, ['data']); if(!d) return;
        if (extrairMesAno(d) === refBR) {
            let dia = extrairDia(d);
            if(dia >= 1 && dia <= diasNoMes) {
                let tipo = String(getV(g, ['tipo'])||'').toUpperCase(); let val = parseMoeda(getV(g, ['valor']));
                if (tipo === 'ENTRADA') ent[dia-1] += val;
                if (tipo === 'SAIDA') sai[dia-1] += val;
            }
        }
    });
    let vals = []; let maxVal = 0;
    for(let i=0; i<diasNoMes; i++) {
        let v = modoDiario === 'ENTRADA' ? ent[i] : sai[i];
        vals.push(v); if(Math.abs(v) > maxVal) maxVal = Math.abs(v);
    }
    if(maxVal === 0) maxVal = 1;
    let faturasDesteMes = [];
    let mesCurto = MESES[mes].substring(0,3).toLowerCase();
    dataGlobais.faturas.forEach(f => {
        let isMes = false;
        let valData = getV(f, ['data_vencimento', 'vencimento', 'data']);
        let valMesStr = getV(f, ['mes_fatura', 'mes']);
        let valDia = getV(f, ['dia_vencimento', 'dia_venc', 'dia']);
        let diaVenc = -1;
        if (valDia) diaVenc = parseInt(valDia);
        if (isNaN(diaVenc) || diaVenc < 1) diaVenc = extrairDia(valData);
        if (isNaN(diaVenc) || diaVenc < 1) diaVenc = extrairDia(valMesStr);
        if (valMesStr) { let str = String(valMesStr).toLowerCase(); if (str.includes(mesCurto) || str.includes(refBR)) isMes = true; }
        if (!isMes && valData) { if (extrairMesAno(valData) === refBR) isMes = true; }
        if (isMes && diaVenc >= 1 && diaVenc <= 31) {
            faturasDesteMes.push({ dia: diaVenc, nome: getV(f, ['cartao', 'conta', 'nome', 'descricao', 'fatura']) || 'Fatura', valor: parseMoeda(getV(f, ['valor_total', 'valor', 'valor_fatura'])), pago: String(getV(f, ['status', 'situacao'])).toUpperCase() === 'PAGO' });
        }
    });
    let assinaturasDesteMes = [];
    dataGlobais.assinaturas.forEach(a => {
        let status = String(getV(a, ['status', 'situacao']) || '').toUpperCase();
        if (status === 'ATIVO' || status === 'ATIVA') {
            assinaturasDesteMes.push({ dia: parseInt(getV(a, ['dia_vencimento', 'dia'])), nome: getV(a, ['nome', 'descricao']) || 'Assinatura', valor: parseMoeda(getV(a, ['valor'])), pago: a.pago_este_mes === true || String(a.pago_este_mes).toUpperCase() === 'SIM' });
        }
    });
    calDetalhesMap = {}; let html = ''; for(let i=0; i<start; i++) html += '<div></div>';
    for(let d=1; d<=diasNoMes; d++) {
        let itens = faturasDesteMes.filter(f => f.dia === d).concat(assinaturasDesteMes.filter(a => a.dia === d));
        let v = vals[d-1]; let absV = Math.abs(v); let intensity = 0;
        if (absV > 0) { let logVal = Math.log10(absV + 1); let logMax = Math.log10(maxVal + 1); intensity = 0.15 + (logVal / logMax) * 0.85; }
        let bg = '#f8fafc'; let textColor = '#64748b'; let borderCss = 'border: 1px solid #f1f5f9;';
        if (v !== 0) { textColor = '#ffffff'; bg = modoDiario === 'ENTRADA' ? `rgba(16, 185, 129, ${intensity})` : `rgba(239, 68, 68, ${intensity})`; borderCss = `border: 1px solid ${bg};`; }
        let indicador = '';
        if (itens.length > 0) {
            let todosPagos = itens.every(x => x.pago === true);
            if(todosPagos) { borderCss = `border: 2px solid #10b981; indicador = '<div class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border border-white"></div>';` }
            else { let diff = Math.ceil((new Date(ano, mes, d).getTime() - hj.getTime()) / 86400000); let isCritico = (diff >= 0 && diff <= 3); borderCss = `border: 2px solid ${isCritico ? '#ef4444' : '#f59e0b'};`; indicador = `<div class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 ${isCritico ? 'bg-red-500 animate-pulse' : 'bg-orange-500'} rounded-full border border-white shadow-sm"></div>`; }
        } else if (d === hj.getDate() && mes === hj.getMonth() && ano === hj.getFullYear()) { borderCss = `border: 2px solid #1e293b;`; }
        calDetalhesMap[d] = { faturas: itens, fluxo: { ent: ent[d-1], sai: sai[d-1] } };
        html += `<div onclick="abrirDiaInline(this, ${d})" class="cal-day relative" style="background-color: ${bg}; ${borderCss} color: ${textColor};">${d}${indicador}</div>`;
    }
    grid.innerHTML = html;
}


// ... (mantenha o início do arquivo igual até a função abrirDiaInline)

window.abrirDiaInline = function(el, dia) {
    document.querySelectorAll('.cal-day').forEach(d => d.style.boxShadow = 'none');
    if (el) el.style.boxShadow = '0 0 0 3px #c7d2fe';
    const dados = calDetalhesMap[dia] || { faturas: [], fluxo: { ent: 0, sai: 0 } };
    document.getElementById('cal-detalhes-titulo').innerText = `DIA ${String(dia).padStart(2, '0')} DE ${document.getElementById('cal-titulo').innerText}`;
    document.getElementById('cal-valor-entrada').innerText = `R$ ${fmt(dados.fluxo.ent)}`;
    document.getElementById('cal-valor-gasto').innerText = `R$ ${fmt(dados.fluxo.sai)}`;
    let saldoVal = dados.fluxo.ent - dados.fluxo.sai;
    let saldoEl = document.getElementById('cal-valor-saldo');
    saldoEl.innerText = `R$ ${fmt(saldoVal)}`;
    saldoEl.className = `text-sm lg:text-base font-black ${saldoVal > 0 ? 'text-blue-600' : (saldoVal < 0 ? 'text-orange-600' : 'text-slate-600')}`;

    const areaFaturas = document.getElementById('area-faturas-clique');
    const lista = document.getElementById('cal-detalhes-lista');
    const quadro = document.getElementById('calendar-grid').closest('.bg-white');

    if (dados.faturas && dados.faturas.length > 0) {
        areaFaturas.classList.remove('hidden');
        lista.innerHTML = dados.faturas.map(i => `
            <div class="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-sm">
                <div class="flex items-center gap-2"><span class="font-black text-[12px] uppercase text-slate-700">${i.nome}</span>${i.pago ? '<span class="text-[8px] bg-emerald-100 text-emerald-600 px-1 py-0.5 rounded font-black border border-emerald-200">PAGO</span>' : ''}</div>
                <span class="${i.pago ? 'text-emerald-500 line-through' : 'text-red-500'} font-black text-[12px]">R$ ${fmt(i.valor)}</span>
            </div>
        `).join('');
        // No Desktop, permite que a caixa cresça se necessário
        if(window.innerWidth > 1024) quadro.style.height = 'auto';
    } else {
        areaFaturas.classList.add('hidden');
        if(window.innerWidth > 1024) quadro.style.height = '550px';
    }
};


function mudarMesCategorias(d) { dataCat.setMonth(dataCat.getMonth() + d); renderizarCategorias(); }
function renderizarCategorias() {
    document.getElementById('cat-titulo').innerText = `${MESES[dataCat.getMonth()]} ${dataCat.getFullYear()}`;
    const refBR = `${String(dataCat.getMonth() + 1).padStart(2, '0')}/${dataCat.getFullYear()}`;
    let saidas = dataGlobais.gastos.filter(g => String(getV(g, ['tipo']) || '').toUpperCase() === 'SAIDA' && extrairMesAno(getV(g, ['data'])) === refBR);
    const msg = document.getElementById('sem-gastos-msg'); const container = document.getElementById('container-categorias'); const lista = document.getElementById('lista-top-gastos');
    if (saidas.length === 0) { msg.classList.remove('hidden'); container.classList.add('hidden'); return; }
    msg.classList.add('hidden'); container.classList.remove('hidden');
    let cat = {}; saidas.forEach(g => { let c = getV(g, ['categoria']) || 'OUTROS'; cat[c] = (cat[c] || 0) + parseMoeda(getV(g, ['valor'])); });
    let sortedCats = Object.keys(cat).map(k => ({ n: k, v: cat[k] })).sort((a,b) => b.v - a.v);
    lista.innerHTML = sortedCats.map((c, i) => `<div class="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100"><span class="text-[12px] font-black text-blue-500 w-5">${i+1}º</span><span class="text-[10px] font-black uppercase text-slate-600 truncate flex-1">${c.n}</span><span class="text-[10px] font-black text-slate-400">R$ ${fmt(c.v)}</span></div>`).join('');
    if(cPizza) cPizza.destroy(); cPizza = new Chart(document.getElementById('chartPizza'), { type: 'doughnut', data: { labels: sortedCats.map(c=>c.n), datasets: [{ data: sortedCats.map(c=>c.v), backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'], borderWidth: 0 }] }, options: { maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (ctx) => `R$ ${fmt(ctx.raw)}` } } } } });
}

function setModoFluxo(modo) {
    modoFluxo = modo;
    ['btn-fluxo-ambos', 'btn-fluxo-credito', 'btn-fluxo-debito'].forEach(id => {
        document.getElementById(id).classList.remove('bg-white', 'text-emerald-700');
        document.getElementById(id).classList.add('text-emerald-100');
    });
    let activeId = modo === 'AMBOS' ? 'btn-fluxo-ambos' : (modo === 'CREDITO' ? 'btn-fluxo-credito' : 'btn-fluxo-debito');
    document.getElementById(activeId).classList.add('bg-white', 'text-emerald-700');
    renderizarFluxo();
}

function mudarPaginaFluxo(dir) { let max = Math.max(0, timelineMestra.length - 5); state.fluxo += dir; if(state.fluxo < 0) state.fluxo = 0; if(state.fluxo > max) state.fluxo = max; renderizarFluxo(); }
function renderizarFluxo() {
    atualizarBotoes('btn-prev-fluxo', 'btn-next-fluxo', state.fluxo, 5);
    const semDados = document.getElementById('sem-dados-fluxo'); let chaves = timelineMestra.slice(state.fluxo, state.fluxo + 5);
    if(chaves.length === 0) { semDados.classList.remove('hidden'); return; } else semDados.classList.add('hidden');
    let labels = chaves.map(k => k.substring(0,3) + '/' + k.split('/')[1]); let ent = chaves.map(k => 0); let sai = chaves.map(k => 0);
    dataGlobais.gastos.forEach(g => {
        let d = getV(g, ['data']); if(!d) return; let m = extrairMesAno(d); if(!m) return;
        let p = m.split('/'); let key = `${MESES[parseInt(p[0])-1]}/${p[1].slice(-2)}`; let idx = chaves.indexOf(key);
        if (idx !== -1) {
            let forma = String(getV(g, ['forma_pagamento', 'forma'])||'').toUpperCase(); let val = parseMoeda(getV(g, ['valor'])); let tipo = String(getV(g, ['tipo'])||'').toUpperCase(); let isCred = forma.includes('CRED');
            if (modoFluxo === 'AMBOS' || (modoFluxo === 'CREDITO' && isCred) || (modoFluxo === 'DEBITO' && !isCred)) { if(tipo === 'ENTRADA') ent[idx] += val; if(tipo === 'SAIDA') sai[idx] += val; }
        }
    });
    if(cFluxo) cFluxo.destroy();
    cFluxo = new Chart(document.getElementById('chartFluxo'), { type: 'line', data: { labels, datasets: [ { label: 'Entradas', data: ent, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 3, fill: true, pointRadius: 5, tension: 0.3 }, { label: 'Saídas', data: sai, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 3, fill: true, pointRadius: 5, tension: 0.3 } ] }, options: tooltipPointValue(false, true) });
}

function mudarPaginaEficiencia(dir) { let max = Math.max(0, timelineMestra.length - 6); state.eficiencia += dir; if(state.eficiencia < 0) state.eficiencia = 0; if(state.eficiencia > max) state.eficiencia = max; renderizarHistoricoEficiencia(); }
function mudarPaginaResultado(dir) { let max = Math.max(0, timelineMestra.length - 6); state.resultado += dir; if(state.resultado < 0) state.resultado = 0; if(state.resultado > max) state.resultado = max; renderizarHistoricoResultado(); }

function calcularTotaisHistorico(chaves) {
    let mapa = chaves.map(k => ({ entradas: 0, saidas: 0 }));
    dataGlobais.hist.forEach(h => {
        let m = String(getV(h, ['mes']) || '').toUpperCase(); let fluxo = String(getV(h, ['fluxo']) || '').toUpperCase(); let val = parseMoeda(getV(h, ['valor']));
        if (m) { let idx = chaves.indexOf(m); if(idx !== -1) { if (fluxo === 'ENTRADA') mapa[idx].entradas += val; if (fluxo === 'SAIDA') mapa[idx].saidas += val; } }
    });
    return mapa;
}

function renderizarHistoricoEficiencia() {
    atualizarBotoes('btn-prev-eficiencia', 'btn-next-eficiencia', state.eficiencia, 6);
    const semDados = document.getElementById('sem-dados-eficiencia'); let chaves = timelineMestra.slice(state.eficiencia, state.eficiencia + 6);
    if(chaves.length === 0) { semDados.classList.remove('hidden'); return; } else semDados.classList.add('hidden');
    const mapa = calcularTotaisHistorico(chaves); const labels = chaves.map(k => k.substring(0,3) + '/' + k.split('/')[1]);
    const valores = mapa.map(v => v.entradas > 0 && v.entradas > v.saidas ? ((v.entradas - v.saidas) / v.entradas) * 100 : 0);
    if(cEficiencia) cEficiencia.destroy();
    cEficiencia = new Chart(document.getElementById('chartEficiencia'), { type: 'line', data: { labels, datasets: [{ label: 'Taxa Poupança', data: valores, borderColor: '#9333ea', backgroundColor: 'rgba(147, 51, 234, 0.1)', borderWidth: 3, fill: true, pointRadius: 5, tension: 0.3 }] }, options: tooltipPointValue(true) });
}

function renderizarHistoricoResultado() {
    atualizarBotoes('btn-prev-resultado', 'btn-next-resultado', state.resultado, 6);
    const semDados = document.getElementById('sem-dados-resultado'); let chaves = timelineMestra.slice(state.resultado, state.resultado + 6);
    if(chaves.length === 0) { semDados.classList.remove('hidden'); return; } else semDados.classList.add('hidden');
    const mapa = calcularTotaisHistorico(chaves); const labels = chaves.map(k => k.substring(0,3) + '/' + k.split('/')[1]);
    const valores = mapa.map(v => v.entradas - v.saidas);
    if(cResultado) cResultado.destroy();
    cResultado = new Chart(document.getElementById('chartResultado'), { type: 'bar', data: { labels, datasets: [{ label: 'Sobra Líquida', data: valores, backgroundColor: valores.map(v => v >= 0 ? '#0891b2' : '#e11d48'), borderRadius: 4 }] }, options: tooltipPointValue(false) });
}

function renderizarProjecaoParcelas() {
    let projecaoMeses = {}; const hj = new Date(); const baseStart = new Date(hj.getFullYear(), hj.getMonth(), 1);
    dataGlobais.faturas.forEach(f => {
        let mesStr = String(getV(f, ['mes_fatura', 'mes']) || '').toLowerCase(); let val = parseMoeda(getV(f, ['valor_total', 'valor', 'valor_fatura']));
        if(!mesStr || val === 0) return; let mIndex = MESES.findIndex(m => mesStr.includes(m.substring(0,3).toLowerCase())); if(mIndex === -1) return;
        let yMatch = mesStr.match(/\d{2,4}/); let ano = yMatch ? parseInt(yMatch[0]) : hj.getFullYear(); if(ano < 100) ano += 2000;
        let dFat = new Date(ano, mIndex, 1);
        if(dFat > baseStart) { let key = `${dFat.getFullYear()}-${String(dFat.getMonth()).padStart(2,'0')}`; if (!projecaoMeses[key]) projecaoMeses[key] = { d: dFat, v: 0 }; projecaoMeses[key].v += val; }
    });
    let sorted = Object.values(projecaoMeses).sort((a,b) => a.d - b.d);
    let totalProjecao = sorted.reduce((a,b) => a + b.v, 0);
    document.getElementById('kpi-projecao').innerText = fmt(totalProjecao); document.getElementById('kpi-total-futuro').innerText = `R$ ${fmt(totalProjecao)}`;
    const lista = document.getElementById('lista-projecao');
    if(sorted.length === 0) { lista.innerHTML = '<div class="text-[10px] font-black uppercase text-gray-300 text-center mt-10 tracking-widest">Nenhuma parcela futura.</div>'; return; }
    lista.innerHTML = sorted.map(k => `<div class="flex justify-between items-center p-3 border border-orange-50 bg-orange-50/50 rounded-xl shadow-sm"><span class="text-[12px] font-black uppercase text-slate-600"><i class="fas fa-calendar-alt text-orange-300 mr-2"></i> ${MESES[k.d.getMonth()]} / ${String(k.d.getFullYear()).slice(-2)}</span><span class="text-xs font-black text-orange-500">R$ ${fmt(k.v)}</span></div>`).join('');
}

function atualizarStatus(tipo) {
    const el = document.getElementById('status-conexao-flutuante'); const ic = document.getElementById('status-icon');
    el.classList.remove('opacity-0', 'scale-75'); el.classList.add('opacity-100', 'scale-100');
    if (tipo === 'conectando') { ic.className = "fas fa-sync fa-spin text-lg text-blue-500"; }
    else if (tipo === 'sucesso') { ic.className = "fas fa-check-circle text-lg text-emerald-500"; setTimeout(() => el.classList.replace('opacity-100', 'opacity-0'), 2000); }
    else { ic.className = "fas fa-exclamation-triangle text-lg text-red-500"; }
}

function toggleSidebar() { document.getElementById('sidebar-lateral').classList.toggle('-translate-x-full'); document.getElementById('sidebar-overlay').classList.toggle('hidden'); }
