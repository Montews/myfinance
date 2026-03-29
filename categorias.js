// URL ATUALIZADA
const API_URL = "https://script.google.com/macros/s/AKfycbwEs5RX0FpcN8AR8FIG5Y5K1Qkojox2Ke8_o8MTKQMhPqQO6J6ZfVXOlF7mIIKkuYXxVg/exec";
const POST_API_URL = "https://script.google.com/macros/s/AKfycbwEs5RX0FpcN8AR8FIG5Y5K1Qkojox2Ke8_o8MTKQMhPqQO6J6ZfVXOlF7mIIKkuYXxVg/exec";

let dadosBrutos = [];
let listaContasAtuais = [];
let listaCategoriasAtuais = [];
let statusTimeout1, statusTimeout2;
let chartInstancia = null;

// VARIÁVEIS DE PERFORMANCE E GRÁFICO
let historicoGraficoCategoria = [];
let paginaAtualGrafico = 0;
let cacheHistoricoCategoria = {};
let idBuscaAtivaGrafico = 0; // TRAVA DE SEGURANÇA CONTRA RESPOSTAS LENTAS DO SERVIDOR

const hoje = new Date();
let dataInicioSel = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
let dataFimSel = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
let mesExibido = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

window.addEventListener('load', async () => {
    atualizarLabelPeriodo();
    await carregarContas();
    await buscarDadosIniciais();
});

// ==========================================
// FUNÇÃO PARA IGNORAR CATEGORIAS ESPECÍFICAS
// ==========================================
const categoriaDebeSerIgnorada = (cat) => {
    const c = String(cat || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return c === 'SALARIO' || c === 'PAGAMENTO CREDITO';
};

// ==========================================
// INTERFACE E MENUS
// ==========================================
function toggleSidebar() {
    const s = document.getElementById('sidebar-lateral');
    const o = document.getElementById('sidebar-overlay');
    const icon = document.getElementById('menu-icon');
    if (s.classList.contains('-translate-x-full')) {
        s.classList.remove('-translate-x-full'); o.classList.remove('hidden'); icon.classList.replace('fa-bars', 'fa-times');
    } else {
        s.classList.add('-translate-x-full'); o.classList.add('hidden'); icon.classList.replace('fa-times', 'fa-bars');
    }
}

// LÓGICA DE TROCA DE ABAS DO MODAL
function alternarAbaModal(aba) {
    const tExtrato = document.getElementById('tab-extrato');
    const tGrafico = document.getElementById('tab-grafico');
    const bExtrato = document.getElementById('btn-tab-extrato');
    const bGrafico = document.getElementById('btn-tab-grafico');

    if (aba === 'extrato') {
        tExtrato.classList.remove('hidden'); tExtrato.classList.add('flex');
        tGrafico.classList.add('hidden'); tGrafico.classList.remove('flex');
        bExtrato.classList.add('border-blue-500', 'text-blue-600'); bExtrato.classList.remove('border-transparent', 'text-slate-400');
        bGrafico.classList.remove('border-blue-500', 'text-blue-600'); bGrafico.classList.add('border-transparent', 'text-slate-400');
    } else {
        tExtrato.classList.add('hidden'); tExtrato.classList.remove('flex');
        tGrafico.classList.remove('hidden'); tGrafico.classList.add('flex');
        bGrafico.classList.add('border-blue-500', 'text-blue-600'); bGrafico.classList.remove('border-transparent', 'text-slate-400');
        bExtrato.classList.remove('border-blue-500', 'text-blue-600'); bExtrato.classList.add('border-transparent', 'text-slate-400');

        setTimeout(() => { if (chartInstancia) chartInstancia.render(); }, 50);
    }
}

// ==========================================
// STATUS FLUTUANTE DE CONEXÃO
// ==========================================
function atualizarStatus(tipo) {
    const el = document.getElementById('status-conexao-flutuante');
    const span = document.getElementById('status-text');
    const tooltipText = document.getElementById('status-tooltip-text');
    const icon = document.getElementById('status-icon');

    clearTimeout(statusTimeout1);
    clearTimeout(statusTimeout2);

    el.classList.remove('opacity-0', 'scale-75');
    el.classList.add('opacity-100', 'scale-100', 'lg:px-4', 'lg:gap-3');
    el.classList.remove('lg:px-0', 'lg:w-10', 'lg:h-10', 'lg:justify-center');
    span.className = "hidden lg:inline-block";

    const baseClass = "pointer-events-auto cursor-pointer flex items-center justify-center lg:justify-start gap-0 lg:gap-3 text-xs lg:text-sm font-black uppercase tracking-widest w-10 h-10 lg:w-auto lg:h-auto rounded-full border shadow-2xl transition-all duration-500 transform opacity-100 scale-100 ";

    if (tipo === 'conectando') {
        el.className = baseClass + "text-yellow-600 bg-yellow-50 border-yellow-200 lg:px-4";
        span.innerText = "Conectando..."; tooltipText.innerText = "Conectando..."; icon.className = "fas fa-sync fa-spin text-lg";
    } else if (tipo === 'sucesso') {
        el.className = baseClass + "text-green-600 bg-green-50 border-green-200 lg:px-4";
        span.innerText = "Banco Conectado"; tooltipText.innerText = "Banco Conectado"; icon.className = "fas fa-check-circle text-lg";

        statusTimeout1 = setTimeout(() => {
            span.classList.replace('lg:inline-block', 'hidden');
            el.classList.remove('lg:px-4', 'lg:gap-3');
            el.classList.add('lg:px-0', 'lg:w-10', 'lg:h-10', 'lg:justify-center');
            statusTimeout2 = setTimeout(() => { el.classList.remove('opacity-100', 'scale-100'); el.classList.add('opacity-0', 'scale-75'); }, 1500);
        }, 3000);

    } else {
        el.className = baseClass + "text-red-600 bg-red-50 border-red-200 lg:px-4";
        span.innerText = "Erro Banco"; tooltipText.innerText = "Erro Banco"; icon.className = "fas fa-exclamation-triangle text-lg";
    }
}

function toggleTooltipStatus() {
    if (window.innerWidth >= 1024) return;
    const tooltip = document.getElementById('status-tooltip');
    tooltip.classList.toggle('hidden');
    if (!tooltip.classList.contains('hidden')) { setTimeout(() => { tooltip.classList.add('hidden'); }, 3000); }
}

// ==========================================
// BUSCA E PROCESSAMENTO DE DADOS PRINCIPAL
// ==========================================
const formatarDataParaAPI = (data) => {
    if (!data) return "";
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
};

async function buscarDadosIniciais() {
    atualizarStatus('conectando');
    cacheHistoricoCategoria = {}; // Limpa o cache ao refiltrar tudo

    const dInicio = formatarDataParaAPI(dataInicioSel);
    const dFim = formatarDataParaAPI(dataFimSel);
    const valorContaInput = document.getElementById('filtro-conta-input')?.value.trim();
    const contaParaAPI = (!valorContaInput || valorContaInput.toUpperCase() === "TODAS AS CONTAS") ? "TODAS" : valorContaInput;
    const valorCatInput = document.getElementById('filtro-categoria-input')?.value.trim();
    const categoriaParaAPI = (!valorCatInput || valorCatInput.toUpperCase() === "TODAS AS CATEGORIAS") ? "TODAS" : valorCatInput;

    try {
        const [resCategorias, resGastos] = await Promise.all([
            fetch(`${API_URL}?tipo=categorias`), fetch(`${API_URL}?tipo=filtro-avancado&inicio=${dInicio}&fim=${dFim}&conta=${contaParaAPI}&categoria=${categoriaParaAPI}`)
        ]);

        listaCategoriasAtuais = (await resCategorias.json()).map(c => c.categoria);

        // Aplica o Filtro para Nunca entrar na conta (Salário e Pagamento Crédito)
        const gastosRaw = await resGastos.json();
        dadosBrutos = gastosRaw.filter(i => !categoriaDebeSerIgnorada(i.categoria));

        processarCategoriasComBase(dadosBrutos, listaCategoriasAtuais);
        atualizarStatus('sucesso');
    } catch (e) {
        atualizarStatus('erro'); notify('erro', 'Falha ao carregar dados do servidor.');
    }
}

function processarCategoriasComBase(dados, listaOficial) {
    let categoriasMap = {};
    listaOficial.forEach(nomeCat => {
        if (!categoriaDebeSerIgnorada(nomeCat)) {
            categoriasMap[nomeCat.toUpperCase()] = { nome: nomeCat.toUpperCase(), entrada: 0, saida: 0, temMovimento: false };
        }
    });

    dados.forEach(item => {
        const catNome = String(item.categoria || 'GERAL').trim().toUpperCase();
        const valor = parseFloat(item.valor) || 0;
        const tipo = String(item.tipo).trim().toUpperCase();

        if (!categoriasMap[catNome]) categoriasMap[catNome] = { nome: catNome, entrada: 0, saida: 0, temMovimento: false };
        categoriasMap[catNome].temMovimento = true;

        if (tipo === 'ENTRADA') categoriasMap[catNome].entrada += valor;
        else if (tipo === 'SAIDA' || tipo === 'SAÍDA') categoriasMap[catNome].saida += valor;
    });

    const valorCatInput = document.getElementById('filtro-categoria-input')?.value.trim().toUpperCase();
    if (valorCatInput && valorCatInput !== "TODAS AS CATEGORIAS" && valorCatInput !== "TODAS") {
        Object.keys(categoriasMap).forEach(key => { if (key !== valorCatInput) categoriasMap[key].temMovimento = false; });
    }

    renderizarSessões(Object.values(categoriasMap));
}

function renderizarSessões(lista) {
    const comGastos = lista.filter(c => c.temMovimento);
    const semGastos = lista.filter(c => !c.temMovimento);

    renderizarTop3(comGastos);
    comGastos.sort((a, b) => b.saida - a.saida);
    document.getElementById('lista-gastos').innerHTML = comGastos.map(c => templateCard(c, false)).join('');

    semGastos.sort((a, b) => a.nome.localeCompare(b.nome));
    document.getElementById('lista-sem-gastos').innerHTML = semGastos.map(c => templateCard(c, true)).join('');
}

function renderizarTop3(lista) {
    const tops = [...lista].sort((a, b) => b.saida - a.saida).filter(c => c.saida > 0).slice(0, 3);
    for (let i = 1; i <= 3; i++) {
        const c = tops[i - 1];
        document.getElementById(`top${i}-nome`).innerText = c ? c.nome : "Sem Registro";
        document.getElementById(`top${i}-valor`).innerText = c ? `R$ ${c.saida.toLocaleString('pt-BR', {minimumFractionDigits:2})}` : "-";
    }
}

function templateCard(c, isCinza) {
    const bg = isCinza ? 'bg-gray-100/50' : 'bg-[#F8FAFC]';
    const textNome = isCinza ? 'text-slate-400 font-bold' : 'text-slate-800 font-black';
    const opacity = isCinza ? 'opacity-60' : 'opacity-100';
    return `
        <div onclick="abrirModalDetalhes('${c.nome}')" class="${bg} ${opacity} p-4 lg:p-5 rounded-xl border border-gray-100 shadow-suave hover:shadow-md hover:-translate-y-1 flex flex-col lg:flex-row justify-between lg:items-center cursor-pointer transition-all duration-300 gap-3 lg:gap-0">
            <div class="flex flex-col lg:w-1/3 min-w-0">
                <span class="text-[8px] lg:text-[9px] font-black uppercase text-slate-400 mb-0.5 tracking-tighter shrink-0">Categoria</span>
                <span class="text-[12px] lg:text-sm uppercase truncate ${textNome}">${c.nome}</span>
            </div>
            <div class="flex flex-row justify-between lg:justify-around lg:flex-1 lg:ml-10">
                <div class="text-left lg:text-right">
                    <span class="text-[8px] lg:text-[9px] font-black uppercase text-green-400/50 mb-0.5 block tracking-widest">Entrada</span>
                    <span class="text-[10px] lg:text-sm font-black text-green-600">+ R$ ${c.entrada.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
                <div class="text-right">
                    <span class="text-[8px] lg:text-[9px] font-black uppercase text-red-400/50 mb-0.5 block tracking-widest">Saída</span>
                    <span class="text-[10px] lg:text-sm font-black text-red-600">- R$ ${c.saida.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
            </div>
        </div>`;
}

// ==========================================
// MODAL DE EXTRATO E GRÁFICO (PERFORMANCE MAXIMIZADA)
// ==========================================
function abrirModalDetalhes(catNome) {
    const container = document.getElementById('container-detalhes-dinamico');
    document.getElementById('detalhe-titulo-cat').innerText = catNome;
    document.getElementById('modal-detalhes').classList.remove('hidden');

    // Destrói gráfico antigo e zera HTML instantaneamente
    if (chartInstancia) { chartInstancia.destroy(); chartInstancia = null; }
    document.getElementById('chart-categoria').innerHTML = '';

    alternarAbaModal('extrato');

    const filtrados = dadosBrutos.filter(i => {
        const catItem = String(i.categoria || 'GERAL').trim().toUpperCase();
        return catItem === catNome.trim().toUpperCase();
    });

    let e = 0, s = 0;
    if (filtrados.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-[11px] font-black text-gray-400 uppercase tracking-widest mt-10">Nenhuma movimentação neste período.</div>`;
    } else {
        container.innerHTML = `<div class="space-y-4">` + filtrados.map(i => {
            const v = parseFloat(i.valor) || 0;
            const isEntrada = String(i.tipo || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'ENTRADA';
            if (isEntrada) e += v; else s += v;
            return `
                <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm font-black">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-[12px] text-slate-400 bg-gray-100 px-2 py-0.5 rounded italic">${i.data}</span>
                        <span class="text-[15px] ${isEntrada ? 'text-green-600' : 'text-red-600'}">
                            ${isEntrada ? '+' : '-'} R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}
                        </span>
                    </div>
                    <div class="text-[15px] text-slate-800 uppercase leading-tight mb-2 break-words">${i.descricao || 'Sem descrição'}</div>
                    <div class="flex items-center gap-2">
                        <div class="w-1.5 h-1.5 rounded-full ${isEntrada ? 'bg-green-500' : 'bg-red-500'}"></div>
                        <span class="text-[11px] uppercase ${isEntrada ? 'text-green-600' : 'text-red-600'} tracking-wider">${i.conta || 'NÃO INFORMADA'}</span>
                    </div>
                </div>`;
        }).join('') + `</div>`;
    }
    document.getElementById('detalhe-total-ent').innerText = `R$ ${e.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
    document.getElementById('detalhe-total-sai').innerText = `R$ ${s.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;

    // Dispara a busca do histórico com a nova trava
    carregarHistoricoGrafico(catNome);
}

function fecharModalDetalhes() {
    document.getElementById('modal-detalhes').classList.add('hidden');
    idBuscaAtivaGrafico++; // Cancela qualquer requisição fantasma rodando
    if (chartInstancia) { chartInstancia.destroy(); chartInstancia = null; }
}

// BUSCA COM CACHE E TRAVA ANTI-BUG

// =========================================================================
// BUSCA HISTÓRICO E GERA LINHA DO TEMPO ATÉ O MÊS ATUAL (COMPLETO)
// =========================================================================
async function carregarHistoricoGrafico(catNome) {
    idBuscaAtivaGrafico++;
    const meuId = idBuscaAtivaGrafico;

    document.getElementById('btn-chart-prev').classList.add('hidden');
    document.getElementById('btn-chart-next').classList.add('hidden');

    document.getElementById('chart-categoria').innerHTML = `
        <div class="flex flex-col items-center justify-center w-full h-full min-h-[250px] text-[10px] font-black text-gray-400 uppercase tracking-widest">
            <i class="fas fa-sync fa-spin text-3xl mb-3 text-blue-500"></i> Buscando Histórico...
        </div>`;

    try {
        let dadosCompletos;

        if (cacheHistoricoCategoria[catNome]) {
            dadosCompletos = cacheHistoricoCategoria[catNome];
        } else {
            const valorContaInput = document.getElementById('filtro-conta-input')?.value.trim();
            const contaParaAPI = (!valorContaInput || valorContaInput.toUpperCase() === "TODAS AS CONTAS") ? "TODAS" : valorContaInput;

            const urlBusca = `${API_URL}?tipo=filtro-avancado&inicio=2000-01-01&fim=2100-01-01&conta=${contaParaAPI}&categoria=${encodeURIComponent(catNome.trim())}`;
            const res = await fetch(urlBusca);
            const jsonRetorno = await res.json();

            // Filtro global de categorias ignoradas
            dadosCompletos = jsonRetorno.filter(i => !categoriaDebeSerIgnorada(i.categoria));

            if (meuId === idBuscaAtivaGrafico) {
                cacheHistoricoCategoria[catNome] = dadosCompletos;
            }
        }

        if (meuId !== idBuscaAtivaGrafico) return;

        const historicoCat = dadosCompletos.filter(i => {
            const catItem = String(i.categoria || 'GERAL').trim().toUpperCase();
            return catItem === catNome.trim().toUpperCase();
        });

        const mesesMap = {};
        historicoCat.forEach(i => {
            const tipo = String(i.tipo || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (i.data) {
                let d = String(i.data).split('T')[0];
                let y, m;
                if (d.includes('-')) { [y, m] = d.split('-'); }
                else if (d.includes('/')) { let p = d.split('/'); y = p[2]; m = p[1]; }

                if (y && m && y.length === 4) {
                    let key = `${y}-${m.padStart(2, '0')}`;
                    if(!mesesMap[key]) mesesMap[key] = { e: 0, s: 0 };
                    if (tipo === 'ENTRADA') mesesMap[key].e += (parseFloat(i.valor) || 0);
                    else if (tipo === 'SAIDA') mesesMap[key].s += (parseFloat(i.valor) || 0);
                }
            }
        });

        const chavesExistentes = Object.keys(mesesMap).sort();
        historicoGraficoCategoria = [];

        if (chavesExistentes.length > 0) {
            // Regra: Começa no primeiro gasto, mas obrigatoriamente TERMINA no mês atual
            let start = chavesExistentes[0];
            let agora = new Date();
            let end = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

            let [currY, currM] = start.split('-').map(Number);
            let [endY, endM] = end.split('-').map(Number);

            while (currY < endY || (currY === endY && currM <= endM)) {
                let key = `${currY}-${String(currM).padStart(2, '0')}`;
                historicoGraficoCategoria.push({
                    mesChave: key,
                    entrada: mesesMap[key] ? mesesMap[key].e : 0,
                    saida: mesesMap[key] ? mesesMap[key].s : 0
                });

                currM++;
                if (currM > 12) { currM = 1; currY++; }
            }
        }

        paginaAtualGrafico = 0;
        document.getElementById('btn-chart-prev').classList.remove('hidden');
        document.getElementById('btn-chart-next').classList.remove('hidden');

        if(historicoGraficoCategoria.length === 0) {
            document.getElementById('chart-categoria').innerHTML = '<div class="flex w-full h-full min-h-[250px] items-center justify-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Sem movimentações registradas.</div>';
            return;
        }

        renderizarPaginaGrafico();

    } catch (e) {
        if (meuId === idBuscaAtivaGrafico) {
            document.getElementById('chart-categoria').innerHTML = '<div class="flex w-full h-full min-h-[250px] items-center justify-center text-[10px] font-black text-red-400 uppercase tracking-widest">Erro ao carregar dados.</div>';
        }
    }
}

// =========================================================================
// RENDERIZAÇÃO RESPONSIVA: 3 COLUNAS (MOBILE) OU 6 COLUNAS (PC)
// =========================================================================

// ==========================================
// APENAS ESTA FUNÇÃO PRECISA SER SUBSTITUÍDA
// ==========================================
function renderizarPaginaGrafico() {
    // 1. DEFINE A QUANTIDADE DE COLUNAS (3 NO MOBILE, 6 NO PC)
    const isMobile = window.innerWidth <= 768;
    const itemsPorPagina = isMobile ? 3 : 6;

    // 2. CALCULA O CORTE DOS DADOS (PAGINAÇÃO)
    let fim = historicoGraficoCategoria.length - (paginaAtualGrafico * itemsPorPagina);
    let inicio = Math.max(0, fim - itemsPorPagina);

    // 3. ATUALIZA AS SETAS (CINZA SE NÃO TIVER MAIS DADOS)
    document.getElementById('btn-chart-prev').disabled = (inicio === 0);
    document.getElementById('btn-chart-next').disabled = (paginaAtualGrafico === 0);

    let dadosPagina = historicoGraficoCategoria.slice(inicio, fim);

    const labels = dadosPagina.map(item => {
        const [y, m] = item.mesChave.split('-');
        const mesesNome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        return `${mesesNome[parseInt(m)-1]}/${y.substring(2)}`;
    });

    const dataEntradas = dadosPagina.map(item => item.entrada);
    const dataSaidas = dadosPagina.map(item => item.saida);

    // Margem de segurança no topo (35%)
    const totaisPorMes = dadosPagina.map(item => item.entrada + item.saida);
    const maxGlobalEmpilhado = Math.max(...totaisPorMes);
    const maxEixoY = maxGlobalEmpilhado === 0 ? 100 : maxGlobalEmpilhado * 1.35;

    document.getElementById('chart-categoria').innerHTML = '';

    const options = {
        series: [{ name: 'Entradas', data: dataEntradas }, { name: 'Saídas', data: dataSaidas }],
        chart: {
            type: 'bar',
            height: '100%',
            stacked: true,
            toolbar: { show: false },
            fontFamily: 'inherit'
        },
        plotOptions: {
            bar: {
                borderRadius: 6,
                // Coluna fica mais larga no mobile para preencher o espaço das 3
                columnWidth: isMobile ? '80%' : '55%',
                dataLabels: { position: 'center' }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: (val) => val > 0 ? "R$ " + val.toLocaleString('pt-BR', {maximumFractionDigits: 0}) : "",
            style: { fontSize: isMobile ? '10px' : '11px', colors: ["#fff"], fontWeight: 900 },
            dropShadow: { enabled: true, top: 1, left: 1, blur: 1, color: '#000', opacity: 0.6 }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shade: 'dark', type: "vertical", shadeIntensity: 0.6,
                gradientToColors: ['#166534', '#991b1b'],
                inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [0, 100]
            }
        },
        colors: ['#22c55e', '#ef4444'],
        stroke: { show: true, width: 2, colors: ['#fff'] },
        xaxis: {
            categories: labels,
            axisBorder: { show: false },
            labels: { style: { colors: '#94a3b8', fontSize: '11px', fontWeight: 900 } }
        },
        yaxis: { show: false, min: 0, max: maxEixoY },
        grid: { show: false },
        legend: { show: false },
        tooltip: {
            shared: true, theme: 'dark',
            custom: function({ series, dataPointIndex, w }) {
                const ent = series[0][dataPointIndex];
                const sai = series[1][dataPointIndex];
                const saldo = ent - sai;
                const corSaldo = saldo >= 0 ? '#22c55e' : '#ef4444';
                return `
                <div class="p-3 bg-slate-900 text-white rounded-lg shadow-xl border border-slate-700 font-sans">
                    <div class="text-[10px] font-black uppercase text-slate-400 mb-2 border-b border-slate-700 pb-1">${w.globals.labels[dataPointIndex]}</div>
                    <div class="flex justify-between gap-4 text-[11px] mb-1"><span class="font-bold text-green-400">ENTRADA:</span><span class="font-black">R$ ${ent.toLocaleString('pt-BR')}</span></div>
                    <div class="flex justify-between gap-4 text-[11px] mb-2"><span class="font-bold text-red-400">SAÍDA:</span><span class="font-black">R$ ${sai.toLocaleString('pt-BR')}</span></div>
                    <div class="flex justify-between gap-4 text-[12px] pt-1 border-t border-slate-700" style="color: ${corSaldo}">
                        <span class="font-black uppercase">SALDO:</span>
                        <span class="font-black">${saldo >= 0 ? '+' : '-'} R$ ${Math.abs(saldo).toLocaleString('pt-BR')}</span>
                    </div>
                </div>`;
            }
        }
    };

    if (chartInstancia) { chartInstancia.destroy(); }
    chartInstancia = new ApexCharts(document.querySelector("#chart-categoria"), options);
    chartInstancia.render();
}

// RENDERIZA O GRÁFICO (6 MESES POR PÁGINA)

// =========================================================================
// RENDERIZA O GRÁFICO (AGORA EMPILHADO - STACKED BAR CHART)
// =========================================================================

// ==========================================
// RENDERIZA O GRÁFICO (RESPONSIVO + TOOLTIP COM SALDO)
// ==========================================

// =========================================================================
// SUBSTITUA APENAS ESTA FUNÇÃO PARA RESOLVER AS COLUNAS E RESPONSIVIDADE
// =========================================================================
function renderizarPaginaGrafico() {
    // 1. REGRA DE OURO: 3 COLUNAS NO CELULAR, 6 NO COMPUTADOR
    const isMobile = window.innerWidth <= 768;
    const itemsPorPagina = isMobile ? 3 : 6;

    // 2. CÁLCULO DE PAGINAÇÃO (Fatia os dados do histórico)
    let fim = historicoGraficoCategoria.length - (paginaAtualGrafico * itemsPorPagina);
    let inicio = Math.max(0, fim - itemsPorPagina);

    // 3. CONTROLE DAS SETAS (Ativa/Desativa se houver dados)
    const btnPrev = document.getElementById('btn-chart-prev');
    const btnNext = document.getElementById('btn-chart-next');
    if(btnPrev) btnPrev.disabled = (inicio === 0);
    if(btnNext) btnNext.disabled = (paginaAtualGrafico === 0);

    let dadosPagina = historicoGraficoCategoria.slice(inicio, fim);

    const labels = dadosPagina.map(item => {
        const [y, m] = item.mesChave.split('-');
        const mesesNome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        return `${mesesNome[parseInt(m)-1]}/${y.substring(2)}`;
    });

    const dataEntradas = dadosPagina.map(item => item.entrada);
    const dataSaidas = dadosPagina.map(item => item.saida);

    // Margem de respiro no topo (35% de folga)
    const totais = dadosPagina.map(item => item.entrada + item.saida);
    const maxVal = Math.max(...totais);
    const tetoY = maxVal === 0 ? 100 : maxVal * 1.35;

    // Limpa o gráfico anterior para não encavalar dados
    const chartContainer = document.querySelector("#chart-categoria");
    chartContainer.innerHTML = '';

    const options = {
        series: [{ name: 'Entradas', data: dataEntradas }, { name: 'Saídas', data: dataSaidas }],
        chart: {
            type: 'bar',
            height: '100%',
            stacked: true,
            toolbar: { show: false },
            fontFamily: 'inherit',
            animations: { enabled: true }
        },
        plotOptions: {
            bar: {
                borderRadius: 6,
                // Colunas largas no mobile (80%) para não sumirem, e 55% no PC
                columnWidth: isMobile ? '80%' : '55%',
                dataLabels: { position: 'center' }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: (val) => val > 0 ? "R$ " + val.toLocaleString('pt-BR', {maximumFractionDigits: 0}) : "",
            style: { fontSize: isMobile ? '9px' : '11px', colors: ["#fff"], fontWeight: 900 },
            dropShadow: { enabled: true, top: 1, left: 1, blur: 1, color: '#000', opacity: 0.6 }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shade: 'dark', type: "vertical", shadeIntensity: 0.6,
                gradientToColors: ['#14532d', '#7f1d1d'],
                inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [0, 100]
            }
        },
        colors: ['#22c55e', '#ef4444'],
        stroke: { show: true, width: 2, colors: ['#fff'] },
        xaxis: {
            categories: labels,
            axisBorder: { show: false },
            labels: { style: { colors: '#94a3b8', fontSize: '11px', fontWeight: 900 } }
        },
        yaxis: { show: false, min: 0, max: tetoY },
        grid: { show: false },
        legend: { show: false },
        tooltip: {
            shared: true,
            intersect: false,
            theme: 'dark',
            custom: function({ series, dataPointIndex, w }) {
                const ent = series[0][dataPointIndex];
                const sai = series[1][dataPointIndex];
                const saldo = ent - sai;
                const corSaldo = saldo >= 0 ? '#22c55e' : '#ef4444'; // Verde se positivo, Vermelho se negativo
                return `
                <div class="p-3 bg-slate-900 text-white rounded-lg shadow-xl border border-slate-700 font-sans">
                    <div class="text-[10px] font-black uppercase text-slate-400 mb-2 border-b border-slate-700 pb-1">${w.globals.labels[dataPointIndex]}</div>
                    <div class="flex justify-between gap-4 text-[11px] mb-1"><span class="font-bold text-green-400">ENTRADA:</span><span class="font-black">R$ ${ent.toLocaleString('pt-BR')}</span></div>
                    <div class="flex justify-between gap-4 text-[11px] mb-2"><span class="font-bold text-red-400">SAÍDA:</span><span class="font-black">R$ ${sai.toLocaleString('pt-BR')}</span></div>
                    <div class="flex justify-between gap-4 text-[12px] pt-1 border-t border-slate-700" style="color: ${corSaldo}">
                        <span class="font-black uppercase">SALDO:</span>
                        <span class="font-black">${saldo >= 0 ? '+' : '-'} R$ ${Math.abs(saldo).toLocaleString('pt-BR')}</span>
                    </div>
                </div>`;
            }
        }
    };

    if (chartInstancia) { chartInstancia.destroy(); }
    chartInstancia = new ApexCharts(chartContainer, options);
    chartInstancia.render();
}


function mudarPaginaGraficoAnterior() {
    paginaAtualGrafico++;
    renderizarPaginaGrafico();
}

function mudarPaginaGraficoProxima() {
    if(paginaAtualGrafico > 0) {
        paginaAtualGrafico--;
        renderizarPaginaGrafico();
    }
}

// ==========================================
// CALENDÁRIO E FILTROS RÁPIDOS
// ==========================================
function toggleSemGastos() {
    const lista = document.getElementById('lista-sem-gastos');
    const icon = document.getElementById('icon-sem-gastos');
    lista.classList.toggle('hidden'); icon.classList.toggle('rotate-180');
}

function toggleCalendario() {
    const p = document.getElementById('datepicker-popover');
    const b = document.getElementById('calendar-backdrop');
    if (p.classList.contains('hidden')) { p.classList.remove('hidden'); b.classList.remove('hidden'); renderizarDiasCalendario(); }
    else { p.classList.add('hidden'); b.classList.add('hidden'); }
}

function selecionarData(data) {
    if (!dataInicioSel || (dataInicioSel && dataFimSel)) { dataInicioSel = data; dataFimSel = null; }
    else if (data < dataInicioSel) { dataFimSel = dataInicioSel; dataInicioSel = data; }
    else if (data.getTime() !== dataInicioSel.getTime()) { dataFimSel = data; }
    renderizarDiasCalendario();
}

function setFiltroRapido(tipo) {
    const agora = new Date();
    if (tipo === '15dias') {
        dataFimSel = new Date(agora); dataInicioSel = new Date(agora); dataInicioSel.setDate(agora.getDate() - 15);
    } else if (tipo === 'semana') {
        dataFimSel = new Date(agora); dataInicioSel = new Date(agora); dataInicioSel.setDate(agora.getDate() - 7);
    } else if (tipo === 'todo_mes') {
        dataInicioSel = new Date(mesExibido.getFullYear(), mesExibido.getMonth(), 1); dataFimSel = new Date(mesExibido.getFullYear(), mesExibido.getMonth() + 1, 0);
    } else if (tipo === 'esta_semana') {
        let domingo = new Date(agora); domingo.setDate(agora.getDate() - agora.getDay());
        let sabado = new Date(domingo); sabado.setDate(domingo.getDate() + 6);
        dataInicioSel = domingo; dataFimSel = sabado;
    }
    if (tipo !== 'todo_mes') mesExibido = new Date(dataInicioSel);
    renderizarDiasCalendario();
}

function renderizarDiasCalendario() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('cal-mes-ano');
    grid.innerHTML = '';
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    label.innerText = `${meses[mesExibido.getMonth()]} ${mesExibido.getFullYear()}`;
    const pMes = new Date(mesExibido.getFullYear(), mesExibido.getMonth(), 1).getDay();
    const uMes = new Date(mesExibido.getFullYear(), mesExibido.getMonth() + 1, 0).getDate();
    for (let i = 0; i < pMes; i++) grid.innerHTML += '<div class="calendar-day day-disabled"></div>';
    for (let d = 1; d <= uMes; d++) {
        const dataDia = new Date(mesExibido.getFullYear(), mesExibido.getMonth(), d);
        let cl = "calendar-day";
        if (dataInicioSel?.getTime() === dataDia.getTime() || dataFimSel?.getTime() === dataDia.getTime()) cl += " day-selected";
        else if (dataInicioSel && dataFimSel && dataDia > dataInicioSel && dataDia < dataFimSel) cl += " day-range";
        grid.innerHTML += `<div class="${cl}" onclick="selecionarData(new Date(${dataDia.getTime()}))">${d}</div>`;
    }
}

function confirmarDatas() {
    if (dataInicioSel && dataFimSel) { atualizarLabelPeriodo(); toggleCalendario(); buscarDadosIniciais(); }
    else { notify('erro', 'Selecione o período (início e fim).'); }
}

function atualizarLabelPeriodo() {
    const f = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).substring(2)}`;
    document.getElementById('txt-periodo').innerText = `${f(dataInicioSel)} - ${f(dataFimSel)}`;
}

function mudarMes(d) { mesExibido.setMonth(mesExibido.getMonth() + d); renderizarDiasCalendario(); }

// ==========================================
// COMPORTAMENTO GLOBAL DOS DROPDOWNS
// ==========================================
document.addEventListener('click', function(e) {
    const containerConta = document.getElementById('container-conta-autocomplete');
    if (containerConta && !containerConta.contains(e.target)) { document.getElementById('dropdown-contas')?.classList.add('hidden'); }

    const containerCat = document.getElementById('container-categoria-autocomplete');
    if (containerCat && !containerCat.contains(e.target)) { document.getElementById('dropdown-categorias')?.classList.add('hidden'); }
});

// ==========================================
// AUTOCOMPLETE DE CONTA E CATEGORIA
// ==========================================
async function carregarContas() {
    try {
        const res = await fetch(`${API_URL}?tipo=contas`);
        listaContasAtuais = (await res.json()).map(c => c.conta || c);
    } catch(e) {}
}

function abrirDropdownContas() { document.getElementById('dropdown-contas').classList.remove('hidden'); filtrarContasInput(); }
function fecharDropdownContas() { setTimeout(() => { document.getElementById('dropdown-contas')?.classList.add('hidden'); }, 200); }

function filtrarContasInput() {
    const inputVal = document.getElementById('filtro-conta-input').value.trim().toUpperCase();
    const boxCriar = document.getElementById('box-criar-conta');
    const listaS = document.getElementById('lista-sugestoes-contas');
    const spanNome = document.getElementById('span-nome-nova-conta');
    listaS.innerHTML = ''; boxCriar.classList.add('hidden');

    if ("TODAS AS CONTAS".includes(inputVal) || inputVal === "") listaS.innerHTML += `<div onclick="selecionarConta('TODAS')" class="p-3 text-[11px] font-black text-slate-500 hover:bg-gray-100 cursor-pointer border-b border-gray-100 flex items-center justify-between"><span>TODAS AS CONTAS</span><i class="fas fa-list text-gray-300"></i></div>`;

    let achouExato = false;
    listaContasAtuais.forEach(conta => {
        const cUpper = String(conta).toUpperCase();
        if (cUpper.includes(inputVal)) listaS.innerHTML += `<div onclick="selecionarConta('${conta}')" class="p-3 text-xs font-black text-slate-800 hover:bg-gray-100 cursor-pointer border-b border-gray-100">${conta}</div>`;
        if (cUpper === inputVal) achouExato = true;
    });

    if (inputVal !== "" && !achouExato && inputVal !== "TODAS" && inputVal !== "TODAS AS CONTAS") { boxCriar.classList.remove('hidden'); boxCriar.classList.add('flex'); spanNome.innerText = inputVal; }
}

function selecionarConta(nome) { document.getElementById('filtro-conta-input').value = nome === 'TODAS' ? '' : nome; fecharDropdownContas(); }

async function confirmarCriarConta() {
    const nomeValue = document.getElementById('span-nome-nova-conta').innerText;
    if (!nomeValue) return;
    fecharDropdownContas(); notify('sucesso', 'Processando...');
    try {
        const res = await fetch(POST_API_URL + '?tipo=criar_conta', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ "nome": nomeValue }) });
        const json = await res.json();
        if (json.status === "erro") { notify('erro', json.mensagem); }
        else { notify('sucesso', `Conta "${nomeValue}" criada!`); listaContasAtuais.push(nomeValue); selecionarConta(nomeValue); }
    } catch (e) { notify('erro', 'Erro ao criar conta no banco.'); }
}

function abrirDropdownCategorias() { document.getElementById('dropdown-categorias').classList.remove('hidden'); filtrarCategoriasInput(); }
function fecharDropdownCategorias() { setTimeout(() => { document.getElementById('dropdown-categorias')?.classList.add('hidden'); }, 200); }

function filtrarCategoriasInput() {
    const inputVal = document.getElementById('filtro-categoria-input').value.trim().toUpperCase();
    const boxCriar = document.getElementById('box-criar-categoria');
    const listaS = document.getElementById('lista-sugestoes-categorias');
    const spanNome = document.getElementById('span-nome-nova-categoria');
    listaS.innerHTML = ''; boxCriar.classList.add('hidden');

    if ("TODAS AS CATEGORIAS".includes(inputVal) || inputVal === "") listaS.innerHTML += `<div onclick="selecionarCategoria('TODAS')" class="p-3 text-[11px] font-black text-slate-500 hover:bg-gray-100 cursor-pointer border-b border-gray-100 flex items-center justify-between"><span>TODAS AS CATEGORIAS</span><i class="fas fa-list text-gray-300"></i></div>`;

    let achouExato = false;
    listaCategoriasAtuais.forEach(cat => {
        const cUpper = String(cat).toUpperCase();
        if (cUpper.includes(inputVal)) listaS.innerHTML += `<div onclick="selecionarCategoria('${cat}')" class="p-3 text-xs font-black text-slate-800 hover:bg-gray-100 cursor-pointer border-b border-gray-100">${cat}</div>`;
        if (cUpper === inputVal) achouExato = true;
    });

    if (inputVal !== "" && !achouExato && inputVal !== "TODAS" && inputVal !== "TODAS AS CATEGORIAS") { boxCriar.classList.remove('hidden'); boxCriar.classList.add('flex'); spanNome.innerText = inputVal; }
}

function selecionarCategoria(nome) { document.getElementById('filtro-categoria-input').value = nome === 'TODAS' ? '' : nome; fecharDropdownCategorias(); }

async function confirmarCriarCategoria() {
    const nomeValue = document.getElementById('span-nome-nova-categoria').innerText;
    if (!nomeValue) return;
    fecharDropdownCategorias(); notify('sucesso', 'Processando...');
    try {
        const res = await fetch(POST_API_URL + '?tipo=criar_categoria', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ "nome": nomeValue }) });
        const json = await res.json();
        if (json.status === "erro") { notify('erro', json.mensagem); }
        else { notify('sucesso', `Categoria "${nomeValue}" criada!`); listaCategoriasAtuais.push(nomeValue); selecionarCategoria(nomeValue); }
    } catch (e) { notify('erro', 'Erro ao criar categoria no banco.'); }
}

// ==========================================
// NOTIFICAÇÕES (TOASTS)
// ==========================================
function notify(tipo, msg) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `${tipo === 'sucesso' ? 'bg-green-600' : 'bg-red-600'} text-white px-8 py-3 rounded-xl shadow-2xl font-black text-[10px] uppercase animate-bounce mt-2`;
    t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}