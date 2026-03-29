const API_URL = "https://script.google.com/macros/s/AKfycby7cBP4XB5-ldRA9P07qLd0onh6GIx79FP_xfK2KHE5GnYogm1xgP-Ft9iy-6z3DkJE_A/exec";

let listaCategorias = [];
let listaContas = [];
let timerLoading = null;

// ==========================================
// 1. INICIALIZAÇÃO E CARREGAMENTO
// ==========================================

window.addEventListener('load', async () => {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T');
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T');

    document.getElementById('filtro-inicio').value = primeiroDia;
    document.getElementById('filtro-fim').value = ultimoDia;

    gerarDropdownFatura('new-mes-fatura');
    ajustarCamposFiltro();
    verificarInvestimento();

    mostrarStatus('loading');

    await carregarOpcoesAuxiliares();
    await buscarDados();
});

async function carregarOpcoesAuxiliares() {
    try {
        const [resCat, resCon] = await Promise.all([
            fetch(`${API_URL}?tipo=categorias`),
            fetch(`${API_URL}?tipo=contas`)
        ]);
        listaCategorias = await resCat.json();
        listaContas = await resCon.json();

        const preencher = (id, lista, key) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = lista.map(i => `<option value="${i[key]}">${i[key]}</option>`).join('');
        };
        preencher('filtro-conta', listaContas, 'conta');
        preencher('filtro-categoria', listaCategorias, 'categoria');
        preencher('new-conta', listaContas, 'conta');
        preencher('new-conta-auxiliar', listaContas, 'conta');
        preencher('new-categoria', listaCategorias, 'categoria');
    } catch (e) {
        console.error("Erro auxiliares:", e);
        notify('erro', 'Falha ao carregar Contas e Categorias.');
    }
}

// ==========================================
// 2. SISTEMA DE NOTIFICAÇÕES (TOAST)
// ==========================================

function notify(tipo, mensagem) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const corBg = tipo === 'sucesso' ? 'bg-green-500' : 'bg-red-500';

    toast.className = `toast ${corBg} text-white px-6 py-3 rounded-lg shadow-xl font-bold text-sm transform transition-all duration-300 translate-y-0 opacity-100 flex items-center gap-2`;
    toast.innerHTML = tipo === 'sucesso' ? `<i class="fas fa-check-circle"></i> ${mensagem}` : `<i class="fas fa-exclamation-circle"></i> ${mensagem}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.replace('opacity-100', 'opacity-0');
        toast.classList.replace('translate-y-0', '-translate-y-4');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// 3. LÓGICA DE INTERAÇÃO UI E CONTROLES VISUAIS
// ==========================================

function verificarInvestimento() {
    const forma = document.getElementById('new-forma').value;
    const tipo = document.getElementById('new-tipo').value;

    const divAuxiliar = document.getElementById('div-new-conta-auxiliar');
    const labelAuxiliar = document.getElementById('label-conta-auxiliar');
    const labelPrincipal = document.getElementById('label-conta-principal');

    const chkRendimentoLabel = document.getElementById('label-check-rendimento');
    const chkRendimentoInput = document.getElementById('check-rendimento');
    const contaAuxiliarInput = document.getElementById('new-conta-auxiliar');

    const campoFatura = document.getElementById('new-mes-fatura');
    const campoParcela = document.getElementById('new-parcela');

    if (forma === 'INVESTIMENTO') {
        divAuxiliar.classList.remove('hidden');
        divAuxiliar.classList.add('flex');

        if (tipo === 'ENTRADA') {
            labelPrincipal.innerText = "Conta Corretora (Destino)";
            labelAuxiliar.innerHTML = '<i class="fas fa-arrow-circle-up text-red-500 mr-1"></i> Conta Banco (Vai sair daqui)';

            chkRendimentoLabel.classList.remove('hidden');
            chkRendimentoLabel.classList.add('flex');
        } else {
            labelPrincipal.innerText = "Conta Corretora (Origem)";
            labelAuxiliar.innerHTML = '<i class="fas fa-arrow-circle-down text-green-500 mr-1"></i> Conta Banco (Vai entrar aqui)';

            chkRendimentoLabel.classList.add('hidden');
            chkRendimentoLabel.classList.remove('flex');
            chkRendimentoInput.checked = false;
            contaAuxiliarInput.disabled = false;
            contaAuxiliarInput.classList.remove('opacity-50');
        }
    } else {
        divAuxiliar.classList.add('hidden');
        divAuxiliar.classList.remove('flex');
        labelPrincipal.innerText = "Conta";

        if (chkRendimentoLabel) {
            chkRendimentoLabel.classList.add('hidden');
            chkRendimentoLabel.classList.remove('flex');
            chkRendimentoInput.checked = false;
            contaAuxiliarInput.disabled = false;
            contaAuxiliarInput.classList.remove('opacity-50');
        }
    }

    if (forma !== 'CREDITO') {
        campoFatura.value = "";
        campoFatura.disabled = true;
        campoFatura.classList.add('bg-gray-200', 'cursor-not-allowed');

        campoParcela.value = "";
        campoParcela.disabled = true;
        campoParcela.classList.add('bg-gray-200', 'cursor-not-allowed');
    } else {
        campoFatura.disabled = false;
        campoFatura.classList.remove('bg-gray-200', 'cursor-not-allowed');
        if (!campoFatura.value) gerarDropdownFatura('new-mes-fatura');

        campoParcela.disabled = false;
        campoParcela.classList.remove('bg-gray-200', 'cursor-not-allowed');
        if (!campoParcela.value) campoParcela.value = "1/1";
    }
}

function ajustarCamposFiltro() {
    const tipo = document.getElementById('filtro-tipo').value;
    ['div-inicio', 'div-fim', 'div-conta', 'div-categoria', 'div-fatura'].forEach(id => document.getElementById(id).classList.add('hidden'));

    if (['todos', 'periodo-conta'].includes(tipo)) {
        document.getElementById('div-inicio').classList.remove('hidden');
        document.getElementById('div-fim').classList.remove('hidden');
    }

    if (['conta', 'periodo-conta', 'fatura'].includes(tipo)) document.getElementById('div-conta').classList.remove('hidden');
    if (tipo === 'categoria') document.getElementById('div-categoria').classList.remove('hidden');
    if (tipo === 'fatura') document.getElementById('div-fatura').classList.remove('hidden');
}

// ==========================================
// 4. BUSCA E RENDERIZAÇÃO DA TABELA
// ==========================================

async function buscarDados() {
    mostrarStatus('loading');
    const tipo = document.getElementById('filtro-tipo').value;
    const ini = document.getElementById('filtro-inicio').value;
    const fim = document.getElementById('filtro-fim').value;
    const conta = encodeURIComponent(document.getElementById('filtro-conta').value);
    const categoria = encodeURIComponent(document.getElementById('filtro-categoria').value);
    const fatura = encodeURIComponent(document.getElementById('filtro-mes-fatura').value);

    let tipoApi = (tipo === 'todos' && ini && fim) ? 'periodo' : tipo;
    let url = `${API_URL}?tipo=${tipoApi}`;

    if (tipoApi === 'periodo' || tipo === 'periodo-conta') {
        url += `&inicio=${ini}&fim=${fim}`;
    }
    if (tipo === 'conta' || tipo === 'periodo-conta') url += `&conta=${conta}`;
    if (tipo === 'categoria') url += `&categoria=${categoria}`;
    if (tipo === 'fatura') url += `&conta=${conta}&mes_fatura=${fatura}`;

    try {
        const res = await fetch(url);
        const dados = await res.json();
        if (!dados || dados.length === 0) {
            document.getElementById('tabela-corpo').innerHTML = "";
            mostrarStatus('vazio');
        } else {
            renderizarTabela(dados);
            calcularResumos(dados);
            mostrarStatus('sucesso');
        }
    } catch (e) {
        mostrarStatus('vazio');
        notify('erro', 'Erro ao buscar dados da planilha.');
    }
}

function renderizarTabela(dados) {
    const corpo = document.getElementById('tabela-corpo');
    corpo.innerHTML = "";

    dados.forEach((item, index) => {
        const idLinha = `detalhe-${index}`;

        // 🔴🟢🔵 LÓGICA DE CORES DA TABELA ATUALIZADA
        let corVal = "text-green-600"; // Padrão
        if (item.tipo === "SAIDA") {
            corVal = "text-red-600"; // Saídas sempre vermelhas
        } else {
            if (item.forma_pagamento === "INVESTIMENTO") {
                // Se for investimento E tiver a tag na descrição, pinta de verde (Lucro)
                if (item.descricao && item.descricao.includes("(Rendimento)")) {
                    corVal = "text-green-600";
                } else {
                    corVal = "text-blue-600"; // Se não, é aporte (Azul)
                }
            } else {
                corVal = "text-green-600";
            }
        }

        let d = String(item.data).split(' ');
        if (d.includes('/')) {
            const p = d.split('/');
            d = `${p.padStart(2,'0')}/${p.padStart(2,'0')}/${p.substring(0,2)}`;
        }

        const lockFaturaParcela = item.forma_pagamento !== 'CREDITO';

        corpo.innerHTML += `
            <tr class="hover:bg-gray-50 cursor-pointer border-t" onclick="toggleLinha('${idLinha}')">
                <td class="p-4 text-center text-gray-300"><i class="fas fa-chevron-right transition-all" id="icon-${idLinha}"></i></td>
                <td class="p-4 text-sm font-medium">${d}</td>
                <td class="p-4 text-sm font-bold ${corVal}">R$ ${item.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td class="p-4 text-sm text-gray-700">${item.descricao}</td>
                <td class="p-4 text-sm text-gray-500">${item.conta}</td>
                <td class="p-4 text-sm font-bold text-gray-400 uppercase text-[10px]">${item.categoria}</td>
                <td class="p-4 text-sm text-blue-600 font-bold">${item.mes_fatura || "-"}</td>
                <td class="p-4 text-sm text-center text-gray-400 font-bold">${item.parcela || "-"}</td>
            </tr>
            <tr id="${idLinha}" class="hidden bg-slate-50 border-l-4 border-blue-500">
                <td colspan="8" class="p-6">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4" id="form-${idLinha}">
                        <div><label class="text-[10px] font-bold uppercase">Data</label><input type="date" value="${formatarParaInputData(item.data)}" class="w-full border p-2 rounded text-sm edit-field" data-key="data"></div>
                        <div><label class="text-[10px] font-bold uppercase">Valor</label><input type="number" step="0.01" value="${item.valor}" class="w-full border p-2 rounded text-sm edit-field" data-key="valor"></div>
                        <div><label class="text-[10px] font-bold uppercase">Local</label><input type="text" value="${item.local || ''}" class="w-full border p-2 rounded text-sm edit-field" data-key="local"></div>
                        <div class="md:col-span-1"><label class="text-[10px] font-bold uppercase">Descrição</label><input type="text" value="${item.descricao}" class="w-full border p-2 rounded text-sm edit-field" data-key="descricao"></div>

                        <div><label class="text-[10px] font-bold uppercase">Tipo</label><select class="w-full border p-2 rounded text-sm edit-field bg-gray-100 cursor-not-allowed" data-key="tipo" disabled><option value="${item.tipo}">${item.tipo}</option></select></div>
                        <div><label class="text-[10px] font-bold uppercase">Forma</label><select class="w-full border p-2 rounded text-sm edit-field bg-gray-100 cursor-not-allowed" data-key="forma_pagamento" disabled><option value="${item.forma_pagamento}">${item.forma_pagamento}</option></select></div>

                        <div><label class="text-[10px] font-bold uppercase">Categoria</label><select class="w-full border p-2 rounded text-sm edit-field" data-key="categoria">${listaCategorias.map(c => `<option value="${c.categoria}" ${c.categoria === item.categoria ? 'selected' : ''}>${c.categoria}</option>`).join('')}</select></div>
                        <div><label class="text-[10px] font-bold uppercase">Conta</label><select class="w-full border p-2 rounded text-sm edit-field" data-key="conta">${listaContas.map(c => `<option value="${c.conta}" ${c.conta === item.conta ? 'selected' : ''}>${c.conta}</option>`).join('')}</select></div>

                        <div><label class="text-[10px] font-bold uppercase">Fatura</label><input type="text" value="${item.mes_fatura || ''}" class="w-full border p-2 rounded text-sm edit-field bg-gray-100 cursor-not-allowed" data-key="mes_fatura" disabled></div>
                        <div><label class="text-[10px] font-bold uppercase">Parcela</label><input type="text" value="${item.parcela || ''}" class="w-full border p-2 rounded text-sm edit-field bg-gray-100 cursor-not-allowed" data-key="parcela" disabled></div>

                        <div class="md:col-span-4 flex justify-end items-end gap-2 pt-2 border-t mt-2">
                            <button onclick="salvarEdicao('${item.id}', '${idLinha}', this)" class="bg-blue-600 text-white px-5 py-2 rounded text-sm font-bold shadow hover:bg-blue-700">SALVAR</button>
                            <button onclick="deletarGasto('${item.id}', this)" class="bg-red-50 text-red-600 px-5 py-2 rounded text-sm font-bold border border-red-200 hover:bg-red-100">EXCLUIR</button>
                        </div>
                    </div>
                </td>
            </tr>`;
    });
}

// ==========================================
// 5. OPERAÇÕES DE REDE (POST E CRIAÇÃO DUPLA)
// ==========================================

async function enviarPost(url, payload) {
    const res = await fetch(url, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) });
    return await res.json();
}

async function salvarNovoGasto(btn) {
    const labelOriginal = btn.innerText;
    btn.innerText = "PROCESSANDO...";
    btn.disabled = true;

    const tipoGasto = document.getElementById('new-tipo').value;
    const formaGasto = document.getElementById('new-forma').value;
    const isRendimento = document.getElementById('check-rendimento').checked;

    const payload = {
        data: document.getElementById('new-data').value || new Date().toISOString().split('T'),
        valor: parseFloat(document.getElementById('new-valor').value),
        local: document.getElementById('new-local').value,
        descricao: document.getElementById('new-descricao').value,
        categoria: document.getElementById('new-categoria').value,
        conta: document.getElementById('new-conta').value,
        tipo: tipoGasto,
        forma_pagamento: formaGasto,
        parcela: document.getElementById('new-parcela').value || "1/1",
        mes_fatura: document.getElementById('new-mes-fatura').value
    };

    try {
        if (formaGasto === 'INVESTIMENTO' && !isRendimento) {
            const payloadAuxiliar = { ...payload };
            const contaAux = document.getElementById('new-conta-auxiliar').value;

            if (tipoGasto === 'ENTRADA') {
                payloadAuxiliar.tipo = 'SAIDA';
                payloadAuxiliar.conta = contaAux;
                payloadAuxiliar.descricao = payload.descricao + ' (Envio para Corretora)';
                payloadAuxiliar.forma_pagamento = 'DEBITO';
            } else if (tipoGasto === 'SAIDA') {
                payloadAuxiliar.tipo = 'ENTRADA';
                payloadAuxiliar.conta = contaAux;
                payloadAuxiliar.descricao = payload.descricao + ' (Resgate da Corretora)';
                payloadAuxiliar.forma_pagamento = 'DEBITO';
            }

            const resAux = await enviarPost(`${API_URL}?tipo=criar_gasto`, payloadAuxiliar);
            if (resAux.status === "erro") {
                notify('erro', 'Erro ao processar a conta relacionada do investimento.');
                btn.innerText = labelOriginal;
                btn.disabled = false;
                return;
            }
        }

        // Se marcou a Caixa Mágica, mantém como INVESTIMENTO para o banco, mas adiciona tag na descrição
        if (isRendimento) {
            payload.forma_pagamento = 'INVESTIMENTO';
            payload.descricao = payload.descricao + ' (Rendimento)';
        }

        const res = await enviarPost(`${API_URL}?tipo=criar_gasto`, payload);
        if (res.status === "erro") {
            notify('erro', res.mensagem);
        } else {
            notify('sucesso', 'Lançamento registrado com sucesso!');
            if (!document.getElementById('criar-varios').checked) fecharModal();
            buscarDados();
        }
    } catch (e) {
        notify('erro', 'Erro de conexão com a planilha.');
    } finally {
        btn.innerText = labelOriginal;
        btn.disabled = false;
    }
}

async function salvarEdicao(id, idLinha, btn) {
    const labelOriginal = btn.innerText;
    btn.innerText = "SALVANDO...";
    btn.disabled = true;

    const inputs = document.querySelectorAll(`#form-${idLinha} .edit-field`);
    const payload = { id: id };

    inputs.forEach(i => {
        if(!i.disabled) {
            payload[i.getAttribute('data-key')] = i.value;
        } else {
            payload[i.getAttribute('data-key')] = i.value || "";
        }
    });

    try {
        const res = await enviarPost(`${API_URL}?tipo=editar_gasto`, payload);
        if (res.status === "erro") {
            notify('erro', res.mensagem);
        } else {
            notify('sucesso', 'Edição salva com sucesso!');
            buscarDados();
        }
    } catch (e) {
        notify('erro', 'Erro ao editar lançamento.');
    } finally {
        btn.innerText = labelOriginal;
        btn.disabled = false;
    }
}

async function deletarGasto(id, btn) {
    if (!confirm("Tem certeza que deseja excluir este registro?")) return;

    const labelOriginal = btn.innerText;
    btn.innerText = "LIMPANDO...";
    btn.disabled = true;

    try {
        await enviarPost(`${API_URL}?tipo=deletar_gasto`, { id: id });
        notify('sucesso', 'Registro excluído!');
        buscarDados();
    } catch (e) {
        notify('erro', 'Erro ao excluir.');
        btn.innerText = labelOriginal;
        btn.disabled = false;
    }
}

// ==========================================
// 6. UTILITÁRIOS E FORMATAÇÃO
// ==========================================

function formatarParaInputData(str) {
    if (!str || !str.includes('/')) return "";
    const [d, m, a] = str.split('/');
    const ano = a.length === 2 ? `20${a}` : a.substring(0,4);
    return `${ano}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function gerarDropdownFatura(id, valorAtual = "") {
    const meses = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const agora = new Date();
    const fAtual = `${meses[agora.getMonth()]}/${String(agora.getFullYear()).slice(-2)}`;
    let h = "";

    for (let ano = 26; ano <= 30; ano++) {
        meses.forEach(m => {
            const val = `${m}/${ano}`;
            h += `<option value="${val}" ${valorAtual ? val === valorAtual : val === fAtual ? 'selected' : ''}>${val}</option>`;
        });
    }
    if (id) document.getElementById(id).innerHTML = h;
    return h;
}

function mostrarStatus(tipo) {
    const container = document.getElementById('status-container');
    const msgArea = document.getElementById('status-message');
    const tab = document.getElementById('tabela-container');

    if (timerLoading) {
        clearInterval(timerLoading);
        timerLoading = null;
    }

    if (tipo === 'loading') {
        container.classList.remove('hidden');
        tab.classList.add('loading-overlay');

        let segundos = 15;
        msgArea.className = "p-3 bg-white text-blue-600 rounded-lg text-center text-sm font-bold border shadow-sm";
        msgArea.innerHTML = `<i class='fas fa-spinner fa-spin mr-2'></i> Buscando dados, aguarde ${segundos} segundos...`;

        timerLoading = setInterval(() => {
            segundos--;
            if (segundos > 0) {
                msgArea.innerHTML = `<i class='fas fa-spinner fa-spin mr-2'></i> Buscando dados, aguarde ${segundos} segundos...`;
            } else {
                msgArea.innerHTML = `<i class='fas fa-spinner fa-spin mr-2'></i> A planilha está demorando um pouco mais, quase lá...`;
                clearInterval(timerLoading);
            }
        }, 1000);

    } else if (tipo === 'vazio') {
        container.classList.remove('hidden');
        tab.classList.remove('loading-overlay');
        msgArea.innerHTML = "Nenhum registro encontrado neste período.";
        msgArea.className = "p-3 bg-amber-50 text-amber-700 rounded-lg text-center text-sm font-bold border border-amber-200";
    } else {
        container.classList.add('hidden');
        tab.classList.remove('loading-overlay');
    }
}

function calcularResumos(dados) {
    let ent = 0, sai = 0, inv = 0;

    dados.forEach(i => {
        const v = parseFloat(i.valor) || 0;

        if (i.forma_pagamento === "INVESTIMENTO") {
            if (i.tipo === "ENTRADA") inv += v;
            else if (i.tipo === "SAIDA") inv -= v;
        } else {
            if (i.tipo === "ENTRADA") ent += v;
            else if (i.tipo === "SAIDA") sai += v;
        }
    });

    document.getElementById('total-entrada').innerText = `R$ ${ent.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('total-saida').innerText = `R$ ${sai.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('total-investimento').innerText = `R$ ${inv.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

function toggleLinha(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    const isHidden = el.classList.contains('hidden');

    document.querySelectorAll('[id^="detalhe-"]').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('[id^="icon-detalhe-"]').forEach(i => {
        i.classList.remove('fa-chevron-down');
        i.classList.add('fa-chevron-right');
    });

    if (isHidden) {
        el.classList.remove('hidden');
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-down');
    }
}

function fecharModal() {
    document.getElementById('modal-novo').classList.add('hidden');
    document.getElementById('form-novo').reset();

    const chkRendimento = document.getElementById('check-rendimento');
    const contaAuxiliar = document.getElementById('new-conta-auxiliar');

    if (chkRendimento && contaAuxiliar) {
        chkRendimento.checked = false;
        contaAuxiliar.disabled = false;
        contaAuxiliar.classList.remove('opacity-50');
    }

    verificarInvestimento();
}

function abrirModalNovoGasto() {
    document.getElementById('modal-novo').classList.remove('hidden');
}
