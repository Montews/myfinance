const API_URL = "https://script.google.com/macros/s/AKfycbzItUHH4zOPC2ruk5X7yokt2g8lpgILJH6ujhAtVmTDOJoxAxb96qI30MIgkuHqs7Ly/exec";

let statusTimeout1, statusTimeout2;
let assinaturasBanco = [];

// Agora começam vazios, o sistema vai preencher sozinho do Google Sheets!
let contasCacheDropdown = [];
let categoriasCacheDropdown = [];
let formasPagCache = ["DÉBITO", "CRÉDITO"];

const CORES_VIVAS = ["#EF4444", "#EC4899", "#D946EF", "#A855F7", "#8B5CF6", "#6366F1", "#3B82F6", "#0EA5E9", "#06B6D4", "#14B8A6", "#10B981", "#22C55E", "#84CC16", "#EAB308", "#F59E0B", "#F97316"];
const MESES_CURTOS = ["JAN", "FEV", "MAR", "ABR", "MAIO", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

let histDetalhadoAtual = [];
let histDetalhadoPagina = 1;
const LINHAS_POR_PAGINA = 15;

// ==========================================
// INICIALIZAÇÃO
// ==========================================
window.addEventListener('load', async () => {
    gerarPaletaDeCores('as');
    atualizarStatus('conectando');
    await buscarListasDinâmicas(); // Baixa as contas e categorias da planilha
    buscarAssinaturas(); // Carrega os cards de assinaturas
});

// NOVA FUNÇÃO QUE LÊ DO SEU BACKEND
async function buscarListasDinâmicas() {
    try {
        // Usa a sua rota GET de contas que já existe no seu backend!
        const resContas = await fetch(`${API_URL}?tipo=contas`);
        const dadosContas = await resContas.json();
        if (dadosContas && dadosContas.length > 0) {
            contasCacheDropdown = dadosContas.map(item => item.conta);
        }

        // Usa a sua rota GET de categorias
        const resCat = await fetch(`${API_URL}?tipo=categorias`);
        const dadosCat = await resCat.json();
        if (dadosCat && dadosCat.length > 0) {
            categoriasCacheDropdown = dadosCat.map(item => item.categoria);
        }
    } catch (e) {
        console.warn("Usando listas de backup por lentidão na rede.", e);
        // Backup de emergência caso a internet caia no momento
        contasCacheDropdown = ["NUBANK", "INTER", "CAIXA", "AGI", "ITAU"];
        categoriasCacheDropdown = ["LAZER", "SAUDE", "EDUCACAO", "ASSINATURAS", "CASA"];
    }
}

// ==========================================
// FUNÇÃO MESTRE PARA FALAR COM O GOOGLE
// ==========================================
async function chamarMotor(tipoAcao, payload = {}) {
    const url = `${API_URL}?tipo=${tipoAcao}`;
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    return await response.json();
}

async function buscarAssinaturas() {
    atualizarStatus('conectando');
    try {
        const dadosReais = await chamarMotor('obter_assinaturas');

        if (Array.isArray(dadosReais)) {
            assinaturasBanco = dadosReais;
        } else {
            assinaturasBanco = [];
        }

        renderizarTudo();
        atualizarStatus('sucesso');
    } catch (e) {
        console.error("Erro na API:", e);
        assinaturasBanco = [];
        renderizarTudo();
        atualizarStatus('erro');
        notify('erro', 'Falha ao buscar dados!');
    }
}

// FORMATADORES
function formatarMoedaSimples(v) { return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0); }
function mascaraValor(input) { let v = input.value.replace(/[^0-9.,]/g, '').replace(/\./g, ','); const parts = v.split(','); if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join(''); if (parts.length === 2 && parts[1].length > 2) v = parts[0] + ',' + parts[1].substring(0, 2); input.value = v; }
function mascaraData(input) { let v = input.value.replace(/\D/g, ''); if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2, 4) + '/' + v.substring(4, 8); input.value = v.substring(0, 10); }

function getMesAtualCurto() {
    const hj = new Date();
    return MESES_CURTOS[hj.getMonth()];
}

// VALIDAÇÃO DE DATA
function validarDataInput(input, erroId, limita50Dias) {
    const erroEl = document.getElementById(erroId);
    input.classList.remove('input-erro-data');
    erroEl.classList.add('hidden');
    erroEl.innerText = "";

    if (input.value.trim() === "") return true;

    if (input.value.length !== 10) {
        mostrarErroData(input, erroEl, "Data incompleta!");
        return false;
    }

    const [dia, mes, ano] = input.value.split('/');
    const anoNum = parseInt(ano);

    if (anoNum < 2000 || anoNum > 2099) {
        mostrarErroData(input, erroEl, "O ano deve ser 20XX");
        return false;
    }

    if (limita50Dias) {
        const dataInp = new Date(`${ano}-${mes}-${dia}T12:00:00`);
        const hj = new Date();
        hj.setHours(12,0,0,0);

        const diff = Math.floor((hj - dataInp) / (1000 * 60 * 60 * 24));

        if (diff > 50) {
            mostrarErroData(input, erroEl, "> 50 dias não permitido");
            return false;
        }
    }

    return true;
}

function mostrarErroData(input, erroEl, msg) {
    input.classList.add('input-erro-data');
    erroEl.innerText = msg;
    erroEl.classList.remove('hidden');
}

// DROPDOWNS: CONTAS, CATEGORIAS E FORMA
function mostrarDropContas(idInput) { filtrarContas(idInput); document.getElementById(idInput + '-drop').classList.remove('hidden'); }
function esconderDropContas(idInput) { setTimeout(() => { const drop = document.getElementById(idInput + '-drop'); if(drop) drop.classList.add('hidden'); }, 200); }
function filtrarContas(idInput) {
    let term = document.getElementById(idInput).value.toUpperCase();
    let drop = document.getElementById(idInput + '-drop');
    let filtered = contasCacheDropdown.filter(c => c.toUpperCase().includes(term));
    if(filtered.length === 0) { drop.innerHTML = `<div class="p-3 text-[10px] font-black uppercase text-red-400">Não encontrada</div>`; }
    else { drop.innerHTML = filtered.map(c => `<div class="p-3 text-[10px] font-black uppercase text-gray-600 hover:bg-slate-100 cursor-pointer" onclick="selecionarContaDrop('${idInput}', '${c}')">${c}</div>`).join(''); }
}
function selecionarContaDrop(idInput, valor) { document.getElementById(idInput).value = valor; document.getElementById(idInput + '-drop').classList.add('hidden'); }

function mostrarDropCategorias(idInput) { filtrarCategorias(idInput); document.getElementById(idInput + '-drop').classList.remove('hidden'); }
function esconderDropCategorias(idInput) { setTimeout(() => { const drop = document.getElementById(idInput + '-drop'); if(drop) drop.classList.add('hidden'); }, 200); }
function filtrarCategorias(idInput) {
    let term = document.getElementById(idInput).value.toUpperCase();
    let drop = document.getElementById(idInput + '-drop');
    let filtered = categoriasCacheDropdown.filter(c => c.toUpperCase().includes(term));
    if(filtered.length === 0) { drop.innerHTML = `<div class="p-3 text-[10px] font-black uppercase text-red-400">Não encontrada</div>`; }
    else { drop.innerHTML = filtered.map(c => `<div class="p-3 text-[10px] font-black uppercase text-gray-600 hover:bg-slate-100 cursor-pointer" onclick="selecionarCatDrop('${idInput}', '${c}')">${c}</div>`).join(''); }
}
function selecionarCatDrop(idInput, valor) { document.getElementById(idInput).value = valor; document.getElementById(idInput + '-drop').classList.add('hidden'); }


// Agora ele ignora o que está digitado e sempre renderiza todas as opções ao clicar no campo
function mostrarDropForma(idInput) {
    let drop = document.getElementById(idInput + '-drop');
    drop.innerHTML = formasPagCache.map(c => `<div class="p-3 text-[10px] font-black uppercase text-gray-600 hover:bg-slate-100 cursor-pointer" onclick="selecionarFormaDrop('${idInput}', '${c}')">${c}</div>`).join('');
    drop.classList.remove('hidden');
}function esconderDropForma(idInput) { setTimeout(() => { const drop = document.getElementById(idInput + '-drop'); if(drop) drop.classList.add('hidden'); }, 200); }
function filtrarForma(idInput) {
    let term = document.getElementById(idInput).value.toUpperCase().replace('É', 'E');
    let drop = document.getElementById(idInput + '-drop');
    let filtered = formasPagCache.filter(c => c.replace('É','E').includes(term));
    if(filtered.length === 0) { drop.innerHTML = `<div class="p-3 text-[9px] font-black uppercase text-gray-400">Selecione a forma</div>`; }
    else { drop.innerHTML = filtered.map(c => `<div class="p-3 text-[10px] font-black uppercase text-gray-600 hover:bg-slate-100 cursor-pointer" onclick="selecionarFormaDrop('${idInput}', '${c}')">${c}</div>`).join(''); }
}
function selecionarFormaDrop(idInput, valor) { document.getElementById(idInput).value = valor; document.getElementById(idInput + '-drop').classList.add('hidden'); }

function toggleInativas() {
    const box = document.getElementById('grid-assinaturas-inativas');
    const icon = document.getElementById('icon-inativas');
    box.classList.toggle('hidden');
    icon.classList.toggle('rotate-180');
}

function renderizarTudo() {
    const gridAtivas = document.getElementById('grid-assinaturas-ativas');
    const containerInativas = document.getElementById('container-inativas');
    const btnNovo = document.getElementById('btn-add-as').outerHTML;

    let htmlAtivas = '';
    let htmlInativas = '';
    let totalGasto = 0, totalEcoMensal = 0;
    let mesCurto = getMesAtualCurto();

    assinaturasBanco.forEach(ass => {
        const isAtiva = ass.status === "ATIVO";
        if(isAtiva) { totalGasto += ass.valor; totalEcoMensal += ass.economia_mes; }

        let btnPagar = ass.pago_este_mes ?
            `<button type="button" onclick="abrirModalConfirmaPagamento('${ass.id}', event);" class="flex-1 py-3 bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-widest outline-none transition-colors hover:bg-emerald-100"><i class="fas fa-check-double mr-1"></i> Pago no mês ${mesCurto}</button>` :
            `<button type="button" onclick="abrirModalPagamento('${ass.id}', false, event);" class="flex-1 py-3 bg-slate-50 hover:bg-slate-100 text-emerald-600 font-black text-[9px] uppercase tracking-widest transition-colors outline-none"><i class="fas fa-check mr-1"></i> Pagar</button>`;

        let htmlEconomiaNoCard = '';
        if (ass.is_clube) {
            let iconeEco = '', corEco = '';
            if (ass.economia_mes > ass.valor) { iconeEco = '<i class="fas fa-arrow-up text-[10px]"></i>'; corEco = 'text-emerald-500'; }
            else if (ass.economia_mes < ass.valor) { iconeEco = '<i class="fas fa-arrow-down text-[10px]"></i>'; corEco = 'text-red-500'; }
            else { iconeEco = '<i class="fas fa-minus text-[10px]"></i>'; corEco = 'text-gray-400'; }
            htmlEconomiaNoCard = `<div class="flex items-center justify-center gap-1 mt-1 ${corEco} font-black text-[10px] uppercase tracking-widest">${iconeEco} Economia: R$ ${formatarMoedaSimples(ass.economia_mes)}</div>`;
        }

        let badgeClube = ass.is_clube ? `<span class="bg-white/20 text-white text-[8px] px-2 py-0.5 rounded border border-white/30 ml-2 font-black uppercase tracking-widest">Clube</span>` : '';

        let cardHtml = `
            <div class="bg-white rounded-2xl shadow-suave border border-gray-100 overflow-hidden flex flex-col transform transition-transform hover:-translate-y-1 h-full min-h-[120px] lg:min-h-[190px] ${isAtiva ? '' : 'card-inativa'}">
                <div class="p-4 flex justify-between items-start" style="background-color: ${ass.cor}">
                    <div class="flex flex-col">
                        <div class="flex items-center"><h3 class="font-black text-white uppercase tracking-widest text-sm">${ass.nome}</h3>${badgeClube}</div>
                        <span class="text-[9px] font-black uppercase text-white/80 mt-0.5">${ass.conta}</span>
                    </div>
                    <button type="button" onclick="abrirModalConfigAs('${ass.id}', event);" class="text-white/80 hover:text-white p-1.5 outline-none border-none transition-colors relative z-10 cursor-pointer pointer-events-auto"><i class="fas fa-cog"></i></button>
                </div>
                <div class="p-4 flex-1 flex flex-col justify-center items-center text-center cursor-pointer" onclick="abrirModalDetalhes('${ass.id}', event)">
                    <p class="text-[11px] font-black uppercase text-slate-400 tracking-widest mb-1">Gasto Mensal</p>
                    <p class="text-2xl lg:text-3xl font-black text-slate-800 tracking-tighter">R$ ${formatarMoedaSimples(ass.valor)}</p>
                    ${htmlEconomiaNoCard}
                </div>
                ${isAtiva ? `
                <div class="flex border-t border-gray-100 relative z-10">
                    ${ass.is_clube ? `<button type="button" onclick="abrirModalDesconto('${ass.id}', event);" class="flex-1 py-3 bg-slate-50 hover:bg-slate-100 text-blue-600 font-black text-[9px] uppercase tracking-widest border-r outline-none transition-colors"><i class="fas fa-tag mr-1"></i> Desconto</button>` : ''}
                    ${btnPagar}
                </div>` : ''}
            </div>`;

        if(isAtiva) htmlAtivas += cardHtml; else htmlInativas += cardHtml;
    });

    gridAtivas.innerHTML = btnNovo + htmlAtivas;
    document.getElementById('kpi-gasto').innerHTML = `<span class="text-xs mt-1">R$</span> <span>${formatarMoedaSimples(totalGasto)}</span>`;
    document.getElementById('kpi-economia').innerHTML = `<span class="text-xs mt-1">R$</span> <span>${formatarMoedaSimples(totalEcoMensal)}</span>`;

    if(htmlInativas) {
        containerInativas.innerHTML = `
            <div class="mt-8 mb-4">
                <button onclick="toggleInativas()" class="w-full flex items-center gap-3 outline-none hover:opacity-80 transition-opacity">
                    <div class="h-px bg-gray-300 flex-1"></div>
                    <span class="text-xs font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">Assinaturas Inativas <i id="icon-inativas" class="fas fa-chevron-down transition-transform"></i></span>
                    <div class="h-px bg-gray-300 flex-1"></div>
                </button>
            </div>
            <div id="grid-assinaturas-inativas" class="hidden grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">${htmlInativas}</div>`;
    } else {
        containerInativas.innerHTML = '';
    }
}

// MODAIS
function abrirModalNovaAs(event) { if(event) { event.stopPropagation(); event.preventDefault(); } abrirModalConfigAs('', null); }

function abrirModalConfigAs(id, event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }

    try {
        const ass = assinaturasBanco.find(a => String(a.id) === String(id)) || {nome:'', categoria: '', valor:'', conta:'', forma_padrao:'DÉBITO', is_clube:false, status:'ATIVO', cor:'#1E293B'};

        const header = document.getElementById('as-header');
        const titulo = document.getElementById('as-titulo');
        const boxAtivo = document.getElementById('box-toggle-ativo');

        header.style.backgroundColor = ass.cor;

        if(id && id !== '') {
            titulo.innerHTML = `<i class="fas fa-cog mr-2"></i> Configurar Assinatura`;
            boxAtivo.classList.remove('hidden');
            boxAtivo.classList.add('flex');
        } else {
            titulo.innerHTML = `<i class="fas fa-plus mr-2"></i> Adicionar Assinatura`;
            ass.cor = CORES_VIVAS[6];
            header.style.backgroundColor = '#1E293B';
            boxAtivo.classList.remove('flex');
            boxAtivo.classList.add('hidden');
        }

        document.getElementById('as-id').value = id || '';
        document.getElementById('as-nome').value = ass.nome;
        document.getElementById('as-categoria').value = ass.categoria || '';
        document.getElementById('as-valor').value = formatarMoedaSimples(ass.valor);
        document.getElementById('as-conta').value = ass.conta;
        document.getElementById('as-forma').value = ass.forma_padrao || "DÉBITO";
        document.getElementById('as-is-clube').checked = ass.is_clube;
        document.getElementById('as-status').value = ass.status;
        document.getElementById('as-cor').value = ass.cor;

        const bg = document.getElementById('btn-toggle-as');
        const bolinha = document.getElementById('bolinha-as');
        if(ass.status === 'ATIVO') {
            bg.className = "w-12 h-6 rounded-full bg-emerald-500 relative transition-colors pointer-events-none";
            bolinha.className = "w-4 h-4 bg-white rounded-full absolute top-1 left-[26px] transition-all";
        } else {
            bg.className = "w-12 h-6 rounded-full bg-gray-300 relative transition-colors pointer-events-none";
            bolinha.className = "w-4 h-4 bg-white rounded-full absolute top-1 left-1 transition-all";
        }
        selecionarCor('as', ass.cor);
        document.getElementById('modal-config-as').classList.remove('hidden');
    } catch(e) { console.error("Erro ao abrir configuração:", e); }
}

function toggleStatusAs() {
    const input = document.getElementById('as-status');
    const bg = document.getElementById('btn-toggle-as');
    const bolinha = document.getElementById('bolinha-as');
    if(input.value === 'ATIVO') {
        input.value = 'INATIVO'; bg.classList.replace('bg-emerald-500', 'bg-gray-300'); bolinha.classList.replace('left-[26px]', 'left-1');
    } else {
        input.value = 'ATIVO'; bg.classList.replace('bg-gray-300', 'bg-emerald-500'); bolinha.classList.replace('left-1', 'left-[26px]');
    }
}

function abrirModalConfirmaPagamento(id, event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    document.getElementById('confirma-pg-id').value = id;
    document.getElementById('modal-confirma-pagamento').classList.remove('hidden');
}

function prosseguirPagamentoDuplicado() {
    const id = document.getElementById('confirma-pg-id').value;
    fecharModais();
    setTimeout(() => { abrirModalPagamento(id, true, null); }, 300);
}

function abrirModalPagamento(id, isEditavel, event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    const ass = assinaturasBanco.find(a => String(a.id) === String(id));
    document.getElementById('pg-header').style.backgroundColor = ass.cor;
    document.getElementById('pg-id').value = ass.id;
    document.getElementById('pg-nome-conta').innerHTML = `${ass.nome}`;

    const inputValor = document.getElementById('pg-valor');
    const labelValor = document.getElementById('label-pg-valor');

    inputValor.value = formatarMoedaSimples(ass.valor);

    if (isEditavel) {
        labelValor.innerText = "Valor (Editável)";
        inputValor.readOnly = false;
        inputValor.classList.remove('bg-gray-100', 'cursor-not-allowed', 'border-gray-200');
        inputValor.classList.add('bg-white', 'border-blue-400');
    } else {
        labelValor.innerText = "Valor (Fixado)";
        inputValor.readOnly = true;
        inputValor.classList.add('bg-gray-100', 'cursor-not-allowed', 'border-gray-200');
        inputValor.classList.remove('bg-white', 'border-blue-400');
    }

    const dataInput = document.getElementById('pg-data');
    dataInput.value = new Date().toLocaleDateString('pt-BR');
    dataInput.classList.remove('input-erro-data');
    document.getElementById('erro-pg-data').classList.add('hidden');

    document.getElementById('pg-conta').value = ass.conta;
    document.getElementById('pg-forma').value = ass.forma_padrao || "DÉBITO";

    document.getElementById('modal-pagamento').classList.remove('hidden');
}

function abrirModalDesconto(id, event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    const ass = assinaturasBanco.find(a => String(a.id) === String(id));
    document.getElementById('dc-header').style.backgroundColor = ass.cor;
    document.getElementById('dc-id').value = id;
    document.getElementById('dc-nome-conta').innerHTML = `${ass.nome}`;

    const dataInput = document.getElementById('dc-data');
    dataInput.value = new Date().toLocaleDateString('pt-BR');
    dataInput.classList.remove('input-erro-data');
    document.getElementById('erro-dc-data').classList.add('hidden');

    document.getElementById('dc-valor').value = '';
    document.getElementById('dc-local').value = '';
    document.getElementById('dc-detalhes').value = '';
    document.getElementById('modal-desconto').classList.remove('hidden');
}

function abrirModalDetalhes(id, event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    const ass = assinaturasBanco.find(a => String(a.id) === String(id));
    document.getElementById('det-header').style.backgroundColor = ass.cor;
    document.getElementById('det-nome').innerText = ass.nome;
    document.getElementById('det-status-chip').innerText = ass.status;
    document.getElementById('det-total-gasto').innerText = `R$ ${formatarMoedaSimples(ass.total_gasto)}`;

    if(ass.is_clube) {
        document.getElementById('det-box-eco').classList.remove('hidden');
        document.getElementById('det-total-eco').innerText = `R$ ${formatarMoedaSimples(ass.total_economia)}`;
        document.getElementById('det-grid').classList.replace('grid-cols-1', 'grid-cols-2');
    } else {
        document.getElementById('det-box-eco').classList.add('hidden');
        document.getElementById('det-grid').classList.replace('grid-cols-2', 'grid-cols-1');
    }

    document.getElementById('rt-id').value = id;

    histDetalhadoAtual = ass.historico || [];
    histDetalhadoPagina = 1;
    renderizarTabelaHistDetalhado();

    document.getElementById('modal-detalhes').classList.remove('hidden');
}

function renderizarTabelaHistDetalhado() {
    const tbody = document.getElementById('det-tabela');
    const containerPaginacao = document.getElementById('det-paginacao');
    const maxPaginas = Math.ceil(histDetalhadoAtual.length / LINHAS_POR_PAGINA);

    if (histDetalhadoAtual.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-6 text-center text-[10px] font-black uppercase text-gray-300">Sem histórico</td></tr>`;
        containerPaginacao.classList.add('hidden');
        return;
    }

    const start = (histDetalhadoPagina - 1) * LINHAS_POR_PAGINA;
    const end = start + LINHAS_POR_PAGINA;
    const paginaAtualArr = histDetalhadoAtual.slice(start, end);

    tbody.innerHTML = paginaAtualArr.map(h => {
        const cor = h.t === 'PAGAMENTO' ? 'text-red-500' : 'text-emerald-500';
        return `<tr>
            <td class="p-3 text-[10px] font-black text-slate-500 font-mono">${h.d}</td>
            <td class="p-3 text-[10px] font-black text-slate-400 uppercase">${h.c}</td>
            <td class="p-3 text-right font-black text-sm ${cor}">R$ ${formatarMoedaSimples(h.v)}</td>
        </tr>`;
    }).join('');

    if (maxPaginas > 1) {
        containerPaginacao.classList.remove('hidden');
        document.getElementById('det-page-info').innerText = `Pág ${histDetalhadoPagina}/${maxPaginas}`;
        document.getElementById('btn-hist-prev').disabled = histDetalhadoPagina === 1;
        document.getElementById('btn-hist-next').disabled = histDetalhadoPagina === maxPaginas;
    } else {
        containerPaginacao.classList.add('hidden');
    }
}

function mudarPaginaHistDet(direcao) {
    const maxPaginas = Math.ceil(histDetalhadoAtual.length / LINHAS_POR_PAGINA);
    histDetalhadoPagina += direcao;
    if (histDetalhadoPagina < 1) histDetalhadoPagina = 1;
    if (histDetalhadoPagina > maxPaginas) histDetalhadoPagina = maxPaginas;
    renderizarTabelaHistDetalhado();
}

function abrirModalRetroativo() {
    const id = document.getElementById('rt-id').value;
    const ass = assinaturasBanco.find(a => String(a.id) === String(id));
    document.getElementById('rt-header').style.backgroundColor = ass.cor;
    document.getElementById('rt-nome-assinatura').innerHTML = `${ass.nome}`;
    document.getElementById('rt-valor').value = formatarMoedaSimples(ass.valor);

    const dataInput = document.getElementById('rt-data');
    dataInput.value = '';
    dataInput.classList.remove('input-erro-data');
    document.getElementById('erro-rt-data').classList.add('hidden');

    document.getElementById('rt-conta').value = ass.conta;
    document.getElementById('rt-forma').value = ass.forma_padrao || "DÉBITO";

    document.getElementById('modal-retroativo').classList.remove('hidden');
}

// ==========================================
// AÇÕES DE INTEGRAÇÃO COM BACKEND (SALVAR)
// ==========================================

async function salvarConfigAs() {
    const nome = document.getElementById('as-nome').value;
    const conta = document.getElementById('as-conta').value;
    if(!nome || !conta) return notify('erro', 'Nome e Conta são obrigatórios!');

    const payload = {
        id: document.getElementById('as-id').value,
        nome: nome,
        categoria: document.getElementById('as-categoria').value,
        valor: parseFloat(document.getElementById('as-valor').value.replace(/\./g, '').replace(',', '.')) || 0,
        conta: conta,
        forma: document.getElementById('as-forma').value,
        is_clube: document.getElementById('as-is-clube').checked,
        status: document.getElementById('as-status').value,
        cor: document.getElementById('as-cor').value
    };

    atualizarStatus('conectando');
    try {
        await chamarMotor('salvar_config_assinatura', payload);
        notify('sucesso', 'Assinatura Salva!');
        fecharModais();
        buscarAssinaturas();
    } catch(e) {
        notify('erro', 'Erro ao salvar!');
        atualizarStatus('erro');
    }
}

async function efetivarPagamento() {
    const dataInput = document.getElementById('pg-data');
    if(!validarDataInput(dataInput, 'erro-pg-data', true)) return notify('erro', 'Corrija a data!');

    const id = document.getElementById('pg-id').value;
    const ass = assinaturasBanco.find(a => String(a.id) === String(id));
    const valorDigitado = parseFloat(document.getElementById('pg-valor').value.replace(/\./g, '').replace(',', '.')) || 0;

    const payload = {
        id: id,
        data: dataInput.value,
        valor: valorDigitado,
        nome: ass.nome,
        categoria: ass.categoria,
        conta: document.getElementById('pg-conta').value,
        forma: document.getElementById('pg-forma').value
    };

    atualizarStatus('conectando');
    try {
        await chamarMotor('registrar_pagamento_assinatura', payload);
        notify('sucesso', 'Pagamento Lançado na Planilha!');
        fecharModais();
        buscarAssinaturas();
    } catch(e) {
        notify('erro', 'Erro ao lançar pagamento');
        atualizarStatus('erro');
    }
}

async function efetivarRetroativo() {
    const dataInput = document.getElementById('rt-data');
    if(!validarDataInput(dataInput, 'erro-rt-data', false)) return notify('erro', 'Corrija a data!');

    const id = document.getElementById('rt-id').value;
    const ass = assinaturasBanco.find(a => String(a.id) === String(id));
    const valorDigitado = parseFloat(document.getElementById('rt-valor').value.replace(/\./g, '').replace(',', '.')) || 0;

    const payload = {
        id: id,
        data: dataInput.value,
        valor: valorDigitado,
        nome: ass.nome,
        categoria: ass.categoria,
        conta: document.getElementById('rt-conta').value,
        forma: document.getElementById('rt-forma').value
    };

    atualizarStatus('conectando');
    try {
        await chamarMotor('registrar_retroativo', payload);
        notify('sucesso', 'Retroativo gravado no Histórico!');
        fecharModais();
        buscarAssinaturas();
    } catch(e) {
        notify('erro', 'Erro ao lançar retroativo');
        atualizarStatus('erro');
    }
}

async function efetivarDesconto() {
    const dataInput = document.getElementById('dc-data');
    if(!validarDataInput(dataInput, 'erro-dc-data', true)) return notify('erro', 'Corrija a data!');

    const id = document.getElementById('dc-id').value;
    const ass = assinaturasBanco.find(a => String(a.id) === String(id));
    const valorLucro = parseFloat(document.getElementById('dc-valor').value.replace(/\./g, '').replace(',', '.')) || 0;

    const payload = {
        data: dataInput.value,
        nome: ass.nome,
        valor: valorLucro,
        local: document.getElementById('dc-local').value,
        detalhes: document.getElementById('dc-detalhes').value
    };

    atualizarStatus('conectando');
    try {
        await chamarMotor('registrar_economia', payload);
        notify('sucesso', 'Economia salva isoladamente!');
        fecharModais();
        buscarAssinaturas();
    } catch(e) {
        notify('erro', 'Erro ao registrar benefício');
        atualizarStatus('erro');
    }
}

function fecharModais() { document.querySelectorAll('.modal-z').forEach(el => el.classList.add('hidden')); }
function toggleSidebar() { const sb = document.getElementById('sidebar-lateral'); const ov = document.getElementById('sidebar-overlay'); sb.classList.toggle('-translate-x-full'); ov.classList.toggle('hidden'); }

function atualizarStatus(tipo) {
    const el = document.getElementById('status-conexao-flutuante');
    const span = document.getElementById('status-text');
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
        span.innerText = "Conectando...";
        icon.className = "fas fa-sync fa-spin text-lg";
    } else if (tipo === 'sucesso') {
        el.className = baseClass + "text-green-600 bg-green-50 border-green-200 lg:px-4";
        span.innerText = "Banco Conectado";
        icon.className = "fas fa-check-circle text-lg";
        statusTimeout1 = setTimeout(() => {
            span.classList.replace('lg:inline-block', 'hidden');
            el.classList.remove('lg:px-4', 'lg:gap-3');
            el.classList.add('lg:px-0', 'lg:w-10', 'lg:h-10', 'lg:justify-center');
            statusTimeout2 = setTimeout(() => {
                el.classList.remove('opacity-100', 'scale-100');
                el.classList.add('opacity-0', 'scale-75');
            }, 1500);
        }, 3000);
    } else {
        el.className = baseClass + "text-red-600 bg-red-50 border-red-200 lg:px-4";
        span.innerText = "Erro Banco";
        icon.className = "fas fa-exclamation-triangle text-lg";
    }
}

function notify(t, m) { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `${t === 'sucesso' ? 'bg-emerald-600' : 'bg-red-600'} text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase animate-bounce mt-2 tracking-widest shadow-lg z-[2000]`; toast.innerText = m; container.appendChild(toast); setTimeout(() => toast.remove(), 3000); }
function gerarPaletaDeCores(p) { const container = document.getElementById(`paleta-cores-${p}`); container.innerHTML = CORES_VIVAS.map(cor => `<div onclick="selecionarCor('${p}', '${cor}')" class="color-option shadow-sm ${p}-cor-opt" style="background-color: ${cor}" id="${p}-cor-${cor.replace('#', '')}"></div>`).join(''); }
function selecionarCor(p, corHex) { document.querySelectorAll(`.${p}-cor-opt`).forEach(el => el.classList.remove('selected')); let element = document.getElementById(`${p}-cor-${corHex.replace('#', '')}`); if(element) element.classList.add('selected'); document.getElementById(`${p}-cor`).value = corHex; }