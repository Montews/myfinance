const API_URL = "https://script.google.com/macros/s/AKfycbwEs5RX0FpcN8AR8FIG5Y5K1Qkojox2Ke8_o8MTKQMhPqQO6J6ZfVXOlF7mIIKkuYXxVg/exec";

let statusTimeout1, statusTimeout2;

window.addEventListener('load', () => {
    // Ao carregar a página, ele já inicia tentando conectar
    atualizarStatus('conectando');

    // Simulação de sucesso após carregar dados (você deve chamar isso quando sua busca terminar)
    setTimeout(() => {
        atualizarStatus('sucesso');
    }, 2000);
});

// LÓGICA DO HAMBÚRGUER (ABRE E FECHA)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-lateral');
    const overlay = document.getElementById('sidebar-overlay');
    const icon = document.getElementById('menu-icon');

    if (sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        icon.classList.replace('fa-bars', 'fa-times');
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
        icon.classList.replace('fa-times', 'fa-bars');
    }
}

// LÓGICA DO STATUS DE CONEXÃO (ROBUSTA)
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
        span.innerText = "Conectando..."; icon.className = "fas fa-sync fa-spin text-lg";
    } else if (tipo === 'sucesso') {
        el.className = baseClass + "text-green-600 bg-green-50 border-green-200 lg:px-4";
        span.innerText = "Banco Conectado"; icon.className = "fas fa-check-circle text-lg";

        statusTimeout1 = setTimeout(() => {
            span.classList.replace('lg:inline-block', 'hidden');
            el.classList.remove('lg:px-4', 'lg:gap-3');
            el.classList.add('lg:px-0', 'lg:w-10', 'lg:h-10', 'lg:justify-center');
            statusTimeout2 = setTimeout(() => { el.classList.remove('opacity-100', 'scale-100'); el.classList.add('opacity-0', 'scale-75'); }, 1500);
        }, 3000);
    } else {
        el.className = baseClass + "text-red-600 bg-red-50 border-red-200 lg:px-4";
        span.innerText = "Erro Banco"; icon.className = "fas fa-exclamation-triangle text-lg";
    }
}

// SISTEMA DE NOTIFICAÇÃO (TOASTS)
function notify(tipo, msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `${tipo === 'sucesso' ? 'bg-green-600' : 'bg-red-600'} text-white px-8 py-3 rounded-xl shadow-2xl font-black text-[10px] uppercase animate-bounce mt-2`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}