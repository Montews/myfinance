const API_URL = "https://script.google.com/macros/s/AKfycbymUJFJ_Kn5D9CxVg8FrOn_SiDKszWl-kaw_wAqqWSGU8UWCxTYtMha2N66Bhld6GoV/exec";

let cPizza, cFluxo, cCredit, cWealth;
let dataGlobais = { gastos: [], faturas: [], assinaturas: [], contas: [], hist: [] };
let dataCal = new Date();
const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

// CAÇADOR DE CHAVES FLEXÍVEL
function getV(obj, chaves) {
    for (let c of chaves) {
        if (obj[c] !== undefined && obj[c] !== null) return obj[c];
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
    if(!dataStr) return "";
    let s = String(dataStr);
    if(s.includes('/')) { let p = s.split('/'); return `${p[1]}/${p[2]}`; }
    if(s.includes('-')) { return `${s.substring(5,7)}/${s.substring(0,4)}`; }
    return "";
}

// FUNÇÃO PARA REQUISIÇÕES POST
async function chamarMotor(tipoAcao, payload = {}) {
    const url = `${API_URL}?tipo=${tipoAcao}`;
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    return await response.json();
}

window.addEventListener('load', () => {
    const hj = new Date();
    document.getElementById('filtro-cat-mes').value = `${hj.getFullYear()}-${String(hj.getMonth() + 1).padStart(2, '0')}`;
    carregarDashboard();
});

async function carregarDashboard() {
    atualizarStatus('conectando');
    try {
        const [rContas, rFat, rGastos, rHist] = await Promise.all([
            fetch(`${API_URL}?tipo=contas_resumo`),
            fetch(`${API_URL}?tipo=faturas_resumo`),
            fetch(`${API_URL}?tipo=todos`),
            fetch(`${API_URL}?tipo=historico_resumo`)
        ]);

        let dContas = await rContas.json();
        let dFat = await rFat.json();
        let dGastos = await rGastos.json();
        let dHist = await rHist.json();

        let dAss = await chamarMotor('obter_assinaturas');

        // BLINDAGEM MÁXIMA: Garante que tudo seja uma lista.
        dataGlobais.contas = Array.isArray(dContas) ? dContas : [];
        dataGlobais.faturas = Array.isArray(dFat) ? dFat : [];
        dataGlobais.gastos = Array.isArray(dGastos) ? dGastos : [];
        dataGlobais.hist = Array.isArray(dHist) ? dHist : [];
        dataGlobais.assinaturas = Array.isArray(dAss) ? dAss : [];

        renderizarKPIs();
        renderizarCategorias();
        renderizarFluxo();
        renderizarCredito();
        renderizarWealth();
        renderizarCalendario();

        atualizarStatus('sucesso');
    } catch (e) {
        console.error("Erro no Dash:", e);
        atualizarStatus('erro');
    }
}

function renderizarKPIs() {
    // 1. Patrimônio Bruto
    let saldo = dataGlobais.contas.reduce((a,b) => a + parseMoeda(getV(b, ['saldo_debito', 'saldo_debito;'])), 0);
    let inv = dataGlobais.contas.reduce((a,b) => a + parseMoeda(getV(b, ['saldo_investimento', 'saldo_investimento;'])), 0);
    document.getElementById('kpi-patrimonio').innerText = fmt(saldo + inv);

    // 2. Faturas Abertas (O ERRO ESTAVA AQUI! Corrigido de "f" para "b")
    let fatAberta = dataGlobais.faturas
        .filter(f => String(getV(f, ['status', 'status;']) || '').toUpperCase() !== 'PAGO')
        .reduce((a,b) => a + parseMoeda(getV(b, ['valor_total', 'valor_total;', 'valor'])), 0);
    document.getElementById('kpi-faturas').innerText = fmt(fatAberta);

    // 3. Projeção de Faturas
    const hj = new Date();
    const filtroMes = document.getElementById('filtro-cat-mes').value;
    if(!filtroMes) return;
    const [aRef, mRef] = filtroMes.split('-');

    let parcelasFuturas = dataGlobais.gastos.filter(g => {
        let fp = String(getV(g, ['Forma Pgto', 'Forma Pgto;', 'forma_pgto']) || '').toUpperCase();
        if(!fp.includes('CRED') && !fp.includes('CRÉD')) return false;

        let mesF = String(getV(g, ['Mês Fatura', 'Mês Fatura;', 'mes_fatura']) || '').toLowerCase();
        if(!mesF || mesF === 'undefined' || mesF === 'null') return false;

        for(let i=1; i<=12; i++) {
            let dF = new Date(parseInt(aRef), parseInt(mRef) - 1 + i, 1);
            let mCurtoF = MESES[dF.getMonth()].substring(0,3).toLowerCase();
            let aCurtoF = String(dF.getFullYear()).slice(-2);
            if(mesF.includes(mCurtoF) && mesF.includes(aCurtoF)) return true;
        }
        return false;
    }).reduce((a,b) => a + parseMoeda(getV(b, ['Valor', 'Valor;', 'valor'])), 0);
    document.getElementById('kpi-projecao').innerText = fmt(parcelasFuturas);

    // 4. Média Diária
    const refBR = `${mRef}/${aRef}`;
    let saidasMes = dataGlobais.gastos.filter(g => String(getV(g, ['Tipo', 'tipo']) || '').toUpperCase() === 'SAIDA' && extrairMesAno(getV(g, ['Data', 'data'])) === refBR);
    let totalSaida = saidasMes.reduce((a,b) => a + parseMoeda(getV(b, ['Valor', 'valor'])), 0);
    let divisor = hj.getDate() === 1 ? 1 : hj.getDate();
    document.getElementById('kpi-media').innerText = fmt(totalSaida / divisor);
}

function renderizarCategorias() {
    const inputMes = document.getElementById('filtro-cat-mes').value;
    if(!inputMes) return;
    const refBR = `${inputMes.split('-')[1]}/${inputMes.split('-')[0]}`;

    let saidas = dataGlobais.gastos.filter(g => String(getV(g, ['Tipo', 'tipo']) || '').toUpperCase() === 'SAIDA' && extrairMesAno(getV(g, ['Data', 'data'])) === refBR);

    const msg = document.getElementById('sem-gastos-msg');
    const container = document.getElementById('container-categorias');
    const lista = document.getElementById('lista-top-gastos');

    if (saidas.length === 0) {
        msg.classList.remove('hidden'); container.classList.add('hidden');
        return;
    }

    msg.classList.add('hidden'); container.classList.remove('hidden');

    let cat = {};
    saidas.forEach(g => {
        let c = getV(g, ['Categoria', 'Categoria;', 'categoria']) || 'OUTROS';
        cat[c] = (cat[c] || 0) + parseMoeda(getV(g, ['Valor', 'valor']));
    });

    let sortedCats = Object.keys(cat).map(k => ({ n: k, v: cat[k] })).sort((a,b) => b.v - a.v);

    lista.innerHTML = sortedCats.map((c, i) => `
        <div class="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-black text-blue-500 w-4">${i+1}º</span>
                <span class="text-[10px] font-black uppercase text-slate-600 truncate max-w-[120px]">${c.n}</span>
            </div>
            <span class="text-xs font-black text-slate-800">R$ ${fmt(c.v)}</span>
        </div>
    `).join('');

    if(cPizza) cPizza.destroy();
    cPizza = new Chart(document.getElementById('chartPizza'), {
        type: 'doughnut',
        data: {
            labels: sortedCats.map(c=>c.n),
            datasets: [{ data: sortedCats.map(c=>c.v), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'], borderWidth: 0 }]
        },
        options: { maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
    });
}

function renderizarFluxo() {
    let labels = [], ent = [], sai = [];
    const hj = new Date();

    for (let i = 5; i >= 0; i--) {
        let d = new Date(hj.getFullYear(), hj.getMonth() - i, 1);
        let m = String(d.getMonth() + 1).padStart(2, '0');
        let a = d.getFullYear();
        labels.push(`${MESES[d.getMonth()].substring(0,3)}/${String(a).slice(-2)}`);

        let mesGastos = dataGlobais.gastos.filter(g => extrairMesAno(getV(g, ['Data', 'data'])) === `${m}/${a}`);
        ent.push(mesGastos.filter(g => String(getV(g, ['Tipo', 'tipo'])||'').toUpperCase() === 'ENTRADA').reduce((acc,g) => acc + parseMoeda(getV(g, ['Valor', 'valor'])), 0));
        sai.push(mesGastos.filter(g => String(getV(g, ['Tipo', 'tipo'])||'').toUpperCase() === 'SAIDA').reduce((acc,g) => acc + parseMoeda(getV(g, ['Valor', 'valor'])), 0));
    }

    if(cFluxo) cFluxo.destroy();
    cFluxo = new Chart(document.getElementById('chartFluxo'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Entradas', data: ent, backgroundColor: '#10b981', borderRadius: 4 }, { label: 'Saídas Reais', data: sai, backgroundColor: '#ef4444', borderRadius: 4 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } }
    });
}

function renderizarWealth() {
    if(!dataGlobais.hist.length) return;

    let meses = {};
    dataGlobais.hist.forEach(h => {
        let m = h.mes || h.Mes || h.Mês;
        if(m) meses[m] = (meses[m] || 0) + parseMoeda(getV(h, ['valor', 'Valor', 'valor;']));
    });

    const labels = Object.keys(meses).sort().slice(-6);
    const valores = labels.map(l => meses[l]);

    if(cWealth) cWealth.destroy();
    cWealth = new Chart(document.getElementById('chartWealth'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Patrimônio', data: valores, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 3, fill: true, pointRadius: 5, tension: 0.3 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } }
    });
}

function renderizarCredito() {
    let agrupadoMes = {};

    dataGlobais.faturas.forEach(f => {
        let m = String(getV(f, ['Mês Fatura', 'Mês Fatura;', 'mes_fatura', 'mes']) || '').toLowerCase();
        if(m && m !== 'null' && m !== 'undefined') {
            agrupadoMes[m] = (agrupadoMes[m] || 0) + parseMoeda(getV(f, ['valor_total', 'valor', 'valor_total;']));
        }
    });

    let chaves = Object.keys(agrupadoMes).slice(-6);
    let valores = chaves.map(k => agrupadoMes[k]);

    if(cCredit) cCredit.destroy();
    cCredit = new Chart(document.getElementById('chartCredit'), {
        type: 'line',
        data: { labels: chaves, datasets: [{ label: 'Faturas Fechadas', data: valores, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 3, fill: true, pointRadius: 5, tension: 0.3 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } }
    });
}

function mudarMesCalendario(d) {
    dataCal.setMonth(dataCal.getMonth() + d);
    document.getElementById('cal-detalhes-inline').classList.add('hidden');
    renderizarCalendario();
}

function renderizarCalendario() {
    const grid = document.getElementById('calendar-grid');
    const mes = dataCal.getMonth();
    const ano = dataCal.getFullYear();
    document.getElementById('cal-titulo').innerText = `${MESES[mes]} ${ano}`;

    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const start = new Date(ano, mes, 1).getDay();
    const hj = new Date();

    let html = '';
    for(let i=0; i<start; i++) html += '<div></div>';

    let mesCurto = MESES[mes].substring(0,3).toLowerCase();

    for(let d=1; d<=diasNoMes; d++) {
        let itens = [];

        dataGlobais.faturas.forEach(f => {
            let diaV = parseInt(getV(f, ['dia_vencimento', 'dia_vencimento;']));
            let mesF = String(getV(f, ['Mês Fatura', 'Mês Fatura;', 'mes_fatura']) || '').toLowerCase();
            if(diaV === d && mesF.includes(mesCurto)) {
                let nomeFatura = getV(f, ['cartao', 'cartao;', 'Cartão']) || 'Cartão';
                itens.push({ nome: `Fatura ${nomeFatura}`, valor: getV(f, ['valor_total', 'valor']), pago: String(getV(f, ['status', 'status;'])).toUpperCase() === 'PAGO' });
            }
        });

        dataGlobais.assinaturas.forEach(a => {
            if(parseInt(a.dia_vencimento) === d && String(a.status).toUpperCase() === 'ATIVO') {
                itens.push({ nome: a.nome, valor: a.valor, pago: a.pago_este_mes === true });
            }
        });

        let classe = 'cal-day';
        if (itens.length > 0) {
            let todosPagos = itens.every(x => x.pago === true);

            if(todosPagos) {
                classe += ' day-pago';
            } else {
                let diffDias = Math.ceil((new Date(ano, mes, d).getTime() - hj.getTime()) / 86400000);
                classe += (diffDias <= 3) ? ' day-critico' : ' day-venc';
            }

            let payload = encodeURIComponent(JSON.stringify(itens));
            html += `<div onclick="abrirDiaInline(${d}, '${payload}')" class="${classe}">${d}</div>`;
        } else {
            if(d === hj.getDate() && mes === hj.getMonth() && ano === hj.getFullYear()) classe += ' day-hoje';
            html += `<div class="${classe}">${d}</div>`;
        }
    }
    grid.innerHTML = html;
}

function abrirDiaInline(dia, payload) {
    const itens = JSON.parse(decodeURIComponent(payload));
    const container = document.getElementById('cal-detalhes-inline');

    document.getElementById('cal-detalhes-titulo').innerText = `DIA ${String(dia).padStart(2, '0')} DE ${document.getElementById('cal-titulo').innerText}`;

    document.getElementById('cal-detalhes-lista').innerHTML = itens.map(i => `
        <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
            <div class="flex items-center gap-2">
                <span class="font-black text-[10px] uppercase text-slate-600">${i.nome}</span>
                ${i.pago ? '<span class="text-[8px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-black border border-emerald-200">[PAGO]</span>' : ''}
            </div>
            <span class="${i.pago ? 'text-emerald-500 line-through' : 'text-red-500'} font-black text-xs">R$ ${fmt(i.valor)}</span>
        </div>
    `).join('');

    container.classList.remove('hidden');
}

function atualizarStatus(tipo) {
    const el = document.getElementById('status-conexao-flutuante'); const sp = document.getElementById('status-text'); const ic = document.getElementById('status-icon');
    el.classList.remove('opacity-0', 'scale-75'); el.classList.add('opacity-100', 'scale-100');
    if (tipo === 'conectando') { sp.innerText = "Calculando..."; ic.className = "fas fa-sync fa-spin text-blue-500"; }
    else if (tipo === 'sucesso') { sp.innerText = "Atualizado"; ic.className = "fas fa-check-circle text-blue-500"; setTimeout(() => el.classList.replace('opacity-100', 'opacity-0'), 2000); }
    else { sp.innerText = "Erro"; ic.className = "fas fa-exclamation-triangle text-red-500"; }
}

function toggleSidebar() { document.getElementById('sidebar-lateral').classList.toggle('-translate-x-full'); document.getElementById('sidebar-overlay').classList.toggle('hidden'); }
