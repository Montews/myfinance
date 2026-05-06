const API_URL = "https://script.google.com/macros/s/AKfycbznMspp-LOSjo_bqQAhX4Y3PHx12FDcDeFYOeo9vBIroX0UyHv0OVZoPOnD5z5-QcOu/exec";

let dadosFaturas = [];
let faturasUrgentes = [];
let gastosCompletosCache = [];
let categoriasCache = [];
let contasCacheUnicas = [];
let faturaAbertaAtual = null;
let idDeleteAtual = null;

let mesInicioSel = null;
let mesFimSel = null;
let anoExibido = new Date().getFullYear();

const MESES_NOMES = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

window.addEventListener('load', () => {
    const hoje = new Date();
    const mesAtual = {
        mes: MESES_NOMES[hoje.getMonth()], ano: hoje.getFullYear(),
        order: (hoje.getFullYear() * 100) + hoje.getMonth(),
        raw: `${MESES_NOMES[hoje.getMonth()]}/${hoje.getFullYear().toString().slice(-2)}`
    };
    mesInicioSel = mesAtual; mesFimSel = mesAtual;

    document.getElementById('filtro-status').value = 'TODOS';
    document.getElementById('filtro-conta').value = 'TODOS';
    atualizarLabelsPeriodo();
    buscarDados();
});

async function buscarDados() {
    atualizarStatus('conectando');
    try {
        const [resFaturas, resGastos, resCategorias] = await Promise.all([
            fetch(`${API_URL}?tipo=faturas_resumo`),
            fetch(`${API_URL}?tipo=todos`),
            fetch(`${API_URL}?tipo=categorias`)
        ]);
        dadosFaturas = await resFaturas.json();
        gastosCompletosCache = await resGastos.json();

        contasCacheUnicas = [...new Set(gastosCompletosCache.map(g => g.conta))].filter(c => c);
        preencherSelectContas();

        try {
            categoriasCache = await resCategorias.json();
            preencherSelectCategorias();
        } catch(e) { console.error("Sem categorias."); }

        processarFaturas();
        atualizarStatus('sucesso');
    } catch (e) {
        atualizarStatus('erro');
        notify('erro', 'Falha na conexão');
    }
}

// NOVO: Preenche as opções de contas do Filtro de forma dinâmica
function preencherSelectContas() {
    const selectContaFiltro = document.getElementById('filtro-conta');
    const valorAtualFiltro = selectContaFiltro.value;

    selectContaFiltro.innerHTML = '<option value="TODOS">TODAS AS CONTAS</option>';
    contasCacheUnicas.forEach(c => {
        selectContaFiltro.innerHTML += `<option value="${c}">${c.toUpperCase()}</option>`;
    });

    if ([...selectContaFiltro.options].some(o => o.value === valorAtualFiltro)) {
        selectContaFiltro.value = valorAtualFiltro;
    }
}

function preencherSelectCategorias() {
    const selects = [document.getElementById('nt-categoria'), document.getElementById('et-categoria')];
    selects.forEach(select => {
        if(!select) return;
        select.innerHTML = '<option value="GERAL">GERAL</option>';
        categoriasCache.forEach(c => {
            const nome = typeof c === 'string' ? c : (c.nome || c.categoria);
            if (nome) {
                const nomeLimpo = nome.trim();
                if (nomeLimpo.toUpperCase() !== 'GERAL') {
                    select.innerHTML += `<option value="${nomeLimpo}">${nomeLimpo}</option>`;
                }
            }
        });
    });
}

function processarFaturas() {
    const statusFiltro = document.getElementById('filtro-status').value;
    const contaFiltro = document.getElementById('filtro-conta').value; // Filtro de Conta

    let pagoTotal = 0, pendenteTotal = 0, creditoFuturo = 0, totalUrgente = 0;
    faturasUrgentes = [];

    document.getElementById('grid-bancos').innerHTML = `
        <button onclick="abrirModalCriarFatura()" class="order-last md:order-first group flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-xl p-4 lg:p-6 min-h-[180px] lg:min-h-[220px] hover:bg-emerald-50 hover:border-emerald-300 transition-all cursor-pointer h-full">
            <div class="w-12 h-12 lg:w-16 lg:h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-xl lg:text-2xl mb-3 lg:mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <i class="fas fa-plus"></i>
            </div>
            <span class="text-gray-500 font-black text-[11px] lg:text-sm uppercase tracking-widest group-hover:text-emerald-600 transition-colors">Nova Fatura</span>
        </button>
    `;

    const hoje = new Date();
    const diaAtual = hoje.getDate();
    const ordemHoje = (hoje.getFullYear() * 100) + hoje.getMonth();

    const getOrder = (raw) => {
        const [m, a] = raw.split('/');
        return (parseInt("20" + a) * 100) + MESES_NOMES.indexOf(m.toUpperCase());
    };

    dadosFaturas.forEach(f => {
        const matchContaGlobal = contaFiltro === 'TODOS' || f.conta.toUpperCase() === contaFiltro.toUpperCase();

        // Aplica o filtro de Conta para os cálculos e exibição
        if (matchContaGlobal) {
            const valor = parseFloat(f.valor_total) || 0;
            const status = f.status.toUpperCase();
            const fOrder = getOrder(f.mes_fatura);
            const diaVencimento = f.dia_vencimento ? parseInt(f.dia_vencimento) : 10;

            const estaAtrasada = (fOrder < ordemHoje && status !== 'PAGO');
            const venceLogo = (fOrder === ordemHoje && status !== 'PAGO' && (diaVencimento - diaAtual <= 3) && (diaVencimento - diaAtual >= 0));

            if (status !== 'PAGO') {
                creditoFuturo += valor;
                if (estaAtrasada || venceLogo) {
                    totalUrgente += valor;
                    faturasUrgentes.push({...f, estaAtrasada, venceLogo});
                }
            }

            if (fOrder >= mesInicioSel.order && fOrder <= mesFimSel.order) {
                const matchStatus = statusFiltro === 'TODOS' || status === statusFiltro;
                if (matchStatus) {
                    if (status === 'PAGO') pagoTotal += valor;
                    else pendenteTotal += valor;
                    renderizarCardPrincipal(f, estaAtrasada, venceLogo, diaVencimento);
                }
            }
        }
    });

    document.getElementById('total-pago').innerText = formatarMoeda(pagoTotal);
    document.getElementById('total-pendente').innerText = formatarMoeda(pendenteTotal);
    document.getElementById('total-futuro').innerText = formatarMoeda(creditoFuturo);

    const banner = document.getElementById('container-alerta');
    if (totalUrgente > 0 && !banner.classList.contains('dismissed')) {
        banner.classList.remove('hidden');
        document.getElementById('valor-urgente').innerText = formatarMoeda(totalUrgente);
    } else {
        banner.classList.add('hidden');
    }
}

function renderizarCardPrincipal(f, atrasada, venceLogo, diaVencimento) {
    const isPago = f.status.toUpperCase() === 'PAGO';
    let classeBorda = "border-gray-100", classeRing = "", classeIcone = "fa-credit-card text-blue-500/20";
    let labelStatus = f.status, corTexto = "text-slate-800", bgLabel = isPago ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600';

    if (atrasada) { classeBorda = "border-red-600"; classeRing = "ring-2 ring-red-500"; classeIcone = "fa-exclamation-triangle text-red-500"; labelStatus = "ATRASADA"; corTexto = "text-red-700"; bgLabel = "bg-red-100 text-red-600"; }
    else if (venceLogo) { classeBorda = "border-orange-500"; classeRing = "ring-2 ring-orange-400"; classeIcone = "fa-hourglass-half text-orange-500"; labelStatus = "VENCE EM BREVE"; corTexto = "text-orange-700"; bgLabel = "bg-orange-100 text-orange-700"; }
    else if (isPago) { classeBorda = "border-emerald-500"; }
    else { classeBorda = "border-amber-500"; }

    // NOVO: Verifica se o valor é 0 ou menor, desabilitando o botão
    const valFinal = parseFloat(f.valor_total) || 0;
    const btnQuitarDisabled = valFinal <= 0;

    const btnHtmlQuitar = !isPago
        ? (btnQuitarDisabled
            ? `<button disabled class="flex-1 py-4 bg-gray-200 text-gray-400 border-t border-gray-300 border-l border-white/10 cursor-not-allowed transition-colors text-[10px]">Zerado</button>`
            : `<button onclick="abrirModalPagarFatura('${f.conta}', '${f.mes_fatura}', ${f.valor_total})" class="flex-1 py-4 bg-emerald-600 text-white border-t border-emerald-600 border-l border-white/10 hover:bg-emerald-700 transition-colors">Quitar</button>`)
        : '';

    document.getElementById('grid-bancos').innerHTML += `
        <div class="card-entry bg-white rounded-xl shadow-suave border ${classeBorda} ${classeRing} overflow-hidden flex flex-col h-full transform transition hover:-translate-y-1">
            <div class="bg-slate-50 p-4 border-b flex justify-between items-center font-black">
                <div class="flex flex-col"><span class="text-[10px] text-slate-600 uppercase tracking-widest">${f.conta}</span><span class="text-[8px] text-gray-400 uppercase mt-0.5">${f.mes_fatura}</span></div>
                <i class="fas ${classeIcone} text-lg"></i>
            </div>
            <div class="p-6 text-center border-t-4 ${classeBorda}">
                <p class="text-[8px] font-black text-gray-400 uppercase mb-1">Vencimento dia ${diaVencimento}</p>
                <h2 class="text-2xl font-black ${corTexto} italic">${formatarMoeda(valFinal)}</h2>
                <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded mt-3 inline-block ${bgLabel}">${labelStatus}</span>
            </div>
            <div class="flex mt-auto font-black uppercase text-[10px]">
                <button onclick="abrirDetalhes('${f.conta}', '${f.mes_fatura}', ${diaVencimento})" class="flex-1 py-4 bg-slate-800 text-white hover:bg-slate-700 transition-colors border-t border-slate-800">Detalhes</button>
                ${btnHtmlQuitar}
            </div>
        </div>`;
}

function fecharBannerAlerta() { document.getElementById('container-alerta').classList.add('hidden', 'dismissed'); }

function abrirModalAlertaAtrasadas() {
    const listaHtml = faturasUrgentes.map(f => {
        const bg = f.estaAtrasada ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200';
        const txt = f.estaAtrasada ? 'text-red-700' : 'text-orange-700';

        const valFinal = parseFloat(f.valor_total) || 0;
        const btnHtml = valFinal <= 0
            ? `<button disabled class="bg-gray-300 text-gray-500 font-black uppercase text-[10px] px-4 py-3 rounded-lg cursor-not-allowed">Zerado</button>`
            : `<button onclick="abrirModalPagarFatura('${f.conta}', '${f.mes_fatura}', ${f.valor_total})" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] px-4 py-3 rounded-lg shadow transition-colors">Pagar Agora</button>`;

        return `
            <div class="p-4 rounded-xl border ${bg} flex justify-between items-center">
                <div>
                    <h4 class="font-black text-[12px] uppercase text-slate-800">${f.conta} <span class="text-[9px] text-gray-500">- ${f.mes_fatura}</span></h4>
                    <p class="text-lg font-black italic ${txt}">${formatarMoeda(f.valor_total)}</p>
                </div>
                ${btnHtml}
            </div>`;
    }).join('');

    document.getElementById('lista-faturas-urgentes').innerHTML = listaHtml;
    document.getElementById('modal-alerta').classList.remove('hidden');
}

function abrirModalPagarFatura(conta, mes, valorTotal) {
    document.getElementById('mp-conta').innerText = conta;
    document.getElementById('mp-mes').innerText = mes;
    document.getElementById('mp-valor').value = formatarMoeda(valorTotal);

    faturaAbertaAtual = { conta, mes, valorTotal };

    const select = document.getElementById('mp-conta-pagadora');
    select.innerHTML = '<option value="" disabled selected>SELECIONE UMA CONTA...</option>';

    if(contasCacheUnicas.length === 0) contasCacheUnicas.push("CORRENTE");
    contasCacheUnicas.forEach(c => {
        select.innerHTML += `<option value="${c}">${c.toUpperCase()}</option>`;
    });

    document.getElementById('modal-pagar-fatura').classList.remove('hidden');
    document.getElementById('modal-alerta').classList.add('hidden');
}

function fecharModalPagarFatura() { document.getElementById('modal-pagar-fatura').classList.add('hidden'); }

async function efetivarPagamentoFatura() {
    const bancoDebito = document.getElementById('mp-conta-pagadora').value;
    if(!bancoDebito) return notify('erro', 'Selecione uma conta pagadora');

    const btn = document.getElementById('btn-efetivar-pagamento');
    btn.innerText = "Processando..."; btn.disabled = true;

    try {
        await fetch(API_URL + '?tipo=pagar_fatura', {
            method: 'POST',
            redirect: 'follow',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ conta_fatura: faturaAbertaAtual.conta, mes_fatura: faturaAbertaAtual.mes, banco_debito: bancoDebito, valor_pago: faturaAbertaAtual.valorTotal })
        });
        notify('sucesso', 'Fatura Paga com Sucesso!');
        fecharModalPagarFatura();
        buscarDados();
    } catch(e) { notify('erro', 'Erro ao pagar'); }

    btn.innerText = "Confirmar Pagamento"; btn.disabled = false;
}

function abrirDetalhes(conta, mes, diaVenc) {
    faturaAbertaAtual = { conta, mes, diaVenc };
    document.getElementById('det-conta').innerText = conta;
    document.getElementById('det-mes').innerText = mes;
    document.getElementById('input-dia-venc').value = diaVenc || 10;

    const limpar = (txt) => String(txt || "").trim().toUpperCase();
    const contaBusca = limpar(conta);
    const mesBusca = limpar(mes);

    const fData = dadosFaturas.find(df => limpar(df.conta) === contaBusca && limpar(df.mes_fatura) === mesBusca);
    const isPago = fData && limpar(fData.status) === 'PAGO';

    const btnCriarTransacao = document.getElementById('btn-modal-criar-transacao');
    const badgePago = document.getElementById('det-badge-pago');
    const btnSalvarVenc = document.getElementById('btn-salvar-venc');
    const inputVenc = document.getElementById('input-dia-venc');

    if (isPago) {
        btnCriarTransacao.classList.add('hidden');
        badgePago.classList.remove('hidden');
        btnSalvarVenc.classList.add('hidden');
        inputVenc.disabled = true;
    } else {
        btnCriarTransacao.classList.remove('hidden');
        badgePago.classList.add('hidden');
        btnSalvarVenc.classList.remove('hidden');
        inputVenc.disabled = false;
    }

    let html = "";
    let somaEntradas = 0;
    let somaSaidas = 0;

    const transacoes = gastosCompletosCache.filter(g =>
        limpar(g.conta) === contaBusca &&
        limpar(g.mes_fatura) === mesBusca &&
        limpar(g.forma_pagamento) === "CREDITO"
    );

transacoes.forEach(t => {
        const v = parseFloat(t.valor) || 0;
        const isEntrada = limpar(t.tipo) === 'ENTRADA';

        if (isEntrada) somaEntradas += v; else somaSaidas += v;

        // Reduzimos o padding dos botões (p-1) para não esticarem a linha
        const btnTrash = isPago ? '' : `<button onclick="event.stopPropagation(); abrirModalConfirmarDelete('${t.id}')" class="text-red-400 hover:text-red-600 p-1 sm:p-1.5 ml-1"><i class="fas fa-trash text-sm sm:text-base"></i></button>`;
        const btnEdit  = isPago ? '' : `<button onclick="event.stopPropagation(); abrirModalEditar('${t.id}')" class="text-blue-400 hover:text-blue-600 p-1 sm:p-1.5"><i class="fas fa-edit text-sm sm:text-base"></i></button>`;

        const dataExibicao = t.data ? String(t.data).substring(0,10) : '';
        const parcelaFormatada = t.parcela && t.parcela.trim() !== "" ? t.parcela : '-';

        // Reduzimos a altura trocando o p-3/p-4 por py-1.5/px-2 (no celular) e py-2/px-3 (no PC)
        html += `
            <tr class="border-b border-gray-50 hover:bg-slate-50 transition-colors cursor-pointer sm:cursor-auto active:bg-slate-100 sm:active:bg-transparent"
                onclick="if(window.innerWidth < 640 && !${isPago}) abrirModalOpcoesMobile('${t.id}')">
                <td class="py-1.2 px-2 sm:py-1 sm:px-3 text-[11px] sm:text-sm font-mono">${dataExibicao}</td>
                <td class="py-1.2 px-2 sm:py-1 sm:px-3 text-[11px] sm:text-sm text-slate-700 uppercase truncate max-w-[120px] sm:max-w-[300px]">${t.local} ${t.descricao ? '- ' + t.descricao : ''}</td>
                <td class="py-1.2 px-2 sm:py-1 sm:px-3 text-center text-[11px] sm:text-sm text-gray-500 font-bold hidden md:table-cell">${parcelaFormatada}</td>
                <td class="py-1.2 px-2 sm:py-1 sm:px-3 text-center text-[12px] sm:text-sm font-black whitespace-nowrap ${isEntrada ? 'text-green-600' : 'text-red-600'} w-24 sm:w-32">R$ ${v.toFixed(2).replace('.', ',')}</td>
                <td class="py-1.2 px-2 sm:py-1 sm:px-3 text-[10px] sm:text-xs text-gray-400 uppercase truncate max-w-[80px] sm:max-w-[150px] hidden sm:table-cell">${t.categoria}</td>
                <td class="py-1.2 px-2 sm:py-1 sm:px-3 text-right hidden sm:table-cell whitespace-nowrap">${btnEdit} ${btnTrash}</td>
            </tr>`;
    });

    const totalFatura = somaSaidas - somaEntradas;

    if(transacoes.length === 0) {
        html = `<tr><td colspan="5" class="p-8 text-center text-[10px] font-black uppercase text-gray-300">Nenhum gasto encontrado nesta fatura</td></tr>`;
    }

    document.getElementById('lista-transacoes').innerHTML = html;
    document.getElementById('det-saidas').innerText = formatarMoeda(somaSaidas);
    document.getElementById('det-entradas').innerText = formatarMoeda(somaEntradas);
    document.getElementById('det-total').innerText = formatarMoeda(totalFatura);

    document.getElementById('modal-detalhes').classList.remove('hidden');
}

function validarDiaVencimento(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
    let valor = parseInt(input.value);
    if (valor > 31) input.value = 31;
    if (valor < 1 && input.value !== "") input.value = 1;
}

async function salvarVencimento() {
    const novoDia = document.getElementById('input-dia-venc').value;
    const btn = document.getElementById('btn-salvar-venc');

    if (!novoDia || novoDia < 1 || novoDia > 31) return notify('erro', 'Dia inválido (1-31)');

    btn.innerText = "Salvando..."; btn.disabled = true;

    try {
        const response = await fetch(API_URL + '?tipo=editar_vencimento', {
            method: 'POST',
            redirect: 'follow',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ conta: faturaAbertaAtual.conta, mes_fatura: faturaAbertaAtual.mes, dia: novoDia })
        });

        const result = await response.json();

        if (result.status === "sucesso") {
            notify('sucesso', 'Vencimento Atualizado!');
            setTimeout(() => { buscarDados(); }, 800);
        } else {
            notify('erro', 'Erro: ' + (result.msg || 'Falha no banco'));
        }
    } catch(e) {
        notify('erro', 'Erro de conexão');
    }

    btn.innerText = "Salvar"; btn.disabled = false;
}

function abrirModalConfirmarDelete(id) {
    idDeleteAtual = id;
    document.getElementById('modal-confirmar-delete').classList.remove('hidden');
}

function fecharModalConfirmarDelete() {
    idDeleteAtual = null;
    document.getElementById('modal-confirmar-delete').classList.add('hidden');
}

async function efetivarDeleteTransacao() {
    if(!idDeleteAtual) return;
    const btn = document.getElementById('btn-confirmar-delete');
    btn.innerText = "Deletando..."; btn.disabled = true;
    try {
        await fetch(API_URL + '?tipo=deletar_gasto', { method: 'POST', redirect: 'follow', body: JSON.stringify({id: idDeleteAtual}) });
        notify('sucesso', 'Transação excluída');
        fecharModalConfirmarDelete();
        await buscarDados();
        abrirDetalhes(faturaAbertaAtual.conta, faturaAbertaAtual.mes, document.getElementById('input-dia-venc').value);
    } catch(e) { notify('erro', 'Erro ao excluir'); }
    btn.innerText = "Excluir"; btn.disabled = false;
}

function mascaraData(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    if (v.length > 5) v = v.substring(0, 5) + '/' + v.substring(5, 9);
    input.value = v;
}

function getDataHojeBR() {
    const hj = new Date();
    return `${String(hj.getDate()).padStart(2, '0')}/${String(hj.getMonth() + 1).padStart(2, '0')}/${hj.getFullYear()}`;
}

function abrirModalNovaTransacaoFatura() {
    document.getElementById('nt-conta').innerText = faturaAbertaAtual.conta;
    document.getElementById('nt-mes').innerText = faturaAbertaAtual.mes;
    document.getElementById('nt-data').value = getDataHojeBR();
    document.getElementById('nt-valor').value = '';
    document.getElementById('nt-parcelas').value = '1/1';
    document.getElementById('nt-local').value = '';
    document.getElementById('nt-desc').value = '';
    setTipoNovaTransacao('SAIDA');
    document.getElementById('modal-nova-transacao').classList.remove('hidden');
}

function fecharModalNovaTransacao() { document.getElementById('modal-nova-transacao').classList.add('hidden'); }

function setTipoNovaTransacao(tipo) {
    document.getElementById('nt-tipo').value = tipo;
    const btnS = document.getElementById('btn-nt-saida');
    const btnE = document.getElementById('btn-nt-entrada');
    const iptParcela = document.getElementById('nt-parcelas');

    if (tipo === 'SAIDA') {
        btnS.className = "flex-1 py-3 rounded-xl font-black text-[11px] sm:text-[12px] uppercase border-2 border-red-500 bg-red-50 text-red-700 transition-colors";
        btnE.className = "flex-1 py-3 rounded-xl font-black text-[11px] sm:text-[12px] uppercase border-2 border-transparent bg-gray-100 text-gray-400 transition-colors";
        iptParcela.disabled = false;
        iptParcela.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
    } else {
        btnE.className = "flex-1 py-3 rounded-xl font-black text-[11px] sm:text-[12px] uppercase border-2 border-green-500 bg-green-50 text-green-700 transition-colors";
        btnS.className = "flex-1 py-3 rounded-xl font-black text-[11px] sm:text-[12px] uppercase border-2 border-transparent bg-gray-100 text-gray-400 transition-colors";
        iptParcela.value = '1/1';
        iptParcela.disabled = true;
        iptParcela.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
    }
}

function avancarMesFatura(mesBase, qtdMeses) {
    if (qtdMeses === 0) return mesBase;
    const [mesStr, anoStr] = mesBase.split('/');
    let mesIdx = MESES_NOMES.indexOf(mesStr.toUpperCase());
    let ano = parseInt("20" + anoStr);
    mesIdx += qtdMeses;
    while (mesIdx > 11) { mesIdx -= 12; ano += 1; }
    return `${MESES_NOMES[mesIdx]}/${ano.toString().slice(-2)}`;
}

async function salvarNovaTransacaoFatura() {
    const dataBr = document.getElementById('nt-data').value;
    const valorTela = document.getElementById('nt-valor').value.replace(',', '.');
    const valorDigitado = parseFloat(valorTela);
    const tipoValor = document.getElementById('nt-tipo-valor').value;
    const parcelasCampo = document.getElementById('nt-parcelas').value;
    const parcelas = parseInt(parcelasCampo.split('/')[1]) || parseInt(parcelasCampo) || 1;
    const local = document.getElementById('nt-local').value;
    const descBase = document.getElementById('nt-desc').value;
    const categoria = document.getElementById('nt-categoria').value || "GERAL";
    const tipo = document.getElementById('nt-tipo').value;
    const multiplos = document.getElementById('nt-multiplos').checked;

    if(dataBr.length !== 10) return notify('erro', 'Data inválida');
    if(isNaN(valorDigitado) || valorDigitado <= 0) return notify('erro', 'Valor deve ser maior que R$ 0,00');
    if(!local) return notify('erro', 'Preencha o Local');

    const [dia, mes, ano] = dataBr.split('/');
    const dataFormatada = `${ano}-${mes}-${dia}`;
    const mesOrigem = faturaAbertaAtual.mes;
    const valorParcela = tipoValor === 'TOTAL' ? (valorDigitado / parcelas).toFixed(2) : valorDigitado.toFixed(2);
    const btn = document.getElementById('btn-salvar-nt');
    btn.innerText = "Salvando..."; btn.disabled = true;

    try {
        const promessas = [];
        for (let i = 1; i <= parcelas; i++) {
            const mesDestino = avancarMesFatura(mesOrigem, i - 1);
            let descFinal = descBase;

            const payload = {
                data: dataFormatada, valor: valorParcela, local: local, descricao: descFinal, categoria: categoria,
                conta: faturaAbertaAtual.conta, tipo: tipo, forma_pagamento: "CREDITO", mes_fatura: mesDestino
            };

            const requisicao = fetch(API_URL + '?tipo=criar_gasto', {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            }).then(res => res.json()).then(data => {
                if (data.status === "erro") throw new Error(data.mensagem || "Erro interno");
                return data;
            });
            promessas.push(requisicao);
        }

        await Promise.all(promessas);
        notify('sucesso', parcelas > 1 ? 'Parcelas Lançadas!' : 'Transação Adicionada!');

        if (multiplos) {
            document.getElementById('nt-valor').value = '';
            document.getElementById('nt-local').value = '';
            document.getElementById('nt-desc').value = '';
            document.getElementById('nt-parcelas').value = '1/1';
            document.getElementById('nt-data').focus();
        } else {
            fecharModalNovaTransacao();
        }

        await buscarDados();
        abrirDetalhes(faturaAbertaAtual.conta, faturaAbertaAtual.mes, document.getElementById('input-dia-venc').value);
    } catch(e) {
        notify('erro', e.message || 'Erro ao adicionar transação');
    }
    btn.innerText = "Salvar Transação"; btn.disabled = false;
}

// ==========================================
// FUNÇÕES DA NOVA FATURA MANUAL
// ==========================================

function abrirModalCriarFatura() {
    const selectConta = document.getElementById('cf-conta');
    selectConta.innerHTML = '<option value="" disabled selected>SELECIONE O CARTÃO...</option>';

    const contasParaSelect = contasCacheUnicas.length > 0 ? contasCacheUnicas : ["CORRENTE"];
    contasParaSelect.forEach(c => {
        selectConta.innerHTML += `<option value="${c}">${c.toUpperCase()}</option>`;
    });

    const hoje = new Date();
    const mesAtual = String(hoje.getMonth() + 1).padStart(2, '0');
    const anoAtual = String(hoje.getFullYear()).slice(-2);
    document.getElementById('cf-mes-ano').value = `${mesAtual}/${anoAtual}`;

    document.getElementById('modal-criar-fatura').classList.remove('hidden');
}

function fecharModalCriarFatura() { document.getElementById('modal-criar-fatura').classList.add('hidden'); }

function mascaraMesAno(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2, 4);
    input.value = v;
}

function converterDataParaNomeMes(mesAno) {
    const partes = mesAno.split('/');
    if (partes.length !== 2) return null;
    const mesNum = parseInt(partes[0], 10);
    const ano = partes[1];
    if (mesNum < 1 || mesNum > 12) return null;
    return `${MESES_NOMES[mesNum - 1]}/${ano}`;
}

async function efetivarCriacaoFatura() {
    const conta = document.getElementById('cf-conta').value;
    const mesAnoInput = document.getElementById('cf-mes-ano').value;

    if (!conta) return notify('erro', 'Selecione uma conta!');
    if (mesAnoInput.length !== 5) return notify('erro', 'Mês/Ano inválido! Use MM/AA.');

    const anoNum = parseInt(mesAnoInput.split('/')[1], 10);
    if (anoNum < 20 || anoNum > 40) return notify('erro', 'O ano deve ser entre 20 e 40');

    const mesFormatadoBackend = converterDataParaNomeMes(mesAnoInput);
    if (!mesFormatadoBackend) return notify('erro', 'Mês inválido (use 01 a 12)');

    const btn = document.getElementById('btn-efetivar-criacao');
    if (!btn) return;
    btn.innerText = "CRIANDO...";
    btn.disabled = true;

    try {
        const response = await fetch(API_URL + '?tipo=criar_fatura', {
            method: 'POST',
            redirect: 'follow',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ conta: conta, mes_fatura: mesFormatadoBackend })
        });

        if (!response.ok) throw new Error("Falha na comunicação com o Google Script");
        const result = await response.json();

        if (result.status === "sucesso") {
            notify('sucesso', 'Fatura Criada!');
            fecharModalCriarFatura();
            await buscarDados();
        } else {
            notify('erro', result.mensagem || 'Erro ao criar fatura');
        }
    } catch(e) {
        console.error("Erro ao criar fatura:", e);
        notify('erro', 'Erro de conexão ou Servidor');
    } finally {
        btn.innerText = "Criar Fatura";
        btn.disabled = false;
    }
}

// ==========================================
// AUXILIARES GERAIS
// ==========================================

function fecharModais() {
    document.getElementById('modal-alerta').classList.add('hidden');
    document.getElementById('modal-detalhes').classList.add('hidden');
    document.getElementById('modal-pagar-fatura').classList.add('hidden');
    document.getElementById('modal-confirmar-delete').classList.add('hidden');
    document.getElementById('modal-criar-fatura').classList.add('hidden');
}

function toggleCalendario() { document.getElementById('datepicker-popover').classList.toggle('hidden'); document.getElementById('calendar-backdrop').classList.toggle('hidden'); if (!document.getElementById('datepicker-popover').classList.contains('hidden')) renderizarMeses(); }
function renderizarMeses() { const grid = document.getElementById('grid-meses'); document.getElementById('cal-ano').innerText = anoExibido; grid.innerHTML = ""; MESES_NOMES.forEach((mes, idx) => { const order = (anoExibido * 100) + idx; const raw = `${mes}/${anoExibido.toString().slice(-2)}`; let cl = "calendar-month"; if (mesInicioSel && mesFimSel) { if (order === mesInicioSel.order || order === mesFimSel.order) cl += " month-selected"; else if (order > mesInicioSel.order && order < mesFimSel.order) cl += " month-range"; } else if (mesInicioSel && order === mesInicioSel.order) cl += " month-selected"; grid.innerHTML += `<div onclick="selecionarMes('${mes}', ${anoExibido}, ${order}, '${raw}')" class="${cl}">${mes.substring(0,3)}</div>`; }); }
function selecionarMes(nome, ano, order, raw) { const sel = { mes: nome, ano: ano, order: order, raw: raw }; if (!mesInicioSel || (mesInicioSel && mesFimSel)) { mesInicioSel = sel; mesFimSel = null; } else { if (order < mesInicioSel.order) { mesFimSel = mesInicioSel; mesInicioSel = sel; } else { mesFimSel = sel; } } renderizarMeses(); }
function confirmarPeriodo() { if (!mesFimSel) mesFimSel = mesInicioSel; atualizarLabelsPeriodo(); toggleCalendario(); processarFaturas(); }
function atualizarLabelsPeriodo() { const txt = mesInicioSel.raw === mesFimSel.raw ? mesInicioSel.raw : `${mesInicioSel.raw} - ${mesFimSel.raw}`; document.getElementById('txt-periodo').innerText = txt; document.querySelectorAll('.label-periodo').forEach(el => el.innerText = txt); }
function mudarAno(dir) { anoExibido += dir; renderizarMeses(); }
function formatarMoeda(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); }
function toggleSidebar() { document.getElementById('sidebar-lateral').classList.toggle('-translate-x-full'); document.getElementById('sidebar-overlay').classList.toggle('hidden'); }
function atualizarStatus(tipo) { const el = document.getElementById('status-conexao-flutuante'); if (tipo === 'conectando') el.classList.add('opacity-100', 'scale-100'); else setTimeout(() => el.classList.remove('opacity-100', 'scale-100'), 2000); }
function notify(tipo, msg) { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `${tipo === 'sucesso' ? 'bg-emerald-600' : 'bg-red-600'} text-white px-8 py-3 rounded-xl shadow-2xl font-black text-[10px] uppercase animate-bounce mt-2`; toast.innerText = msg; container.appendChild(toast); setTimeout(() => toast.remove(), 3000); }

function mascaraValor(input) {
    let v = input.value;
    v = v.replace(/[^0-9.,]/g, '');
    v = v.replace(/\./g, ',');
    const parts = v.split(',');
    if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('');
    if (parts.length === 2 && parts[1].length > 2) v = parts[0] + ',' + parts[1].substring(0, 2);
    input.value = v;
}

function mascaraCaracteresParcela(input) { input.value = input.value.replace(/[^0-9/]/g, ''); }
function formatarParcelaBlur(input) {
    let v = input.value;
    if (!v || v === "0") { input.value = "1/1"; return; }
    if (!v.includes('/')) input.value = `1/${parseInt(v)}`;
}

function calcularPreview() {
    const valStr = document.getElementById('nt-valor').value.replace(',', '.');
    const valor = parseFloat(valStr) || 0;
    const parcelasStr = document.getElementById('nt-parcelas').value;
    const parcelas = parseInt(parcelasStr.split('/')[1]) || parseInt(parcelasStr) || 1;
    const tipoValor = document.getElementById('nt-tipo-valor').value;
    const previewEl = document.getElementById('nt-preview-valor');

    if (valor === 0 || parcelas <= 1) { previewEl.innerText = ""; return; }

    if (tipoValor === 'TOTAL') {
        const valParc = (valor / parcelas).toFixed(2).replace('.', ',');
        previewEl.innerText = `${parcelas}x de R$ ${valParc}`;
        previewEl.className = "text-[9px] sm:text-[10px] text-blue-500 mt-1 ml-1 font-bold h-3";
    } else {
        const valTot = (valor * parcelas).toFixed(2).replace('.', ',');
        previewEl.innerText = `Total: R$ ${valTot}`;
        previewEl.className = "text-[9px] sm:text-[10px] text-emerald-500 mt-1 ml-1 font-bold h-3";
    }
}

// ==========================================
// AÇÕES DO MOBILE E EDIÇÃO
// ==========================================

let idSelecionadoMobile = null;

function abrirModalOpcoesMobile(id) {
    idSelecionadoMobile = id;
    document.getElementById('modal-opcoes-mobile').classList.remove('hidden');
}

function fecharModalOpcoesMobile() { document.getElementById('modal-opcoes-mobile').classList.add('hidden'); }

function acionarEditarDoMobile() {
    const id = idSelecionadoMobile;
    fecharModalOpcoesMobile();
    abrirModalEditar(id);
}

function acionarDeletarDoMobile() {
    const id = idSelecionadoMobile;
    fecharModalOpcoesMobile();
    abrirModalConfirmarDelete(id);
}

function fecharModalEditar() { document.getElementById('modal-editar-transacao').classList.add('hidden'); }

function setTipoEditarTransacao(tipo) {
    document.getElementById('et-tipo').value = tipo;
    const btnS = document.getElementById('btn-et-saida');
    const btnE = document.getElementById('btn-et-entrada');

    if (tipo === 'SAIDA') {
        btnS.className = "flex-1 py-3 rounded-xl font-black text-[11px] sm:text-[12px] uppercase border-2 border-red-500 bg-red-50 text-red-700 transition-colors";
        btnE.className = "flex-1 py-3 rounded-xl font-black text-[11px] sm:text-[12px] uppercase border-2 border-transparent bg-gray-100 text-gray-400 transition-colors";
    } else {
        btnE.className = "flex-1 py-3 rounded-xl font-black text-[11px] sm:text-[12px] uppercase border-2 border-green-500 bg-green-50 text-green-700 transition-colors";
        btnS.className = "flex-1 py-3 rounded-xl font-black text-[11px] sm:text-[12px] uppercase border-2 border-transparent bg-gray-100 text-gray-400 transition-colors";
    }
}

function abrirModalEditar(id) {
    const t = gastosCompletosCache.find(g => String(g.id) === String(id));
    if (!t) return;

    document.getElementById('et-id').value = id;
    document.getElementById('et-conta').innerText = t.conta;
    document.getElementById('et-mes').innerText = t.mes_fatura;
    document.getElementById('et-data').value = t.data ? String(t.data).substring(0, 10).split('-').reverse().join('/') : "";
    document.getElementById('et-valor').value = parseFloat(t.valor).toFixed(2).replace('.', ',');
    document.getElementById('et-parcelas').value = t.parcela || "1/1";
    document.getElementById('et-local').value = t.local;
    document.getElementById('et-desc').value = t.descricao;

    const catSelect = document.getElementById('et-categoria');
    catSelect.innerHTML = document.getElementById('nt-categoria').innerHTML;

    const categoriaBanco = String(t.categoria || "GERAL").trim().toUpperCase();
    let encontrou = false;
    for (let i = 0; i < catSelect.options.length; i++) {
        if (catSelect.options[i].value.trim().toUpperCase() === categoriaBanco) {
            catSelect.selectedIndex = i;
            encontrou = true;
            break;
        }
    }
    if (!encontrou) catSelect.value = "GERAL";

    setTipoEditarTransacao(t.tipo.toUpperCase());
    document.getElementById('modal-editar-transacao').classList.remove('hidden');
}

async function salvarEdicaoTransacao() {
    const btn = document.getElementById('btn-salvar-et');
    const valorDigitado = parseFloat(document.getElementById('et-valor').value.replace(',', '.'));
    const dataParts = document.getElementById('et-data').value.split('/');
    const categoriaFinal = document.getElementById('et-categoria').value;

    const payload = {
        id: document.getElementById('et-id').value,
        data: `${dataParts[2]}-${dataParts[1]}-${dataParts[0]}`,
        valor: valorDigitado,
        local: document.getElementById('et-local').value.trim(),
        descricao: document.getElementById('et-desc').value.trim(),
        categoria: categoriaFinal,
        tipo: document.getElementById('et-tipo').value,
        conta: document.getElementById('et-conta').innerText.trim(),
        mes_fatura: document.getElementById('et-mes').innerText.trim(),
        forma_pagamento: "CREDITO",
        parcela: document.getElementById('et-parcelas').value
    };

    btn.innerText = "Salvando..."; btn.disabled = true;
    try {
        const res = await fetch(API_URL + '?tipo=editar_gasto', {
            method: 'POST',
            redirect: 'follow',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.status === "erro") throw new Error(res.mensagem);

        notify('sucesso', 'Atualizado!');
        fecharModais();
        await buscarDados();
        abrirDetalhes(faturaAbertaAtual.conta, faturaAbertaAtual.mes, faturaAbertaAtual.diaVenc);
    } catch(e) {
        notify('erro', e.message || 'Erro ao salvar');
    }
    btn.innerText = "Salvar Edição"; btn.disabled = false;
<<<<<<< HEAD
}
=======
}
>>>>>>> af3fc30 (nova pagina)
