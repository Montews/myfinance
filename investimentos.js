const API_URL = "https://script.google.com/macros/s/AKfycby7cBP4XB5-ldRA9P07qLd0onh6GIx79FP_xfK2KHE5GnYogm1xgP-Ft9iy-6z3DkJE_A/exec";


let listaContas = [];
let dadosBrutosGlobais = [];
let meuGrafico = null;
let isDatabaseLoaded = false;
let activeToasts = 0;

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================

window.addEventListener('load', async () => {
    const statusEl = document.getElementById('db-status');
    statusEl.innerHTML = '<i class="fas fa-sync fa-spin"></i> Sincronizando dados ativos...';
    statusEl.className = "px-6 py-2 font-bold text-[10px] uppercase tracking-widest text-orange-500";

    await carregarContas();
    await buscarDadosInvestimentos();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModais();
});

// ==========================================
// 2. FUNÇÕES DE MODAL (LIMPEZA TOTAL AO SAIR)
// ==========================================

function fecharModais() {
    ['modal-aporte', 'modal-resultado', 'modal-detalhes', 'modal-sacar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    document.getElementById('form-aporte').reset();
    document.getElementById('form-resultado').reset();
    document.getElementById('form-sacar').reset();

    const campos = document.querySelectorAll('.input-padrao, input, select');
    campos.forEach(c => c.classList.remove('animate-shake', 'border-red-500'));
}

function tentarAbrirModalAporte() {
    if (!isDatabaseLoaded) { notify('erro', 'Aguarde a conexão com o banco.'); return; }
    document.getElementById('ap-data').value = getDataHojeBR();
    document.getElementById('modal-aporte').classList.remove('hidden');
}

function abrirModalResultado(conta, titulo) {
    document.getElementById('rd-conta').value = conta;
    document.getElementById('rd-titulo').value = titulo;
    document.getElementById('rd-conta-nome').innerText = titulo;
    document.getElementById('rd-data').value = getDataHojeBR();
    setTipoResultado('RENDIMENTO');
    document.getElementById('modal-resultado').classList.remove('hidden');
}

function abrirModalSacar(conta, titulo, saldo) {
    document.getElementById('sk-conta-origem').value = conta;
    document.getElementById('sk-titulo').value = titulo;
    document.getElementById('sk-ativo-nome').innerText = titulo;
    document.getElementById('sk-data').value = getDataHojeBR();
    document.getElementById('sk-saldo-max').value = saldo;
    document.getElementById('sk-txt-saldo').innerText = 'Saldo disponível: R$ ' + saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2});

    const inputVal = document.getElementById('sk-valor');
    inputVal.value = "";
    inputVal.classList.remove('animate-shake', 'border-red-500');

    document.getElementById('modal-sacar').classList.remove('hidden');
}

// ==========================================
// 3. MÁSCARA CADEADO (10 CARACTERES)
// ==========================================

function limitarDecimais(input) {
    let cursor = input.selectionStart;
    let valorOriginal = input.value;
    let v = valorOriginal.replace(/[^0-9.,]/g, '');

    const match = v.match(/[.,]/g);
    if (match && match.length > 1) {
        const pIdx = v.search(/[.,]/);
        v = v.substring(0, pIdx + 1) + v.substring(pIdx + 1).replace(/[.,]/g, '');
    }

    const idxSep = v.search(/[.,]/);
    if (idxSep !== -1) {
        v = v.substring(0, idxSep) + v[idxSep] + v.substring(idxSep + 1).substring(0, 2);
    }

    if (v.length > 10) v = v.substring(0, 10);

    if (valorOriginal !== v) {
        input.value = v;
        let ajuste = v.length - valorOriginal.length;
        input.setSelectionRange(cursor + ajuste, cursor + ajuste);
    }
}

function formatarDataParaISO(dataBR) {
    if (!dataBR || !dataBR.includes('/')) return dataBR;
    const [dia, mes, ano] = dataBR.split('/');
    return `${ano}-${mes}-${dia}`;
}

// ==========================================
// 4. LANÇAMENTOS
// ==========================================

async function enviarParaGoogle(dados) {
    const response = await fetch(`${API_URL}?tipo=criar_gasto`, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify(dados)
    });
    return await response.json();
}

async function salvarAporte(btn) {
    if (!validarCampos(['ap-data', 'ap-valor', 'ap-descricao'])) return;
    const labelOriginal = btn.innerText;
    btn.innerText = "LANÇANDO..."; btn.disabled = true;

    const d = formatarDataParaISO(document.getElementById('ap-data').value);
    const v = parseFloat(document.getElementById('ap-valor').value.replace(',', '.')).toFixed(2);
    const t = document.getElementById('ap-descricao').value;
    const ori = document.getElementById('ap-conta-origem').value;
    const dest = document.getElementById('ap-conta-destino').value;

    try {
        await enviarParaGoogle({ data: d, valor: v, local: ori, descricao: t + ' (Saída)', categoria: 'INVESTIMENTOS', conta: ori, tipo: 'SAIDA', forma_pagamento: 'DEBITO' });
        await enviarParaGoogle({ data: d, valor: v, local: ori, descricao: t, categoria: 'INVESTIMENTOS', conta: dest, tipo: 'ENTRADA', forma_pagamento: 'INVESTIMENTO' });

        notify('sucesso', 'Aporte registrado!');
        fecharModais();
        await buscarDadosInvestimentos();
    } catch (e) { notify('erro', 'Erro ao salvar aporte.'); }
    finally { btn.innerText = labelOriginal; btn.disabled = false; }
}

async function salvarResultado(btn) {
    if (!validarCampos(['rd-data', 'rd-valor'])) return;

    const tipoRes = document.getElementById('rd-tipo').value;
    const vInput = parseFloat(document.getElementById('rd-valor').value.replace(',', '.'));
    const d = formatarDataParaISO(document.getElementById('rd-data').value);
    const tit = document.getElementById('rd-titulo').value;
    const conta = document.getElementById('rd-conta').value;

    const ativos = calcularSaldosAtuais();
    const saldoCard = ativos[`${conta}|${tit}`] ? ativos[`${conta}|${tit}`].total : 0;

    if (tipoRes === 'PREJUIZO' && vInput >= (saldoCard - 0.001)) {
        notify('erro', 'O prejuízo não pode ser igual ou maior que o saldo atual!');
        document.getElementById('rd-valor').classList.add('animate-shake', 'border-red-500');
        return;
    }

    const labelOriginal = btn.innerText;
    btn.innerText = "SALVANDO..."; btn.disabled = true;

    try {
        await enviarParaGoogle({ data: d, valor: vInput.toFixed(2), local: conta, descricao: tit + (tipoRes === 'RENDIMENTO' ? ' (Rendimento)' : ' (Prejuízo)'), categoria: tipoRes, conta: conta, tipo: tipoRes === 'RENDIMENTO' ? 'ENTRADA' : 'SAIDA', forma_pagamento: 'INVESTIMENTO' });
        notify('sucesso', 'Resultado registrado!');
        fecharModais();
        await buscarDadosInvestimentos();
    } catch (e) { notify('erro', 'Falha ao salvar resultado.'); }
    finally { btn.innerText = "Salvar"; btn.disabled = false; }
}

async function salvarSaque(btn) {
    const valStr = document.getElementById('sk-valor').value;
    if (!valStr) {
        document.getElementById('sk-valor').classList.add('animate-shake', 'border-red-500');
        return;
    }

    const v = parseFloat(valStr.replace(',', '.'));
    const m = parseFloat(document.getElementById('sk-saldo-max').value);

    if (v > (m + 0.01)) {
        notify('erro', 'Valor acima do saldo disponível!');
        document.getElementById('sk-valor').classList.add('animate-shake', 'border-red-500');
        return;
    }

    btn.innerText = "SACANDO..."; btn.disabled = true;
    const d = formatarDataParaISO(document.getElementById('sk-data').value);
    const tit = document.getElementById('sk-titulo').value;
    const ori = document.getElementById('sk-conta-origem').value;
    const dest = document.getElementById('sk-conta-destino').value;

    try {
        await enviarParaGoogle({ data: d, valor: v.toFixed(2), local: ori, descricao: tit + ' (Resgate)', categoria: 'Desinvestimento', conta: ori, tipo: 'SAIDA', forma_pagamento: 'INVESTIMENTO' });
        await enviarParaGoogle({ data: d, valor: v.toFixed(2), local: ori, descricao: 'Resgate: ' + tit, categoria: 'Desinvestimento', conta: dest, tipo: 'ENTRADA', forma_pagamento: 'DEBITO' });

        notify('sucesso', 'Resgate concluído!');
        fecharModais();
        await buscarDadosInvestimentos();
    } catch (e) { notify('erro', 'Erro no processamento.'); }
    finally { btn.innerText = "Confirmar Resgate"; btn.disabled = false; }
}

// ==========================================
// 5. CÁLCULOS E DASHBOARD
// ==========================================

function calcularSaldosAtuais() {
    let resumo = {};
    dadosBrutosGlobais.forEach(item => {
        const v = parseFloat(item.valor) || 0;
        const tit = getTituloPuro(item.descricao);
        const desc = String(item.descricao || "");
        const chave = `${item.conta}|${tit}`;
        if (!resumo[chave]) resumo[chave] = { conta: item.conta, titulo: tit, aporte: 0, lucro: 0, total: 0 };
        if (desc.includes("(Rendimento)") || desc.includes("(Prejuízo)")) {
            if (item.tipo === "ENTRADA") resumo[chave].lucro += v; else resumo[chave].lucro -= v;
        } else {
            if (item.tipo === "ENTRADA") resumo[chave].aporte += v; else resumo[chave].aporte -= v;
        }
        resumo[chave].total = resumo[chave].aporte + resumo[chave].lucro;
    });
    return resumo;
}

async function carregarContas() {
    try {
        const res = await fetch(`${API_URL}?tipo=contas`);
        listaContas = await res.json();
        const html = listaContas.map(i => {
            const n = (typeof i === 'object') ? i.conta : i;
            return `<option value="${n}">${n}</option>`;
        }).join('');
        document.getElementById('ap-conta-origem').innerHTML = html;
        document.getElementById('ap-conta-destino').innerHTML = html;
        document.getElementById('sk-conta-destino').innerHTML = html;
    } catch (e) { console.error(e); }
}

async function buscarDadosInvestimentos() {
    isDatabaseLoaded = false;
    const statusEl = document.getElementById('db-status');
    try {
        const res = await fetch(`${API_URL}?tipo=todos`);
        const todosDados = await res.json();
        dadosBrutosGlobais = todosDados.filter(i => i.forma_pagamento === "INVESTIMENTO");
        isDatabaseLoaded = true;
        statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Banco Conectado';
        statusEl.className = "px-6 py-2 font-bold text-[10px] uppercase tracking-widest text-green-500";
        processarEstatistica(dadosBrutosGlobais);
    } catch (e) {
        statusEl.innerHTML = '<i class="fas fa-times-circle"></i> Erro de Conexão';
        statusEl.className = "px-6 py-2 font-bold text-[10px] uppercase tracking-widest text-red-600";
    }
}

function processarEstatistica(dados) {
    const resumo = calcularSaldosAtuais();
    let globalAporte = 0, globalLucro = 0;
    for (const k in resumo) {
        if (resumo[k].total > 0.009) {
            globalAporte += resumo[k].aporte;
            globalLucro += resumo[k].lucro;
        }
    }
    document.getElementById('total-aportes').innerText = `R$ ${globalAporte.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('total-lucros').innerText = `R$ ${globalLucro.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    const cardH = document.getElementById('card-rendimento-status');
    if (globalLucro > 0) cardH.className = "p-6 rounded-xl shadow-lg border-l-4 bg-green-600 text-white";
    else if (globalLucro < 0) cardH.className = "p-6 rounded-xl shadow-lg border-l-4 bg-red-600 text-white";
    else cardH.className = "p-6 rounded-xl shadow-lg border-l-4 bg-white text-slate-900";

    renderizarCards(resumo);
}

function renderizarCards(resumo) {
    const grid = document.getElementById('grid-investimentos');
    const btnAporte = document.getElementById('btn-fixo-aporte').outerHTML;
    let html = btnAporte;

    for (const [chave, valores] of Object.entries(resumo)) {
        if (valores.total <= 0.009) continue;

        let pct = (valores.aporte > 0) ? (valores.lucro / valores.aporte) * 100 : 0;
        const seta = pct >= 0 ? '↑' : '↓';
        const corPct = pct >= 0 ? 'text-green-500' : 'text-red-500';
        const valorLimpo = Math.abs(pct).toFixed(2);
        const tEsc = valores.titulo.replace(/'/g, "\\'");

        html += `
        <div onclick="abrirModalDetalhes('${valores.conta}', '${tEsc}', ${valores.total})" class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full transform transition hover:-translate-y-1 cursor-pointer group">
            <div class="bg-slate-50 p-4 border-b group-hover:bg-blue-50 transition-colors">
                <h4 class="font-bold text-slate-800 uppercase text-[10px] tracking-widest">${valores.conta}</h4>
                <p class="text-xs font-bold truncate">${valores.titulo}</p>
            </div>
            <div class="p-6 flex-1 text-center flex flex-col justify-center">
                <p class="text-[9px] text-gray-400 font-bold uppercase mb-1">Saldo Atual</p>
                <h2 class="text-2xl font-black text-slate-800">R$ ${valores.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
                <p class="text-[18px] font-black mt-2 ${corPct}"><span class="font-black">${seta}</span> ${valorLimpo}%</p>
            </div>

            <div class="flex">
                <button onclick="event.stopPropagation(); abrirModalResultado('${valores.conta}', '${tEsc}')"
                    class="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black text-[11px] uppercase tracking-tighter transition-colors">
                    Resultado
                </button>
                <button onclick="event.stopPropagation(); abrirModalSacar('${valores.conta}', '${tEsc}', ${valores.total})"
                    class="flex-1 py-4 bg-orange-500 hover:bg-orange-600 text-white font-black text-[11px] uppercase tracking-tighter transition-colors border-l border-white/10">
                    Sacar
                </button>
            </div>
        </div>`;
    }
    grid.innerHTML = html;
}

// ==========================================
// 6. HISTÓRICO E GRÁFICO (RESTAURADO E TURBINADO)
// ==========================================

function abrirModalDetalhes(conta, titulo, total) {
    try {
        const titR = String(titulo).replace(/&quot;/g, '"');
        document.getElementById('det-conta-nome').innerText = conta;
        document.getElementById('det-titulo-nome').innerText = titR;
        let hist = dadosBrutosGlobais.filter(i => String(i.conta) === String(conta) && getTituloPuro(i.descricao) === titR);
        hist.sort((a, b) => a.data.split('/').reverse().join('').localeCompare(b.data.split('/').reverse().join('')));

        let saldoAc = 0, labels = [], dataPoints = [], htmlRows = [], motivos = [];
        hist.forEach(i => {
            const v = parseFloat(i.valor) || 0;
            let op = "Aporte", cor = "text-blue-600", sin = "+";
            if (i.descricao.includes("(Rendimento)") || i.descricao.includes("(Prejuízo)")) {
                if (i.tipo === "ENTRADA") { saldoAc += v; op = "Lucro"; cor = "text-green-600"; }
                else { saldoAc -= v; op = "Perda"; cor = "text-red-600"; sin = "-"; }
            } else {
                if (i.tipo === "ENTRADA") { saldoAc += v; op = "Aporte"; }
                else { saldoAc -= v; op = "Saque"; cor = "text-orange-500"; sin = "-"; }
            }
            labels.push(i.data.substring(0, 5) + '/' + i.data.substring(8, 10));
            dataPoints.push(saldoAc.toFixed(2));
            motivos.push(op);

            htmlRows.push(`
                <tr class="border-b">
                    <td class="p-4 text-[15px] font-bold font-mono">${i.data}</td>
                    <td class="p-4 text-[16px] font-black uppercase ${cor}">${op}</td>
                    <td class="p-4 text-right text-[18px] font-black ${cor}">${sin} R$ ${v.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                </tr>`);
        });

        document.getElementById('lista-historico').innerHTML = htmlRows.reverse().join('');
        const ctx = document.getElementById('grafico-evolucao').getContext('2d');
        if (meuGrafico) meuGrafico.destroy();

        meuGrafico = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data: dataPoints,
                    fill: true,
                    backgroundColor: 'rgba(37, 99, 235, 0.05)',
                    tension: 0.3,
                    pointRadius: 8, // VOLTARAM AS BOLINHAS
                    pointHoverRadius: 12,
                    pointBackgroundColor: '#2563eb',
                    segment: {
                        borderColor: ctx => {
                            const tipo = motivos[ctx.p1DataIndex];
                            if (tipo === "Lucro") return '#22c55e'; // VERDE
                            if (tipo === "Perda") return '#ef4444'; // VERMELHO
                            if (tipo === "Saque") return '#f97316'; // LARANJA
                            if (tipo === "Aporte") return '#2563eb'; // AZUL
                            return '#2563eb';
                        },
                        borderWidth: 5
                    }
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        displayColors: false, // REMOVE A CAIXA DE COR
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        padding: 15,
                        titleFont: { size: 18 },
                        bodyFont: { size: 24, weight: 'black' },
                        callbacks: { label: (c) => ' Saldo: R$ ' + parseFloat(c.parsed.y).toLocaleString('pt-BR', {minimumFractionDigits: 2}) }
                    }
                },
                scales: {
                    y: { ticks: { font: { size: 15, weight: 'bold' }, callback: (v) => 'R$ ' + v.toLocaleString('pt-BR') } },
                    x: { ticks: { font: { size: 15, weight: 'bold' } } }
                }
            }
        });
        document.getElementById('modal-detalhes').classList.remove('hidden');
    } catch (e) { console.error(e); }
}

// ==========================================
// 7. UTILITÁRIOS
// ==========================================

function getTituloPuro(desc) { return String(desc || "").replace(/\(Rendimento\)|\(Prejuízo\)|\(Resgate\)|\(Saída\)|\(Envio para Corretora\)|\(Resgate da Corretora\)/g, "").trim(); }
function getDataHojeBR() { const h = new Date(); return `${String(h.getDate()).padStart(2, '0')}/${String(h.getMonth() + 1).padStart(2, '0')}/${h.getFullYear()}`; }
function mascaraData(input) { let v = input.value.replace(/\D/g, ''); if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, '$1/$2'); if (v.length > 4) v = v.replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3'); input.value = v; }
function validarCampos(ids) { let e = false; ids.forEach(id => { const el = document.getElementById(id); if (!el || !el.value) { if(el) el.classList.add('animate-shake', 'border-red-500'); e = true; } else el.classList.remove('border-red-500', 'animate-shake'); }); return !e; }
function notify(tipo, msg) { if (activeToasts >= 3) return; activeToasts++; const c = document.getElementById('toast-container'); const t = document.createElement('div'); t.className = `${tipo === 'sucesso' ? 'bg-green-600' : 'bg-red-600'} text-white px-8 py-4 rounded-xl shadow-2xl font-black text-sm mb-3 animate-bounce flex items-center gap-3 border-2 border-white/20 pointer-events-auto`; t.style.zIndex = "10000000"; t.innerHTML = `<i class="fas fa-${tipo === 'sucesso' ? 'check-circle' : 'exclamation-triangle'}"></i> <span>${msg}</span>`; c.appendChild(t); setTimeout(() => { t.classList.add('opacity-0', 'transition-all', 'duration-500'); setTimeout(() => { t.remove(); activeToasts--; }, 500); }, 3500); }
function setTipoResultado(tipo) { document.getElementById('rd-tipo').value = tipo; const btnR = document.getElementById('btn-tipo-rend'); const btnP = document.getElementById('btn-tipo-prej'); const borda = document.getElementById('borda-modal-resultado'); if (tipo === 'RENDIMENTO') { btnR.className = "flex-1 py-3 rounded-lg font-bold text-xs uppercase border-2 border-green-500 bg-green-50 text-green-700 shadow-sm"; btnP.className = "flex-1 py-3 rounded-lg font-bold text-xs uppercase border-2 border-transparent bg-gray-100 text-gray-400"; borda.style.borderTopColor = "#22c55e"; } else { btnP.className = "flex-1 py-3 rounded-lg font-bold text-xs uppercase border-2 border-red-500 bg-red-50 text-red-700 shadow-sm"; btnR.className = "flex-1 py-3 rounded-lg font-bold text-xs uppercase border-2 border-transparent bg-gray-100 text-gray-400"; borda.style.borderTopColor = "#ef4444"; } }
function alternarAba(aba) { const isG = (aba === 'grafico'); document.getElementById('aba-btn-grafico').className = isG ? "flex-1 py-4 font-bold text-sm border-b-4 border-blue-600 text-blue-600" : "flex-1 py-4 font-bold text-sm border-b-4 border-transparent text-gray-500"; document.getElementById('aba-btn-lista').className = !isG ? "flex-1 py-4 font-bold text-sm border-b-4 border-blue-600 text-blue-600" : "flex-1 py-4 font-bold text-sm border-b-4 border-transparent text-gray-500"; document.getElementById('conteudo-grafico').classList.toggle('hidden', !isG); document.getElementById('conteudo-lista').classList.toggle('hidden', isG); }