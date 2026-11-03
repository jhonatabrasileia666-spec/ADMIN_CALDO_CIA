
/* Caixa presencial separado da comanda do garçom. Não precisa de novas tabelas. */
const balcaoEstado = {
    produtos: [], categoria: '', busca: '', itens: [],
    produtoAberto: null, quantidade: 1, enviando: false
};
const TAXA_ENTREGA_BALCAO = 4.00; // mesma taxa aplicada no cardápio do cliente
const balcaoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function balcaoEscapar(texto) {
    return escaparTextoGarcom(texto);
}
function balcaoPreco(valor) {
    const n = Number(valor);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}
function balcaoAviso(mensagem, erro) {
    const el = document.getElementById('balcao-resultado');
    if (!el) return;
    el.textContent = mensagem || '';
    el.style.color = erro ? '#b23c32' : '#18774e';
}
async function carregarCardapioBalcao() {
    if (modoAcesso !== 'admin') return;
    const lista = document.getElementById('balcao-produtos');
    lista.textContent = 'Carregando produtos...';
    const { data, error } = await db.from('cardapio').select('*')
        .order('categoria', { ascending: true })
        .order('ordem', { ascending: true });
    if (error) {
        lista.textContent = 'Não foi possível carregar os produtos. Tente abrir Balcão novamente.';
        balcaoAviso('Erro ao carregar o cardápio.', true);
        return;
    }
    balcaoEstado.produtos = (data || []).filter(function(item) {
        return item.ativo !== false && Number.isFinite(Number(item.preco)) && Number(item.preco) >= 0;
    });
    const disponiveis = CATEGORIAS.filter(function(cat) {
        return balcaoEstado.produtos.some(function(item) { return obterCategoriaItem(item) === cat.id; });
    });
    if (balcaoEstado.categoria !== 'todos' && !disponiveis.some(function(c) { return c.id === balcaoEstado.categoria; })) {
        balcaoEstado.categoria = 'todos';
    }
    renderizarCardapioBalcao();
}

function obterTipoPedidoBalcao() {
    const tipo = document.getElementById('balcao-tipo-pedido').value;
    return ['retirada', 'entrega', 'local'].includes(tipo) ? tipo : 'retirada';
}
function alterarTipoPedidoBalcao(tipo) {
    const tipoValido = ['retirada', 'entrega', 'local'].includes(tipo) ? tipo : 'retirada';
    document.getElementById('balcao-tipo-pedido').value = tipoValido;
    const ehEntrega = tipoValido === 'entrega';
    document.getElementById('balcao-campos-entrega').hidden = !ehEntrega;
    document.getElementById('balcao-linha-frete').hidden = !ehEntrega;
    renderizarPedidoBalcao();
}
function reiniciarFormularioBalcao() {
    balcaoEstado.itens = [];
    ['balcao-nome-cliente', 'balcao-telefone-cliente', 'balcao-endereco', 'balcao-referencia'].forEach(function(id) {
        document.getElementById(id).value = '';
    });
    document.getElementById('balcao-pagamento').value = 'A definir com cliente';
    alterarTipoPedidoBalcao('retirada');
}

function pesquisarBalcao(texto) {
    balcaoEstado.busca = String(texto || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    renderizarCardapioBalcao();
}
function selecionarCategoriaBalcao(cat) {
    balcaoEstado.categoria = cat;
    renderizarCardapioBalcao();
}
function renderizarCardapioBalcao() {
    const categorias = CATEGORIAS.filter(function(cat) {
        return balcaoEstado.produtos.some(function(item) { return obterCategoriaItem(item) === cat.id; });
    });
    const menu = document.getElementById('balcao-categorias');
    const lista = document.getElementById('balcao-produtos');
    menu.innerHTML = '<button type="button" class="balcao-categoria ' +
        (balcaoEstado.categoria === 'todos' ? 'ativa' : '') +
        '" onclick="selecionarCategoriaBalcao(\'todos\')">Todos</button>' +
        categorias.map(function(cat) {
            return '<button type="button" class="balcao-categoria ' +
                (balcaoEstado.categoria === cat.id ? 'ativa' : '') +
                '" onclick="selecionarCategoriaBalcao(\'' + cat.id + '\')">' +
                balcaoEscapar(cat.label) + '</button>';
        }).join('');
    const visiveis = balcaoEstado.produtos.filter(function(item) {
        const porCategoria = balcaoEstado.categoria === 'todos' || obterCategoriaItem(item) === balcaoEstado.categoria;
        const texto = (String(item.nome || '') + ' ' + String(item.descricao || ''))
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return porCategoria && (!balcaoEstado.busca || texto.includes(balcaoEstado.busca));
    });
    if (!visiveis.length) {
        lista.innerHTML = '<p style="color:#68777f;grid-column:1/-1;padding:15px 2px;">Nenhum produto encontrado.</p>';
        return;
    }
    lista.innerHTML = visiveis.map(function(item) {
        return '<article class="balcao-produto"><div><strong>' + balcaoEscapar(item.nome) +
            '</strong><small>' + balcaoMoeda.format(Number(item.preco)) + '</small></div>' +
            '<button type="button" onclick="abrirProdutoBalcao(' + Number(item.id) + ')">Adicionar +</button></article>';
    }).join('');
}

function abrirProdutoBalcao(id) {
    if (modoAcesso !== 'admin') return;
    const produto = balcaoEstado.produtos.find(function(p) { return Number(p.id) === Number(id); });
    if (!produto) return;
    balcaoEstado.produtoAberto = produto;
    balcaoEstado.quantidade = 1;
    document.getElementById('balcao-modal-nome').textContent = produto.nome;
    document.getElementById('balcao-modal-obs').value = '';
    document.getElementById('balcao-modal-quantidade').textContent = '1';
    const opc = document.getElementById('balcao-modal-opcoes');
    const nomeNormalizado = String(produto.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const exigeTipo = obterCategoriaItem(produto) === 'espetinhos' &&
        (nomeNormalizado.includes('carne') || nomeNormalizado.includes('misto'));
    if (exigeTipo) {
        opc.innerHTML = '<strong>Escolha o espetinho:</strong>' +
            '<label><input type="radio" name="balcao-tipo-espetinho" value="Carne"> Carne</label>' +
            '<label><input type="radio" name="balcao-tipo-espetinho" value="Misto"> Misto</label>';
    } else if (produto.adicionais) {
        opc.innerHTML = '<strong>Adicionais:</strong>' + LISTA_ADICIONAIS_GARCOM.map(function(ad, indice) {
            return '<label><input type="checkbox" data-balcao-adicional="' + indice +
                '"> ' + balcaoEscapar(ad.nome) + ' (+' + balcaoMoeda.format(ad.preco) + ')</label>';
        }).join('');
    } else {
        opc.innerHTML = '';
    }
    opc.style.display = opc.innerHTML ? 'block' : 'none';
    const modal = document.getElementById('balcao-modal');
    modal.classList.add('aberta');
    document.getElementById('balcao-modal-obs').focus();
}
function fecharProdutoBalcao() {
    document.getElementById('balcao-modal').classList.remove('aberta');
    balcaoEstado.produtoAberto = null;
}
function alterarQuantidadeModalBalcao(delta) {
    balcaoEstado.quantidade = Math.min(99, Math.max(1, balcaoEstado.quantidade + delta));
    document.getElementById('balcao-modal-quantidade').textContent = balcaoEstado.quantidade;
}
function adicionarProdutoBalcao() {
    const produto = balcaoEstado.produtoAberto;
    if (!produto || modoAcesso !== 'admin') return;
    let nome = String(produto.nome || '');
    let preco = balcaoPreco(produto.preco);
    const tipo = document.querySelector('#balcao-modal-opcoes input[name="balcao-tipo-espetinho"]:checked');
    const exigeTipo = document.querySelector('#balcao-modal-opcoes input[name="balcao-tipo-espetinho"]');
    if (exigeTipo && !tipo) {
        alert('Escolha Carne ou Misto antes de continuar.');
        return;
    }
    if (tipo) nome += ' (' + tipo.value + ')';
    const adicionais = [];
    document.querySelectorAll('#balcao-modal-opcoes input[data-balcao-adicional]:checked').forEach(function(input) {
        const ad = LISTA_ADICIONAIS_GARCOM[Number(input.dataset.balcaoAdicional)];
        if (ad) { adicionais.push(ad.nome); preco += Number(ad.preco); }
    });
    if (adicionais.length) nome += ' (+ ' + adicionais.join(', ') + ')';
    const obs = document.getElementById('balcao-modal-obs').value.trim().slice(0, 250);
    const existente = balcaoEstado.itens.find(function(item) {
        return item.id === produto.id && item.nome === nome && item.preco === preco && item.obs === obs;
    });
    if (existente) existente.quantidade += balcaoEstado.quantidade;
    else balcaoEstado.itens.push({
        id: produto.id, nome: nome, preco: preco, quantidade: balcaoEstado.quantidade, obs: obs
    });
    fecharProdutoBalcao();
    balcaoAviso('', false);
    renderizarPedidoBalcao();
}
function alterarQuantidadeItemBalcao(indice, delta) {
    const item = balcaoEstado.itens[indice];
    if (!item || balcaoEstado.enviando) return;
    item.quantidade += delta;
    if (item.quantidade <= 0) balcaoEstado.itens.splice(indice, 1);
    renderizarPedidoBalcao();
}
function renderizarPedidoBalcao() {
    const lista = document.getElementById('balcao-carrinho');
    lista.innerHTML = balcaoEstado.itens.length ? balcaoEstado.itens.map(function(item, indice) {
        return '<div class="balcao-carrinho-item"><div class="balcao-item-descricao"><strong>' +
            balcaoEscapar(item.nome) + '</strong>' +
            (item.obs ? '<small>Obs.: ' + balcaoEscapar(item.obs) + '</small>' : '') +
            '<small>' + balcaoMoeda.format(item.preco * item.quantidade) + '</small></div>' +
            '<div class="balcao-quantidade">' +
            '<button type="button" aria-label="Remover uma unidade" onclick="alterarQuantidadeItemBalcao(' + indice + ', -1)">−</button>' +
            '<span>' + item.quantidade + '</span>' +
            '<button type="button" aria-label="Adicionar uma unidade" onclick="alterarQuantidadeItemBalcao(' + indice + ', 1)">+</button>' +
            '</div></div>';
    }).join('') : '<p style="color:#68777f;padding:12px 0;">Nenhum produto no pedido.</p>';
    const subtotal = balcaoEstado.itens.reduce(function(s, item) { return s + item.preco * item.quantidade; }, 0);
    const total = subtotal > 0 ? subtotal + (obterTipoPedidoBalcao() === 'entrega' ? TAXA_ENTREGA_BALCAO : 0) : 0;
    document.getElementById('balcao-total').textContent = balcaoMoeda.format(total);
    document.getElementById('balcao-enviar').disabled = !balcaoEstado.itens.length || balcaoEstado.enviando;
}
function limparPedidoBalcao() {
    if (balcaoEstado.enviando) return;
    if (balcaoEstado.itens.length && !confirm('Descartar o pedido de balcão que está sendo montado?')) return;
    reiniciarFormularioBalcao();
    balcaoAviso('', false);
    renderizarPedidoBalcao();
}
async function enviarPedidoBalcao() {
    if (modoAcesso !== 'admin' || balcaoEstado.enviando) return;
    if (!balcaoEstado.itens.length) { balcaoAviso('Adicione pelo menos um produto.', true); return; }
    const tipo = obterTipoPedidoBalcao();
    const ehEntrega = tipo === 'entrega';
    const nomeInformado = document.getElementById('balcao-nome-cliente').value.trim().slice(0, 80);
    const telefone = document.getElementById('balcao-telefone-cliente').value.replace(/\D/g, '');
    const enderecoInformado = document.getElementById('balcao-endereco').value.trim().slice(0, 180);
    const referenciaInformada = document.getElementById('balcao-referencia').value.trim().slice(0, 160);
    if (ehEntrega && !nomeInformado) { balcaoAviso('Informe o nome do cliente para entrega.', true); return; }
    if (ehEntrega && (telefone.length < 10 || telefone.length > 11)) {
        balcaoAviso('Informe o WhatsApp com DDD (10 ou 11 dígitos) para entrega.', true); return;
    }
    if (ehEntrega && !enderecoInformado) { balcaoAviso('Informe o endereço de entrega.', true); return; }
    const itens = balcaoEstado.itens.map(function(item) { return Object.assign({}, item); });
    const subtotal = itens.reduce(function(s, item) { return s + item.preco * item.quantidade; }, 0);
    const total = subtotal + (ehEntrega ? TAXA_ENTREGA_BALCAO : 0);
    if (!Number.isFinite(total) || total < 0) { balcaoAviso('Valor do pedido inválido.', true); return; }
    const nome = nomeInformado || 'Cliente do balcão';
    const pagamento = document.getElementById('balcao-pagamento').value;
    balcaoEstado.enviando = true;
    const botao = document.getElementById('balcao-enviar');
    botao.textContent = 'Salvando pedido...';
    renderizarPedidoBalcao();
    try {
        const { data: pedido, error } = await db.from('pedidos').insert({
            cliente_nome: nome,
            cliente_telefone: ehEntrega ? telefone : '',
            itens: itens,
            endereco: ehEntrega ? enderecoInformado : (tipo === 'local' ? 'Consumo no local - balcão' : 'Retirada no balcão'),
            referencia: ehEntrega ? referenciaInformada : (tipo === 'local' ? 'Balcão - consumo local' : 'Balcão - retirada'),
            forma_pagamento: pagamento,
            total: Number(total.toFixed(2)),
            status: 1,
            tipo_pedido: tipo,
            pago: false
        }).select('*').single();
        if (error) throw error;
        // Usa a rotina existente; não chama imprimirCupom em paralelo.
        try { encaminharPedidoParaImpressao(pedido); }
        catch (erroImpressao) { console.warn('Pedido salvo, mas impressão não foi iniciada:', erroImpressao); }
        reiniciarFormularioBalcao();
        const tipoTexto = tipo === 'entrega' ? 'Entrega' : (tipo === 'local' ? 'Consumo no local' : 'Retirada');
        balcaoAviso('Pedido #' + pedido.id + ' (' + tipoTexto + ') enviado para a cozinha. Confira em Pedidos.', false);
        await carregarPedidos();
    } catch (erro) {
        console.error('Falha ao lançar pedido do balcão:', erro);
        balcaoAviso('Não foi possível salvar: ' + (erro.message || 'verifique a conexão e tente novamente.'), true);
    } finally {
        balcaoEstado.enviando = false;
        botao.textContent = 'Enviar pedido para cozinha';
        renderizarPedidoBalcao();
    }
}
document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape' && document.getElementById('balcao-modal').classList.contains('aberta')) fecharProdutoBalcao();
});
document.getElementById('balcao-modal').addEventListener('click', function(ev) {
    if (ev.target === this) fecharProdutoBalcao();
});
renderizarPedidoBalcao();
