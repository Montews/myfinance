const API_URL = "https://script.google.com/macros/s/AKfycbwsYR35lJbduoL2Mf8zj72RJbk1vV2A2PJ1m8HooL3msO-jWEQZQmmgORR2H9UNV1yJ/exec";

let statusTimeout1, statusTimeout2;
let contasBanco = [];
let gastosCompletos = [];
let faturasAbertas = [];
let categoriasCache = [];
let dadosHistorico = [];

let histContaAtiva = null;
let histAbaAtiva = 'AMBOS';
let histOffset = 0;
let histDebitoFluxo = 'SAIDA';

const CORES_VIVAS = ["#EF4444", "#EC4899", "#D946EF", "#A855F7", "#8B5CF6", "#6366F1", "#3B82F6", "#0EA5E9", "#06B6D4", "#14B8A6", "#10B981", "#22C55E", "#84CC16", "#EAB308", "#F59E0B", "#F97316"];
const MESES_NOMES = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

window.addEventListener('load', () => {
    gerarPaletaDeCores('nc'); gerarPaletaDeCores('cc'); buscarDados();
    document.getElementById('tr-categoria-input').addEventListener('blur', esconderDropCategorias);
});

function formatarMoeda(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); }
function formatarMoedaSimples(v) { return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0); }
function formatarValorCompacto(v) {
    const valObj = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v || 0));
    const prefixo = v < 0 ? '<span class="text-[16px] lg:text-xl font-black mr-0.5">-</span>' : '';
    return `${prefixo}${valObj}<span class="text-[10px] align-baseline text-current opacity-70 ml-1 tracking-normal font-bold">R$</span>`;
}

function calcularDeltaHtml(atual, anterior, isCentered, indexConta, tipoAba) {
    const justify = isCentered ? "justify-center" : "justify-start";
    const textBaseClass = "text-[10px] lg:text-[9px] font-black uppercase flex items-center relative z-10";
    const linkClass = "cursor-pointer hover:opacity-80 transition-opacity";
    const divClick = `onclick="abrirModalHistorico(${indexConta}, '${tipoAba}', event)"`;

    let valAtual = Math.abs(atual || 0);
    let valAnt = Math.abs(anterior || 0);

    if (valAnt === 0) {
        return `<div class="flex items-center ${justify} mt-1" ${divClick}><span class="${textBaseClass} ${linkClass} text-gray-400"><i class="fas fa-minus text-[8px] mr-1"></i>Sem dados ant.</span></div>`;
    }

    let variacao = ((valAtual - valAnt) / valAnt) * 100;
    let round = Math.abs(variacao).toFixed(1).replace('.', ',');

    if (variacao > 0.1) {
        return `<div class="flex items-center ${justify} mt-1" ${divClick}><span class="${textBaseClass} ${linkClass} text-red-500"><i class="fas fa-arrow-up text-[8px] mr-1"></i>${round}% que o mês ant.</span></div>`;
    } else if (variacao < -0.1) {
        return `<div class="flex items-center ${justify} mt-1" ${divClick}><span class="${textBaseClass} ${linkClass} text-emerald-500"><i class="fas fa-arrow-down text-[8px] mr-1"></i>${round}% que o mês ant.</span></div>`;
    }

    return `<div class="flex items-center ${justify} mt-1" ${divClick}><span class="${textBaseClass} ${linkClass} text-gray-400"><i class="fas fa-minus text-[8px] mr-1"></i>Igual ao mês ant.</span></div>`;
}

async function buscarDados() {
    atualizarStatus('conectando');
    try {
        const [resContas, resGastos, resFaturas, resCategorias, resHistorico] = await Promise.all([
            fetch(`${API_URL}?tipo=contas_resumo`), fetch(`${API_URL}?tipo=todos`),
            fetch(`${API_URL}?tipo=faturas_resumo`), fetch(`${API_URL}?tipo=categorias`),
            fetch(`${API_URL}?tipo=historico_resumo`)
        ]);

        contasBanco = await resContas.json();
        gastosCompletos = await resGastos.json();
        faturasAbertas = await resFaturas.json();

        let histRaw = await resHistorico.json();
        dadosHistorico = Array.isArray(histRaw) ? histRaw : [];

        try { categoriasCache = await resCategorias.json(); preencherSelectCategorias(); } catch(e) {}

        renderizarContas();
        atualizarStatus('sucesso');
    } catch (error) {
        atualizarStatus('erro');
        notify('erro', 'Falha ao carregar os dados');
    }
}

function preencherSelectCategorias() {
    const select = document.getElementById('tr-categoria');
    if(select) {
        select.innerHTML = '<option value="GERAL">GERAL</option>';
        categoriasCache.forEach(c => { const n = typeof c === 'string' ? c : (c.nome || c.categoria); if (n && n.trim().toUpperCase() !== 'GERAL') select.innerHTML += `<option value="${n.trim()}">${n.trim()}</option>`; });
    }
}

function renderizarContas() {
    let totalSaldosGeral = 0;
    let totalFaturasAbertas = 0;
    let totalInvestido = 0;

    let htmlContasAtivas = '';
    let htmlContasInativas = '';

    const btnNovoHtml = document.getElementById('btn-add-fixo').outerHTML;

    const hj = new Date();
    const mesAtualVisual = `${MESES_NOMES[hj.getMonth()]}/${String(hj.getFullYear()).slice(-2)}`;
    const hjAnt = new Date(hj.getFullYear(), hj.getMonth() - 1, 1);
    const mesAntVisual = `${MESES_NOMES[hjAnt.getMonth()]}/${String(hjAnt.getFullYear()).slice(-2)}`;

    // Variáveis em minúsculo para comparação segura com o banco
    const mesAtualLower = mesAtualVisual.toLowerCase();
    const mesAntLower = mesAntVisual.toLowerCase();

    // Calculando as faturas globais (Apenas as que não estão PAGAS)
    if (Array.isArray(faturasAbertas)) {
        faturasAbertas.forEach(f => {
            if (String(f.status).toUpperCase() !== 'PAGO') {
                // CORREÇÃO AQUI: f.valor_total em vez de f.valor
                let valLimpo = String(f.valor_total).replace(/R\$\s?/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                totalFaturasAbertas += Math.abs(parseFloat(valLimpo) || 0);
            }
        });
    }

    contasBanco.forEach((conta, index) => {
        const isAtiva = conta.status === "ATIVO";
        const nomeUpper = conta.nome.toUpperCase();

        // =========================================================================
        // O ESCUDO MATEMÁTICO: RECRIANDO OS VALORES DO MÊS PARA IGNORAR A SOMA DO BANCO
        // =========================================================================
        let realDebAtual = 0, realDebAnt = 0;
        let realCredAnt = 0;

        if (Array.isArray(dadosHistorico)) {
            dadosHistorico.forEach(h => {
                if (String(h.banco).toUpperCase() === nomeUpper) {
                    let valStr = String(h.valor).replace(/R\$\s?/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                    let v = Math.abs(parseFloat(valStr) || 0);

                    let mesLinha = String(h.mes).toLowerCase();

                    if (mesLinha === mesAtualLower) {
                        if (String(h.forma).toUpperCase() === "DEBITO" && String(h.fluxo).toUpperCase() === "SAIDA") realDebAtual += v;
                    }
                    if (mesLinha === mesAntLower) {
                        if (String(h.forma).toUpperCase() === "DEBITO" && String(h.fluxo).toUpperCase() === "SAIDA") realDebAnt += v;
                        if (String(h.forma).toUpperCase() === "CREDITO") realCredAnt += v;
                    }
                }
            });
        }

        let somaFaturaAtual = 0;
        if (Array.isArray(faturasAbertas)) {
            faturasAbertas.forEach(f => {
                if (String(f.conta).toUpperCase() === nomeUpper && String(f.mes_fatura).toLowerCase() === mesAtualLower) {
                    // CORREÇÃO AQUI: f.valor_total em vez de f.valor
                    let valStr = String(f.valor_total).replace(/R\$\s?/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                    somaFaturaAtual += Math.abs(parseFloat(valStr) || 0);
                }
            });
        }

        // Aplicando a cura no objeto conta
        conta.gasto_debito_atual = realDebAtual;
        conta.gasto_debito_ant = realDebAnt;
        conta.fatura_atual = somaFaturaAtual; // Agora vai pegar os "3" reais corretamente!
        conta.fatura_ant = realCredAnt;
        // =========================================================================

        let labelTipo = "Conta";
        if (conta.tipo === "DEBITO") labelTipo = "Conta Corrente";
        else if (conta.tipo === "CREDITO") labelTipo = "Cartão de Crédito";
        else if (conta.tipo === "AMBOS") labelTipo = "Débito e Crédito";

        if (isAtiva) {
            totalSaldosGeral += conta.saldo_debito;
            if (conta.saldo_investimento) totalInvestido += conta.saldo_investimento;
        }

        let classOpacidade = !isAtiva ? 'conta-desativada' : '';

        const criarBarraMeta = (atual, meta, centerText, tipoCalculo) => {
            if (meta <= 0) return '';
            let p = (Math.abs(atual) / meta) * 100; if(p > 100) p = 100;
            let corBarra = 'bg-emerald-500';
            if (p >= 50 && p < 75) corBarra = 'bg-yellow-400';
            else if (p >= 75) corBarra = 'bg-red-500';

            let infoText = '';
            if (tipoCalculo === 'DEBITO') {
                infoText = `<span>Gasto: ${formatarMoedaSimples(Math.abs(atual))}</span><span>Teto: ${formatarMoedaSimples(meta)}</span>`;
            } else {
                infoText = `<span></span><span>Teto: ${formatarMoedaSimples(meta)}</span>`;
            }

            return `
                <div class="mt-3 w-full">
                    <div class="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1.5">
                        <div class="h-full ${corBarra} transition-all" style="width: ${p}%"></div>
                    </div>
                    <div class="flex justify-between text-[10px] lg:text-[10px] font-black uppercase text-slate-600 tracking-wide">
                        ${infoText}
                    </div>
                </div>`;
        };

        let clockHtml = '';
        if (conta.tipo === 'CREDITO' || conta.tipo === 'AMBOS') {
            const faturaDoRelogio = faturasAbertas.find(f => f.conta.toUpperCase() === nomeUpper && String(f.mes_fatura).toLowerCase() === mesAtualLower && String(f.status).toUpperCase() !== 'PAGO');

            if (faturaDoRelogio && faturaDoRelogio.dia_vencimento) {
                const dataVenc = new Date(hj.getFullYear(), hj.getMonth(), faturaDoRelogio.dia_vencimento);
                hj.setHours(0,0,0,0); dataVenc.setHours(0,0,0,0);
                const diffDays = Math.ceil((dataVenc - hj) / (1000 * 60 * 60 * 24));

                if (diffDays >= 0 && diffDays <= 3) {
                    const txt = diffDays === 0 ? 'Vence Hoje!' : `Vence em ${diffDays} dia(s)`;
                    clockHtml = `<i class="fas fa-clock text-red-500 animate-blink-5 cursor-pointer text-[14px] ml-2 relative z-10" onclick="alert('${txt}'); event.stopPropagation();" title="${txt}"></i>`;
                } else if (diffDays > 3 && diffDays <= 5) {
                    clockHtml = `<i class="fas fa-clock text-yellow-500 cursor-pointer text-[14px] ml-2 relative z-10" onclick="alert('Vence em ${diffDays} dias'); event.stopPropagation();" title="Vence em ${diffDays} dias"></i>`;
                } else if (diffDays > 5 && diffDays <= 10) {
                    clockHtml = `<i class="fas fa-clock text-gray-400 cursor-pointer text-[14px] ml-2 relative z-10" onclick="alert('Vence em ${diffDays} dias'); event.stopPropagation();" title="Vence em ${diffDays} dias"></i>`;
                } else if (diffDays < 0) {
                    clockHtml = `<i class="fas fa-exclamation-circle text-red-600 cursor-pointer text-[14px] ml-2 relative z-10" onclick="alert('Fatura Atrasada!'); event.stopPropagation();" title="Fatura Atrasada!"></i>`;
                }
            }
        }

        let htmlCorpo = '';
        let htmlRodapeInvestimento = '';
        const numClasses = "font-black tracking-tighter mt-0 w-full truncate text-2xl lg:text-2xl cursor-pointer hover:opacity-80 transition-opacity";

        const isSingleDebito = conta.tipo === 'DEBITO';
        const isSingleCredito = conta.tipo === 'CREDITO';

        let corDebitoClass = conta.saldo_debito >= 0 ? 'text-emerald-600' : 'text-red-600';
        let corCreditoClass = conta.fatura_atual === 0 ? 'text-emerald-600' : 'text-red-600';

        const divDebito = `
            <div class="${isSingleDebito ? 'w-full flex-col items-center text-center' : 'w-1/2 border-r flex flex-col justify-center'} p-4 flex overflow-hidden relative">
                <div class="flex ${isSingleDebito ? 'justify-center w-full relative' : 'justify-between'} items-start mb-0 w-full">
                    <div class="flex flex-col ${isSingleDebito ? 'items-center' : 'items-start'} cursor-pointer hover:text-slate-800 transition-colors" onclick="irParaTransacoes('${conta.nome}')">
                        <p class="text-[13px] lg:text-[14px] font-black uppercase text-slate-600 tracking-widest">Débito</p>
                        ${!isSingleDebito ? `<p class="flex items-center mt-0"><span class="text-[9px] lg:text-[9px] opacity-0 pointer-events-none select-none">&nbsp;</span></p>` : ''}
                    </div>
                    <button onclick="abrirModalTransacaoRapida('${conta.nome}', 'DEBITO', '${conta.cor}'); event.stopPropagation();" class="${isSingleDebito ? 'absolute right-0 top-0' : ''} w-6 h-6 rounded bg-gray-100 text-gray-400 hover:bg-slate-800 hover:text-white flex items-center justify-center transition-colors text-[10px] shrink-0 relative z-10"><i class="fas fa-plus"></i></button>
                </div>
                <p class="${numClasses} ${corDebitoClass} ${isSingleDebito ? 'text-center' : 'text-left'}" onclick="irParaTransacoes('${conta.nome}')" title="${conta.saldo_debito}">${formatarValorCompacto(conta.saldo_debito)}</p>
                ${calcularDeltaHtml(conta.gasto_debito_atual, conta.gasto_debito_ant, isSingleDebito, index, 'DEBITO')}
                ${criarBarraMeta(conta.gasto_debito_atual, conta.meta_debito, isSingleDebito, 'DEBITO')}
            </div>`;

        const divCredito = `
            <div class="${isSingleCredito ? 'w-full flex-col items-center text-center' : 'w-1/2 flex flex-col justify-center'} p-4 flex overflow-hidden relative">
                <div class="flex ${isSingleCredito ? 'justify-center w-full relative' : 'justify-between'} items-start mb-0 w-full">
                    <div class="flex flex-col ${isSingleCredito ? 'items-center' : 'items-start'} cursor-pointer hover:text-slate-800 transition-colors" onclick="irParaFaturas('${conta.nome}')">
                        <p class="text-[13px] lg:text-[14px] font-black uppercase text-slate-600 tracking-widest flex items-center">Crédito ${clockHtml}</p>
                        <p class="flex items-center gap-1 mt-0"><span class="text-[9px] lg:text-[9px] lowercase opacity-90 text-gray-400 font-bold">(mês atual)</span></p>
                    </div>
                    <button onclick="abrirModalTransacaoRapida('${conta.nome}', 'CREDITO', '${conta.cor}'); event.stopPropagation();" class="${isSingleCredito ? 'absolute right-0 top-0' : ''} w-6 h-6 rounded bg-gray-100 text-gray-400 hover:bg-slate-800 hover:text-white flex items-center justify-center transition-colors text-[10px] shrink-0 relative z-10"><i class="fas fa-plus"></i></button>
                </div>
                <p class="${numClasses} ${corCreditoClass} ${isSingleCredito ? 'text-center' : 'text-left'}" onclick="irParaFaturas('${conta.nome}')" title="${conta.fatura_atual}">${formatarValorCompacto(conta.fatura_atual)}</p>
                ${calcularDeltaHtml(conta.fatura_atual, conta.fatura_ant, isSingleCredito, index, 'CREDITO')}
                ${criarBarraMeta(conta.fatura_atual, conta.meta_credito, isSingleCredito, 'CREDITO')}
            </div>`;

        htmlCorpo = (conta.tipo === 'DEBITO') ? divDebito : (conta.tipo === 'CREDITO' ? divCredito : divDebito + divCredito);

        if (conta.saldo_investimento && conta.saldo_investimento > 0) {
            htmlRodapeInvestimento = `
                <div class="bg-blue-50/70 border-t border-blue-100/50 p-2.5 px-4 flex justify-between items-center cursor-pointer hover:bg-blue-100 transition-colors relative z-10" onclick="window.location.href='investimentos.html'; event.stopPropagation();">
                    <span class="text-[10px] font-black uppercase text-blue-600 tracking-widest"><i class="fas fa-chart-line mr-1.5"></i> Investimentos</span>
                    <span class="text-[11px] font-black text-blue-700">${formatarMoedaSimples(conta.saldo_investimento)}</span>
                </div>`;
        }

        let cardHtml = `
            <div class="bg-white rounded-2xl shadow-suave border border-gray-100 overflow-hidden flex flex-col transform transition-transform hover:-translate-y-1 relative h-full min-h-[120px] lg:min-h-[190px] ${classOpacidade}">
                <div class="p-4 flex justify-between items-start" style="background-color: ${conta.cor};">
                    <div class="flex flex-col">
                        <h3 class="font-black text-white uppercase tracking-widest text-sm">${conta.nome}</h3>
                        <span class="text-[9px] font-black uppercase text-white/80 mt-0.5">${labelTipo}</span>
                    </div>
                    <div class="flex gap-1 relative z-10">
                        <button onclick="abrirModalHistorico(${index}, 'AMBOS', event)" class="text-white/80 hover:text-white p-1.5 outline-none"><i class="fas fa-chart-bar"></i></button>
                        <button onclick="abrirModalConfigConta(${index})" class="text-white/80 hover:text-white p-1.5 outline-none"><i class="fas fa-cog"></i></button>
                    </div>
                </div>
                <div class="flex-1 flex">${htmlCorpo}</div>
                ${htmlRodapeInvestimento}
            </div>`;

        if (isAtiva) {
            htmlContasAtivas += cardHtml;
        } else {
            htmlContasInativas += cardHtml;
        }
    });

    document.getElementById('grid-contas-ativas').innerHTML = btnNovoHtml + htmlContasAtivas;

    let htmlFinalInativas = '';
    if (htmlContasInativas !== '') {
        htmlFinalInativas = `
            <div class="mt-8 mb-4">
                <button onclick="document.getElementById('grid-inativas').classList.toggle('hidden'); document.getElementById('icon-inativas').classList.toggle('rotate-180')" class="w-full flex items-center gap-3 outline-none hover:opacity-80 transition-opacity">
                    <div class="h-px bg-gray-300 flex-1"></div>
                    <span class="text-xs font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
                        Contas Inativas <i id="icon-inativas" class="fas fa-chevron-down transition-transform"></i>
                    </span>
                    <div class="h-px bg-gray-300 flex-1"></div>
                </button>
            </div>
            <div id="grid-inativas" class="hidden grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-fr mb-8">
                ${htmlContasInativas}
            </div>
        `;
    }
    document.getElementById('container-inativas').innerHTML = htmlFinalInativas;

    document.getElementById('val-td').innerText = formatarMoedaSimples(totalSaldosGeral);
    document.getElementById('val-tf').innerText = formatarMoedaSimples(totalFaturasAbertas);
    document.getElementById('val-ti').innerText = formatarMoedaSimples(totalInvestido);
}


// ==========================================
// MÓDULO: HISTÓRICO AVANÇADO (GRÁFICO DE LINHAS)
// ==========================================
function abrirModalHistorico(indexConta, tipoAba = 'AMBOS', e = null) {
    if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
        e.preventDefault();
    }
    try {
        histContaAtiva = contasBanco[indexConta];
        histOffset = 0;
        document.getElementById('hh-header').style.backgroundColor = histContaAtiva.cor;
        document.getElementById('hh-titulo').innerText = `Histórico: ${histContaAtiva.nome}`;
        document.getElementById('modal-historico').classList.remove('hidden');

        if(histContaAtiva.tipo === 'DEBITO') tipoAba = 'DEBITO';
        if(histContaAtiva.tipo === 'CREDITO') tipoAba = 'CREDITO';

        mudarAbaHist(tipoAba);
    } catch(err) {}
}

function mudarFluxoDebito(fluxo) {
    histDebitoFluxo = fluxo;

    if(fluxo === 'SAIDA') {
        document.getElementById('btn-fluxo-saida').classList.add('bg-white', 'shadow', 'text-slate-800');
        document.getElementById('btn-fluxo-saida').classList.remove('text-gray-400');
        document.getElementById('btn-fluxo-entrada').classList.remove('bg-white', 'shadow', 'text-slate-800');
        document.getElementById('btn-fluxo-entrada').classList.add('text-gray-400');
    } else {
        document.getElementById('btn-fluxo-entrada').classList.add('bg-white', 'shadow', 'text-slate-800');
        document.getElementById('btn-fluxo-entrada').classList.remove('text-gray-400');
        document.getElementById('btn-fluxo-saida').classList.remove('bg-white', 'shadow', 'text-slate-800');
        document.getElementById('btn-fluxo-saida').classList.add('text-gray-400');
    }
    renderizarGraficoHist();
}

function mudarAbaHist(tipo) {
    histAbaAtiva = tipo;
    ['DEBITO', 'CREDITO', 'AMBOS'].forEach(t => {
        let btn = document.getElementById(`aba-hist-${t}`);
        if(btn) {
            if(t === tipo) btn.className = `pb-1 text-[10px] uppercase tracking-widest outline-none transition-colors tab-ativa`;
            else btn.className = `pb-1 text-[10px] uppercase tracking-widest outline-none transition-colors tab-inativa`;

            if(histContaAtiva.tipo === 'DEBITO' && (t === 'CREDITO' || t === 'AMBOS')) btn.style.display = 'none';
            else if(histContaAtiva.tipo === 'CREDITO' && (t === 'DEBITO' || t === 'AMBOS')) btn.style.display = 'none';
            else btn.style.display = 'block';
        }
    });

    let toggleContainer = document.getElementById('toggle-fluxo-debito');
    if(toggleContainer) {
        toggleContainer.style.visibility = (tipo === 'CREDITO') ? 'hidden' : 'visible';
    }

    renderizarGraficoHist();
}

function paginarHist(direcao) { histOffset += direcao; if(histOffset < 0) histOffset = 0; renderizarGraficoHist(); }

function renderizarGraficoHist() {
    try {
        const nomeUpper = histContaAtiva.nome.toUpperCase(); const hj = new Date();
        const maxColunas = window.innerWidth >= 1024 ? 5 : 3; const startIdx = histOffset * maxColunas;

        const btnNext = document.getElementById('btn-hist-next');
        if(histOffset > 0) btnNext.classList.remove('opacity-0', 'pointer-events-none');
        else btnNext.classList.add('opacity-0', 'pointer-events-none');

        let dadosGrafico = []; let maxValor = 0;

        for(let i = (startIdx + maxColunas - 1); i >= startIdx; i--) {
            let dataRef = new Date(hj.getFullYear(), hj.getMonth() - i, 1);
            let mesFormatoVisual = `${String(dataRef.getMonth() + 1).padStart(2, '0')}/${String(dataRef.getFullYear()).slice(-2)}`;
            let mesFormatoBanco = `${MESES_NOMES[dataRef.getMonth()]}/${String(dataRef.getFullYear()).slice(-2)}`;

            let somaDeb = 0; let somaCred = 0;

            if (Array.isArray(dadosHistorico)) {
                dadosHistorico.forEach(h => {
                    if (h.banco === nomeUpper && h.mes === mesFormatoBanco) {
                        let valorNum = Math.abs(parseFloat(String(h.valor).replace(/\./g, '').replace(',', '.')) || 0);
                        if (h.forma === "DEBITO" && h.fluxo === histDebitoFluxo) { somaDeb += valorNum; }
                        if (h.forma === "CREDITO") { somaCred += valorNum; }
                    }
                });
            }

            if((histAbaAtiva === 'DEBITO' || histAbaAtiva === 'AMBOS') && somaDeb > maxValor) maxValor = somaDeb;
            if((histAbaAtiva === 'CREDITO' || histAbaAtiva === 'AMBOS') && somaCred > maxValor) maxValor = somaCred;

            dadosGrafico.push({ label: mesFormatoVisual, deb: somaDeb, cred: somaCred });
        }

        if(maxValor === 0) maxValor = 1;

        let svgW = 600; let svgH = 150;
        let stepX = svgW / Math.max(1, maxColunas - 1);

        let ptsDeb = dadosGrafico.map((d,i) => `${i*stepX},${svgH - (d.deb/maxValor)*svgH}`).join(' ');
        let ptsCred = dadosGrafico.map((d,i) => `${i*stepX},${svgH - (d.cred/maxValor)*svgH}`).join(' ');

        let svgHtml = `<svg viewBox="-30 -30 ${svgW+60} ${svgH+60}" class="w-full h-full overflow-visible bg-slate-50 rounded-xl" preserveAspectRatio="none">`;

        for(let i=0; i<=4; i++) {
            let y = (svgH / 4) * i;
            svgHtml += `<line x1="0" y1="${y}" x2="${svgW}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4"/>`;
        }

        let corDebito = histDebitoFluxo === 'SAIDA' ? '#F59E0B' : '#10B981';

        if (histAbaAtiva === 'DEBITO' || histAbaAtiva === 'AMBOS') {
            svgHtml += `<polyline points="${ptsDeb}" fill="none" stroke="${corDebito}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
            dadosGrafico.forEach((d,i) => {
                let cx = i*stepX; let cy = svgH - (d.deb/maxValor)*svgH;
                let textY = cy - 12;
                if (histAbaAtiva === 'AMBOS') {
                     let cyCred = svgH - (d.cred/maxValor)*svgH;
                     if (Math.abs(cy - cyCred) < 15) { if (cy < cyCred) textY = cy - 14; else textY = cy + 26; }
                }
                svgHtml += `<circle cx="${cx}" cy="${cy}" r="5" fill="${corDebito}" stroke="#ffffff" stroke-width="2"/>`;
                svgHtml += `<text x="${cx}" y="${textY}" fill="${corDebito}" font-size="14" font-weight="900" text-anchor="middle">${formatarMoedaSimples(d.deb)}</text>`;
            });
        }

        if (histAbaAtiva === 'CREDITO' || histAbaAtiva === 'AMBOS') {
            svgHtml += `<polyline points="${ptsCred}" fill="none" stroke="#EF4444" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
            dadosGrafico.forEach((d,i) => {
                let cx = i*stepX; let cy = svgH - (d.cred/maxValor)*svgH;
                let textY = cy - 12;
                if (histAbaAtiva === 'AMBOS') {
                     let cyDeb = svgH - (d.deb/maxValor)*svgH;
                     if (Math.abs(cy - cyDeb) < 15) { if (cy < cyDeb) textY = cy - 14; else textY = cy + 26; }
                }
                svgHtml += `<circle cx="${cx}" cy="${cy}" r="5" fill="#EF4444" stroke="#ffffff" stroke-width="2"/>`;
                svgHtml += `<text x="${cx}" y="${textY}" fill="#EF4444" font-size="14" font-weight="900" text-anchor="middle">${formatarMoedaSimples(d.cred)}</text>`;
            });
        }
        svgHtml += `</svg>`;

        let labelsHtml = `<div class="flex justify-between w-full mt-2 absolute bottom-[-10px] left-0 px-6 sm:px-8">`;
        dadosGrafico.forEach(d => { labelsHtml += `<span class="text-[11px] lg:text-[10px] font-black text-slate-500">${d.label}</span>`; });
        labelsHtml += `</div>`;

        let container = document.getElementById('hist-chart-container');
        container.className = "relative w-full h-40 my-4 ml-2 mr-2";
        container.innerHTML = svgHtml + labelsHtml;
    } catch(err) {}
}

let catInput = document.getElementById('tr-categoria-input');
let catDrop = document.getElementById('tr-categoria-drop');

function mostrarDropCategorias() { filtrarCategorias(); catDrop.classList.remove('hidden'); }
function esconderDropCategorias() { setTimeout(() => catDrop.classList.add('hidden'), 200); }

function filtrarCategorias() {
    let term = catInput.value.toUpperCase();
    let cacheMapeado = categoriasCache.map(c => typeof c === 'string' ? c : (c.nome || c.categoria)).filter(c => c && c.toUpperCase() !== 'GERAL');
    let filtered = cacheMapeado.filter(c => c.toUpperCase().includes(term));
    let html = '';
    filtered.forEach(c => { html += `<div class="p-3 text-xs font-black uppercase text-gray-600 hover:bg-slate-100 cursor-pointer" onclick="selecionarCategoria('${c}')">${c}</div>`; });
    let exactMatch = filtered.find(c => c.toUpperCase() === term);
    if (term && !exactMatch) { html += `<div class="p-3 text-xs font-black uppercase text-blue-600 hover:bg-blue-50 cursor-pointer border-t border-gray-100 flex items-center" onclick="criarSelecionarCategoria('${term}')"><i class="fas fa-plus-circle mr-2"></i> Criar: ${term}</div>`; }
    if(!html) html = `<div class="p-3 text-xs font-black uppercase text-gray-400">Geral</div>`;
    catDrop.innerHTML = html;
}

function selecionarCategoria(nome) { catInput.value = nome; catDrop.classList.add('hidden'); }
function criarSelecionarCategoria(nome) { catInput.value = nome; catDrop.classList.add('hidden'); fetch(API_URL + '?tipo=criar_categoria', { method: 'POST', body: JSON.stringify({nome: nome}) }).catch(()=>{}); if(!categoriasCache.includes(nome)) categoriasCache.push(nome); notify('sucesso', 'Nova Categoria associada!'); }

function irParaFaturas(conta) { window.location.href = `faturas.html?conta=${encodeURIComponent(conta.toUpperCase())}`; }
function irParaTransacoes(conta) { window.location.href = `index.html?conta=${encodeURIComponent(conta.toUpperCase())}`; }

function gerarPaletaDeCores(prefixo) { const container = document.getElementById(`paleta-cores-${prefixo}`); container.innerHTML = ''; CORES_VIVAS.forEach(cor => { container.innerHTML += `<div onclick="selecionarCor('${prefixo}', '${cor}')" class="color-option shadow-sm ${prefixo}-cor-opt" style="background-color: ${cor}" id="${prefixo}-cor-${cor.replace('#', '')}"></div>`; }); }
function selecionarCor(prefixo, corHex) { document.querySelectorAll(`.${prefixo}-cor-opt`).forEach(el => el.classList.remove('selected')); document.getElementById(`${prefixo}-cor-${corHex.replace('#', '')}`).classList.add('selected'); document.getElementById(`${prefixo}-cor`).value = corHex; }

function abrirModalNovaConta() { document.getElementById('nc-nome').value = ''; document.getElementById('nc-tipo').value = 'AMBOS'; selecionarCor('nc', CORES_VIVAS[6]); document.getElementById('modal-nova-conta').classList.remove('hidden'); }
async function efetivarNovaConta() {
    const nome = document.getElementById('nc-nome').value.trim().toUpperCase(); if (!nome) return notify('erro', 'Nome obrigatório!');
    const btn = document.getElementById('btn-salvar-nc'); btn.innerText = "CRIANDO..."; btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}?tipo=criar_conta`, { method: 'POST', redirect: 'follow', body: JSON.stringify({ nome: nome, tipo: document.getElementById('nc-tipo').value, cor: document.getElementById('nc-cor').value }) }).then(r => r.json());
        if (res.status === "erro") throw new Error(res.mensagem); notify('sucesso', 'Conta Criada!'); fecharModais(); await buscarDados();
    } catch (e) { notify('erro', e.message); }
    btn.innerText = "Criar Conta"; btn.disabled = false;
}

function abrirModalConfigConta(index) {
    const conta = contasBanco[index];
    document.getElementById('cc-nome-original').value = conta.nome; document.getElementById('cc-nome').value = conta.nome; document.getElementById('cc-tipo').value = conta.tipo; selecionarCor('cc', conta.cor);
    document.getElementById('cc-meta-debito').value = conta.meta_debito > 0 ? conta.meta_debito : ""; document.getElementById('cc-meta-credito').value = conta.meta_credito > 0 ? conta.meta_credito : "";
    const inputAtivo = document.getElementById('cc-ativo'); const bg = document.getElementById('btn-toggle-ativo'); const bolinha = document.getElementById('toggle-bolinha');
    if (conta.status === "ATIVO") { inputAtivo.value = "ATIVO"; bg.className = "w-12 h-6 rounded-full bg-emerald-500 relative transition-colors shadow-inner outline-none pointer-events-none"; bolinha.className = "w-4 h-4 bg-white rounded-full absolute top-1 left-[26px] transition-all shadow-sm"; }
    else { inputAtivo.value = "INATIVO"; bg.className = "w-12 h-6 rounded-full bg-gray-300 relative transition-colors shadow-inner outline-none pointer-events-none"; bolinha.className = "w-4 h-4 bg-white rounded-full absolute top-1 left-1 transition-all shadow-sm"; }
    document.getElementById('modal-config-conta').classList.remove('hidden');
}

function toggleAtivo() {
    const input = document.getElementById('cc-ativo'); const bg = document.getElementById('btn-toggle-ativo'); const bolinha = document.getElementById('toggle-bolinha');
    if (input.value === "ATIVO") { input.value = "INATIVO"; bg.classList.replace('bg-emerald-500', 'bg-gray-300'); bolinha.classList.replace('left-[26px]', 'left-1'); }
    else { input.value = "ATIVO"; bg.classList.replace('bg-gray-300', 'bg-emerald-500'); bolinha.classList.replace('left-1', 'left-[26px]'); }
}

async function efetivarConfigConta() {
    const novoNome = document.getElementById('cc-nome').value.trim().toUpperCase(); if (!novoNome) return notify('erro', 'Nome vazio!');
    const btn = document.getElementById('btn-salvar-cc'); btn.innerText = "SALVANDO..."; btn.disabled = true;
    try {
        const payload = { nome_atual: document.getElementById('cc-nome-original').value, novo_nome: novoNome, tipo: document.getElementById('cc-tipo').value, cor: document.getElementById('cc-cor').value, status: document.getElementById('cc-ativo').value, meta_debito: parseFloat(document.getElementById('cc-meta-debito').value) || 0, meta_credito: parseFloat(document.getElementById('cc-meta-credito').value) || 0 };
        const res = await fetch(`${API_URL}?tipo=editar_conta`, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) }).then(r => r.json());
        if (res.status === "erro") throw new Error(res.mensagem); notify('sucesso', 'Salvo!'); fecharModais(); await buscarDados();
    } catch (e) { notify('erro', e.message); }
    btn.innerText = "Salvar Configurações"; btn.disabled = false;
}

function abrirModalTransacaoRapida(nomeConta, formaPagamento, corHeader) {
    document.getElementById('tr-header').style.backgroundColor = corHeader; document.getElementById('tr-subtitle').innerText = `${formaPagamento} - ${nomeConta}`; document.getElementById('tr-conta').value = nomeConta; document.getElementById('tr-forma').value = formaPagamento;
    const hj = new Date(); document.getElementById('tr-data').value = `${String(hj.getDate()).padStart(2, '0')}/${String(hj.getMonth() + 1).padStart(2, '0')}/${hj.getFullYear()}`; document.getElementById('tr-valor').value = ''; document.getElementById('tr-local').value = ''; document.getElementById('tr-descricao').value = ''; document.getElementById('tr-categoria-input').value = '';
    const boxParcelas = document.getElementById('tr-box-parcelas');
    if (formaPagamento === 'CREDITO') { boxParcelas.classList.remove('hidden'); document.getElementById('tr-parcelas').value = '1'; document.getElementById('tr-mes-fatura').value = `${String(hj.getMonth() + 1).padStart(2, '0')}/${String(hj.getFullYear()).slice(-2)}`; }
    else { boxParcelas.classList.add('hidden'); document.getElementById('tr-mes-fatura').value = ''; }
    document.getElementById('modal-transacao-rapida').classList.remove('hidden');
}

async function salvarTransacaoRapida() {
    const dataBr = document.getElementById('tr-data').value; const valorDigitado = parseFloat(document.getElementById('tr-valor').value.replace(',', '.')); const local = document.getElementById('tr-local').value; const descricao = document.getElementById('tr-descricao').value; const categoria = document.getElementById('tr-categoria-input').value || "GERAL"; const conta = document.getElementById('tr-conta').value; const formaPag = document.getElementById('tr-forma').value; const parcelasNum = parseInt(document.getElementById('tr-parcelas').value) || 1; const mesFaturaInput = document.getElementById('tr-mes-fatura').value;
    if(dataBr.length !== 10) return notify('erro', 'Data inválida'); if(isNaN(valorDigitado) || valorDigitado <= 0) return notify('erro', 'Valor zerado'); if(!local) return notify('erro', 'Preencha o Local');

    let mesFaturaFormatado = "";
    if (formaPag === 'CREDITO') { const p = mesFaturaInput.split('/'); if(p.length!==2 || p[0]<1 || p[0]>12) return notify('erro', 'Mês inválido'); mesFaturaFormatado = `${MESES_NOMES[parseInt(p[0])-1]}/${p[1]}`; }
    const [dia, mes, ano] = dataBr.split('/');
    const btn = document.getElementById('btn-salvar-tr'); btn.innerText = "Salvando..."; btn.disabled = true;
    try {
        const payload = { data: `${ano}-${mes}-${dia}`, valor: (valorDigitado / parcelasNum).toFixed(2), local: local, descricao: descricao, categoria: categoria, conta: conta, tipo: "SAIDA", forma_pagamento: formaPag, mes_fatura: mesFaturaFormatado, parcela: parcelasNum > 1 ? `1/${parcelasNum}` : "" };
        const res = await fetch(API_URL + '?tipo=criar_gasto', { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) }).then(r => r.json());
        if (res.status === "erro") throw new Error(res.mensagem); notify('sucesso', 'Lançamento efetuado!'); fecharModais(); await buscarDados();
    } catch(e) { notify('erro', e.message); }
    btn.innerText = "Salvar Transação"; btn.disabled = false;
}

function mascaraData(input) { let v = input.value.replace(/\D/g, ''); if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2); if (v.length > 5) v = v.substring(0, 5) + '/' + v.substring(5, 9); input.value = v; }
function mascaraMesAno(input) { let v = input.value.replace(/\D/g, ''); if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2, 4); input.value = v; }
function mascaraValor(input) { let v = input.value.replace(/[^0-9.,]/g, '').replace(/\./g, ','); const parts = v.split(','); if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join(''); if (parts.length === 2 && parts[1].length > 2) v = parts[0] + ',' + parts[1].substring(0, 2); input.value = v; }

function fecharModais() { document.getElementById('modal-nova-conta').classList.add('hidden'); document.getElementById('modal-config-conta').classList.add('hidden'); document.getElementById('modal-transacao-rapida').classList.add('hidden'); document.getElementById('modal-historico').classList.add('hidden'); }
function toggleSidebar() { const sidebar = document.getElementById('sidebar-lateral'); const overlay = document.getElementById('sidebar-overlay'); const icon = document.getElementById('menu-icon'); if (sidebar.classList.contains('-translate-x-full')) { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); icon.classList.replace('fa-bars', 'fa-times'); } else { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); icon.classList.replace('fa-times', 'fa-bars'); } }
function atualizarStatus(tipo) { const el = document.getElementById('status-conexao-flutuante'); const span = document.getElementById('status-text'); const icon = document.getElementById('status-icon'); clearTimeout(statusTimeout1); clearTimeout(statusTimeout2); el.classList.remove('opacity-0', 'scale-75'); el.classList.add('opacity-100', 'scale-100', 'lg:px-4', 'lg:gap-3'); el.classList.remove('lg:px-0', 'lg:w-10', 'lg:h-10', 'lg:justify-center'); span.className = "hidden lg:inline-block"; const baseClass = "pointer-events-auto cursor-pointer flex items-center justify-center lg:justify-start gap-0 lg:gap-3 text-xs lg:text-sm font-black uppercase tracking-widest w-10 h-10 lg:w-auto lg:h-auto rounded-full border shadow-2xl transition-all duration-500 transform opacity-100 scale-100 "; if (tipo === 'conectando') { el.className = baseClass + "text-yellow-600 bg-yellow-50 border-yellow-200 lg:px-4"; span.innerText = "Conectando..."; icon.className = "fas fa-sync fa-spin text-lg"; } else if (tipo === 'sucesso') { el.className = baseClass + "text-green-600 bg-green-50 border-green-200 lg:px-4"; span.innerText = "Banco Conectado"; icon.className = "fas fa-check-circle text-lg"; statusTimeout1 = setTimeout(() => { span.classList.replace('lg:inline-block', 'hidden'); el.classList.remove('lg:px-4', 'lg:gap-3'); el.classList.add('lg:px-0', 'lg:w-10', 'lg:h-10', 'lg:justify-center'); statusTimeout2 = setTimeout(() => { el.classList.remove('opacity-100', 'scale-100'); el.classList.add('opacity-0', 'scale-75'); }, 1500); }, 3000); } else { el.className = baseClass + "text-red-600 bg-red-50 border-red-200 lg:px-4"; span.innerText = "Erro Banco"; icon.className = "fas fa-exclamation-triangle text-lg"; } }
function notify(tipo, msg) { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `${tipo === 'sucesso' ? 'bg-emerald-600' : 'bg-red-600'} text-white px-8 py-3 rounded-xl shadow-2xl font-black text-[10px] uppercase tracking-widest animate-bounce mt-2`; toast.innerText = msg; container.appendChild(toast); setTimeout(() => toast.remove(), 3000); }