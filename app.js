import { 
    auth, db, googleProvider, signInWithPopup, signInWithEmailAndPassword, 
    onAuthStateChanged, signOut, sendPasswordResetEmail, collection, addDoc, getDocs, doc, getDoc, setDoc,
    query, orderBy, updateDoc, deleteDoc, where 
} from './firebase.js';

// Inicializa Ícones
lucide.createIcons();

// Variáveis de Estado Global
let currentUser = null;
let userProfile = null;
let currentNovelId = null;
let currentChapterId = null;
let currentChaptersList = []; // Para navegação prev/next
let fontSize = parseInt(localStorage.getItem('ln_fontsize')) || 18;
let allNovelsCache = []; // Para pesquisa rápida sem gastar reads do Firebase
let currentViewingAuthorID = null; // Para voltar e gerenciar o perfil aberto

// Elementos DOM
const views = document.querySelectorAll('.view');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');

// --- SISTEMA DE ROTEAMENTO SPA ---
function navigateTo(viewId, pushHistory = true) {
    views.forEach(view => view.classList.add('hidden'));
    const targetView = document.getElementById(`view-${viewId}`);
    if(targetView) targetView.classList.remove('hidden');
    
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    
    // Atualiza a URL do navegador
    if (pushHistory) {
        let route = viewId === 'home' ? '/' : `/${viewId}`;
        // As views 'novel' e 'reader' têm URLs customizadas geradas em suas respectivas funções
        if (viewId !== 'novel' && viewId !== 'reader') {
            history.pushState({ viewId }, "", route);
        }
    }

    if(viewId === 'home') loadHomeNovels();
    if(viewId === 'perfil') loadProfileView();
    if(viewId === 'minhas-novels') loadMinhasNovels();
    
    window.scrollTo(0,0);
}

// Escuta os botões Voltar/Avançar do navegador
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.viewId) {
        if (e.state.viewId === 'novel') {
            openNovel(e.state.novelId, false);
        } else if (e.state.viewId === 'reader') {
            openReader(e.state.capId, null, false);
        } else {
            navigateTo(e.state.viewId, false);
        }
    } else {
        handleInitialRoute();
    }
});

// Identifica a rota quando o site é carregado pela primeira vez
function handleInitialRoute() {
    const path = window.location.pathname.replace(/^\/|\/$/g, '');
    
    if (!path || path === 'home') {
        navigateTo('home', false);
    } else if (['upload-novel', 'minhas-novels', 'perfil', 'public-profile', 'edit-novel', 'upload-chapter'].includes(path)) {
        navigateTo(path, false);
    } else if (path.startsWith('capitulo-')) {
        // Se for um link direto para leitura de capítulo
        const capId = path.replace('capitulo-', '');
        openReader(capId, null, false);
    } else {
        // Assume que a URL é uma Novel (ex: nome-da-novel-IDDOFIRESTORE)
        const possibleId = path.split('-').pop(); // O ID do banco fica no final
        if (possibleId && possibleId.length > 10) { 
            openNovel(possibleId, false);
        } else {
            navigateTo('home', false); // Fallback caso não encontre
        }
    }
}

// Intercepta links do menu e botões de voltar da interface
document.querySelectorAll('[data-link]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(e.currentTarget.getAttribute('data-link'));
    });
});

// Voltar para novel a partir de upload capítulo e edição
document.getElementById('back-to-novel-btn').addEventListener('click', () => openNovel(currentNovelId));
document.getElementById('back-to-novel-from-edit-btn').addEventListener('click', () => openNovel(currentNovelId));
// Voltar do perfil publico
document.getElementById('back-from-public-profile-btn').addEventListener('click', () => {
    if(currentNovelId) openNovel(currentNovelId);
    else navigateTo('home');
});

// --- MENU HAMBÚRGUER ---
document.getElementById('menu-btn').addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('active');
});
document.getElementById('close-menu-btn').addEventListener('click', closeMenu);
overlay.addEventListener('click', closeMenu);
function closeMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// --- MODAIS ---
const loginModal = document.getElementById('login-modal');
document.getElementById('login-link').addEventListener('click', () => { closeMenu(); loginModal.classList.remove('hidden'); });
document.querySelector('.close-modal').addEventListener('click', () => loginModal.classList.add('hidden'));

const sobreModal = document.getElementById('sobre-modal');
document.getElementById('sobre-link').addEventListener('click', (e) => { e.preventDefault(); closeMenu(); sobreModal.classList.remove('hidden'); });
document.querySelector('.close-sobre-modal').addEventListener('click', () => sobreModal.classList.add('hidden'));

// --- AUTENTICAÇÃO E PERFIL ---
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    const authReqEls = document.querySelectorAll('.auth-required');
    const profileSummary = document.getElementById('sidebar-profile-summary');
    
    if (user) {
        document.getElementById('login-link').classList.add('hidden');
        document.getElementById('logout-link').classList.remove('hidden');
        authReqEls.forEach(el => el.style.display = 'flex');
        loginModal.classList.add('hidden');
        profileSummary.classList.remove('hidden');

        // Busca ou Cria Perfil Privado do Usuário Logado
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if(!userSnap.exists()) {
            const newProfile = {
                username: user.displayName || 'Novo Usuário',
                bio: '',
                avatarURL: user.photoURL || 'https://ui-avatars.com/api/?name=User&background=random',
                email: user.email
            };
            await setDoc(userRef, newProfile);
            userProfile = newProfile;
        } else {
            userProfile = userSnap.data();
        }

        document.getElementById('sidebar-username').textContent = userProfile.username;
        document.getElementById('sidebar-avatar').src = userProfile.avatarURL;

    } else {
        userProfile = null;
        document.getElementById('login-link').classList.remove('hidden');
        document.getElementById('logout-link').classList.add('hidden');
        authReqEls.forEach(el => el.style.display = 'none');
        profileSummary.classList.add('hidden');
        if(window.location.pathname === '/' || window.location.pathname === '/home'){
           navigateTo('home', false);
        }
    }
});

// Ações de Login
document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
    } catch (error) { alert("Erro ao fazer login: " + error.message); }
});
document.getElementById('btn-google-login').addEventListener('click', async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (error) { alert("Erro no Google Login: " + error.message); }
});
document.getElementById('logout-link').addEventListener('click', () => signOut(auth));

// --- MEU PERFIL (EDIÇÃO DE INFORMAÇÕES PESSOAIS) ---
function loadProfileView() {
    if(!userProfile) return;
    document.getElementById('profile-username').value = userProfile.username;
    document.getElementById('profile-avatar').value = userProfile.avatarURL;
    document.getElementById('profile-bio').value = userProfile.bio;
    document.getElementById('profile-email').value = currentUser.email;
    document.getElementById('profile-avatar-preview').src = userProfile.avatarURL;
}

document.getElementById('form-profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById('profile-username').value;
    const newAvatar = document.getElementById('profile-avatar').value || 'https://ui-avatars.com/api/?name='+newUsername;
    const newBio = document.getElementById('profile-bio').value;

    try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
            username: newUsername, avatarURL: newAvatar, bio: newBio
        });
        userProfile.username = newUsername; userProfile.avatarURL = newAvatar; userProfile.bio = newBio;
        document.getElementById('sidebar-username').textContent = newUsername;
        document.getElementById('sidebar-avatar').src = newAvatar;
        
        // Atualiza a foto do preview em tempo real
        document.getElementById('profile-avatar-preview').src = newAvatar;
        
        alert("Perfil atualizado com sucesso!");
    } catch (e) { alert("Erro ao atualizar perfil: " + e.message); }
});

document.getElementById('btn-reset-password').addEventListener('click', async () => {
    try {
        await sendPasswordResetEmail(auth, currentUser.email);
        alert("E-mail de redefinição de senha enviado para: " + currentUser.email);
    } catch (e) { alert("Erro ao enviar e-mail: " + e.message); }
});


// --- BANCO DE DADOS E NAVEGAÇÃO HOME ---

document.getElementById('search-toggle-btn').addEventListener('click', () => {
    document.getElementById('search-bar-container').classList.toggle('hidden');
});

// 1. Carregar Home e Pesquisa Dinâmica
async function loadHomeNovels() {
    const grid = document.getElementById('novels-grid');
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Carregando...</p>';
    
    try {
        if(allNovelsCache.length === 0) {
            const querySnapshot = await getDocs(collection(db, "lightnovels"));
            allNovelsCache = [];
            querySnapshot.forEach((doc) => allNovelsCache.push({ id: doc.id, ...doc.data() }));
        }
        renderHome(allNovelsCache);
    } catch (e) { console.error("Erro ao buscar novels", e); grid.innerHTML = '<p>Erro ao carregar.</p>'; }
}

function renderHome(novels) {
    const grid = document.getElementById('novels-grid');
    grid.innerHTML = '';

    const searchText = document.getElementById('search-input').value.toLowerCase();
    const searchGenre = document.getElementById('search-genre').value;
    const show18 = document.getElementById('filter-18').checked;
    const showSensible = document.getElementById('filter-sensible').checked;
    const showGore = document.getElementById('filter-gore').checked;

    let filtered = novels.filter(novel => {
        const matchText = novel.titulo.toLowerCase().includes(searchText) || novel.autorNome.toLowerCase().includes(searchText);
        const matchGenre = searchGenre === "" || novel.genero === searchGenre;
        
        let matchTags = true;
        if(novel.tags?.adult && !show18) matchTags = false;
        if(novel.tags?.sensible && !showSensible) matchTags = false;
        if(novel.tags?.gore && !showGore) matchTags = false;

        return matchText && matchGenre && matchTags;
    });

    if(filtered.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Nenhuma novel encontrada com estes filtros.</p>';
        return;
    }

    filtered.forEach((data) => {
        const card = document.createElement('div');
        card.className = 'card';
        
        let tagsHtml = '';
        if(data.tags?.adult) tagsHtml += '<span class="tag-badge">+18</span>';
        else if(data.tags?.gore) tagsHtml += '<span class="tag-badge">Gore</span>';

        card.innerHTML = `
            ${tagsHtml}
            <img src="${data.capaURL}" alt="Capa" loading="lazy">
            <div class="card-info">
                <h3>${data.titulo}</h3>
                <p>${data.genero} • <i data-lucide="heart" style="width:12px; height:12px; display:inline-block;"></i> ${data.curtidas || 0}</p>
                <p style="font-size: 0.75rem;">Por: ${data.autorNome}</p>
            </div>
        `;
        card.addEventListener('click', () => openNovel(data.id));
        grid.appendChild(card);
    });
    lucide.createIcons();
}

document.getElementById('search-input').addEventListener('input', () => renderHome(allNovelsCache));
document.getElementById('search-genre').addEventListener('change', () => renderHome(allNovelsCache));
document.querySelectorAll('.home-filter').forEach(chk => chk.addEventListener('change', () => renderHome(allNovelsCache)));


// 2. Upload de Novel Nova
document.getElementById('form-upload-novel').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!currentUser || !userProfile) return alert("Faça login e configure seu perfil primeiro!");

    const novelData = {
        titulo: document.getElementById('novel-title').value,
        sinopse: document.getElementById('novel-synopsis').value,
        capaURL: document.getElementById('novel-cover').value,
        genero: document.getElementById('novel-genre').value,
        autorUID: currentUser.uid,
        autorNome: userProfile.username, // Pega automaticamente do perfil
        tags: {
            adult: document.getElementById('tag-18').checked,
            sensible: document.getElementById('tag-sensible').checked,
            gore: document.getElementById('tag-gore').checked
        },
        curtidas: 0,
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, "lightnovels"), novelData);
        alert("Light Novel publicada com sucesso!");
        e.target.reset();
        allNovelsCache = []; // Limpa cache para forçar reload
        navigateTo('home');
    } catch (e) { alert("Erro ao publicar: " + e.message); }
});


// 3. Aba Minhas Novels (Gerenciamento)
async function loadMinhasNovels() {
    if(!currentUser) return;
    const grid = document.getElementById('minhas-novels-grid');
    grid.innerHTML = '<p>Carregando suas obras...</p>';
    
    try {
        const q = query(collection(db, "lightnovels"), where("autorUID", "==", currentUser.uid));
        const snap = await getDocs(q);
        grid.innerHTML = '';
        
        if(snap.empty) { grid.innerHTML = '<p>Você ainda não publicou nenhuma novel.</p>'; return; }
        
        snap.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<img src="${data.capaURL}"> <div class="card-info"><h3>${data.titulo}</h3></div>`;
            card.addEventListener('click', () => openNovel(doc.id));
            grid.appendChild(card);
        });
    } catch(e) { console.error(e); grid.innerHTML="Erro ao carregar.";}
}


// 4. Abrir Detalhes da Novel (Modal de Informações)
async function openNovel(novelId, pushHistory = true) {
    currentNovelId = novelId;
    navigateTo('novel', false); // Chama sem pushState genérico
    
    const content = document.getElementById('novel-details-content');
    content.innerHTML = '<p>Carregando...</p>';
    
    try {
        const docRef = doc(db, "lightnovels", novelId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const isAuthor = currentUser && currentUser.uid === data.autorUID;
            
            // --- ATUALIZA A URL COM O TÍTULO DA NOVEL E O ID ---
            if (pushHistory) {
                const slug = data.titulo.toString().toLowerCase().trim()
                    .replace(/[\s\W-]+/g, '-') // Formata o título
                    .replace(/\-$/, ''); // Remove traço final se houver
                
                history.pushState({ viewId: 'novel', novelId: novelId }, "", `/${slug}-${novelId}`);
            }

            // Controle de Botões do Autor
            const btnAddChapter = document.getElementById('btn-add-chapter');
            const btnEditNovel = document.getElementById('btn-edit-novel');
            
            if(isAuthor) {
                btnAddChapter.classList.remove('hidden');
                btnEditNovel.classList.remove('hidden');
                btnAddChapter.onclick = () => navigateTo('upload-chapter');
                btnEditNovel.onclick = () => openEditNovel(novelId, data);
            } else { 
                btnAddChapter.classList.add('hidden'); 
                btnEditNovel.classList.add('hidden');
            }

            let tagsUI = `<div class="novel-tags">`;
            if(data.tags?.adult) tagsUI += `<span class="alert">+18</span>`;
            if(data.tags?.gore) tagsUI += `<span class="alert">Gore</span>`;
            if(data.tags?.sensible) tagsUI += `<span>Temas Sensíveis</span>`;
            tagsUI += `</div>`;

            content.innerHTML = `
                <div class="novel-header">
                    <img src="${data.capaURL}" alt="Capa">
                    <div class="novel-info">
                        <h2>${data.titulo}</h2>
                        <p><strong>Autor:</strong> ${data.autorNome}</p>
                        <p><strong>Gênero:</strong> ${data.genero}</p>
                        ${tagsUI}
                        <div style="display: flex; gap: 10px; margin-top:15px; flex-wrap: wrap;">
                            <button id="btn-like" class="btn-primary" style="width:auto; display:flex; align-items:center; gap:5px; margin: 0;">
                                <i data-lucide="heart" style="width:18px; height:18px;"></i> Curtir (${data.curtidas || 0})
                            </button>
                            <button id="btn-view-author" class="btn-secondary" style="width:auto; display:flex; align-items:center; gap:5px; margin: 0; padding: 12px;">
                                <i data-lucide="user" style="width:18px; height:18px;"></i> Ver perfil do autor
                            </button>
                        </div>
                    </div>
                </div>
                <div style="background:var(--surface-color); padding: 15px; border-radius:8px; margin-top:20px;">
                    <h3>Sinopse</h3>
                    <p style="margin-top:10px; color:var(--text-muted);">${data.sinopse}</p>
                </div>
                <h3 style="margin-top:30px;">Capítulos</h3>
            `;
            lucide.createIcons();

            // Ações dos botões da info
            document.getElementById('btn-like').addEventListener('click', async () => {
                if(!currentUser) return alert("Faça login para curtir!");
                await updateDoc(docRef, { curtidas: (data.curtidas || 0) + 1 });
                openNovel(novelId, false); // recarrega tela sem alterar histórico
            });

            document.getElementById('btn-view-author').addEventListener('click', () => {
                openPublicProfile(data.autorUID);
            });

            loadChapters(novelId, isAuthor);
        }
    } catch (e) { console.error("Erro ao carregar novel", e); }
}


// 5. Editar a Light Novel Completamente
function openEditNovel(novelId, data) {
    document.getElementById('edit-novel-title').value = data.titulo;
    document.getElementById('edit-novel-synopsis').value = data.sinopse;
    document.getElementById('edit-novel-cover').value = data.capaURL;
    document.getElementById('edit-novel-genre').value = data.genero;
    
    document.getElementById('edit-tag-18').checked = data.tags?.adult || false;
    document.getElementById('edit-tag-sensible').checked = data.tags?.sensible || false;
    document.getElementById('edit-tag-gore').checked = data.tags?.gore || false;

    navigateTo('edit-novel');
}

document.getElementById('form-edit-novel').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const updatedData = {
        titulo: document.getElementById('edit-novel-title').value,
        sinopse: document.getElementById('edit-novel-synopsis').value,
        capaURL: document.getElementById('edit-novel-cover').value,
        genero: document.getElementById('edit-novel-genre').value,
        tags: {
            adult: document.getElementById('edit-tag-18').checked,
            sensible: document.getElementById('edit-tag-sensible').checked,
            gore: document.getElementById('edit-tag-gore').checked
        }
    };

    try {
        await updateDoc(doc(db, "lightnovels", currentNovelId), updatedData);
        alert("Light Novel atualizada com sucesso!");
        allNovelsCache = []; // Força limpar cache
        openNovel(currentNovelId, false); // Redireciona de volta sem poluir histórico
    } catch (err) { alert("Erro ao editar: " + err.message); }
});


// 6. Perfil Público do Autor
async function openPublicProfile(autorUID) {
    currentViewingAuthorID = autorUID;
    navigateTo('public-profile');
    
    document.getElementById('public-profile-name').textContent = "Carregando...";
    document.getElementById('public-profile-bio').textContent = "";
    document.getElementById('public-profile-avatar').src = "https://via.placeholder.com/120";
    
    const grid = document.getElementById('public-author-novels-grid');
    grid.innerHTML = '<p>Buscando obras...</p>';

    try {
        const userSnap = await getDoc(doc(db, "users", autorUID));
        if(userSnap.exists()) {
            const userData = userSnap.data();
            document.getElementById('public-profile-name').textContent = userData.username;
            document.getElementById('public-profile-bio').textContent = userData.bio || "Este autor ainda não escreveu uma biografia.";
            document.getElementById('public-profile-avatar').src = userData.avatarURL || "https://ui-avatars.com/api/?name=Autor";
        } else {
            document.getElementById('public-profile-name').textContent = "Autor Desconhecido";
            document.getElementById('public-profile-bio').textContent = "Sem informações disponíveis.";
        }

        const q = query(collection(db, "lightnovels"), where("autorUID", "==", autorUID));
        const novelSnap = await getDocs(q);
        
        grid.innerHTML = '';
        if(novelSnap.empty) {
            grid.innerHTML = '<p style="color:var(--text-muted)">Nenhuma obra publicada por este autor ainda.</p>';
            return;
        }

        novelSnap.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <img src="${data.capaURL}"> 
                <div class="card-info">
                    <h3>${data.titulo}</h3>
                    <p><i data-lucide="heart" style="width:12px; height:12px; display:inline-block;"></i> ${data.curtidas || 0}</p>
                </div>
            `;
            card.addEventListener('click', () => openNovel(doc.id));
            grid.appendChild(card);
        });
        lucide.createIcons();

    } catch(err) { console.error(err); grid.innerHTML = "Erro ao buscar informações."; }
}


// 7. Carregar Capítulos da Novel
async function loadChapters(novelId, isAuthor) {
    const list = document.getElementById('chapter-list');
    list.innerHTML = '<p>Carregando capítulos...</p>';
    
    try {
        const q = query(collection(db, `lightnovels/${novelId}/capitulos`), orderBy("numero"));
        const querySnapshot = await getDocs(q);
        list.innerHTML = '';
        currentChaptersList = [];
        
        const ultimoLido = localStorage.getItem(`ln_progress_${novelId}`);

        if(querySnapshot.empty) {
            list.innerHTML = '<p style="color:var(--text-muted)">Nenhum capítulo disponível ainda.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const chapInfo = { id: doc.id, ...data };
            currentChaptersList.push(chapInfo);

            const div = document.createElement('div');
            div.className = 'chapter-item';
            
            let htmlInner = `<div style="flex:1;"><strong>Capítulo ${data.numero}:</strong> ${data.titulo}</div>`;
            
            if(isAuthor) {
                htmlInner += `<button class="btn-danger delete-cap-btn" data-id="${doc.id}"><i data-lucide="trash-2"></i></button>`;
            }

            div.innerHTML = htmlInner;
            if(ultimoLido === doc.id) div.style.borderLeftColor = "var(--primary-color)";
            
            div.addEventListener('click', (e) => {
                if(!e.target.closest('.delete-cap-btn')) openReader(doc.id, data);
            });

            list.appendChild(div);
        });

        if(isAuthor) {
            document.querySelectorAll('.delete-cap-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const capId = e.currentTarget.getAttribute('data-id');
                    if(confirm("Tem certeza que deseja apagar este capítulo? Esta ação é irreversível.")) {
                        try {
                            await deleteDoc(doc(db, `lightnovels/${novelId}/capitulos`, capId));
                            loadChapters(novelId, isAuthor);
                        } catch(err) { alert("Erro ao apagar: " + err.message); }
                    }
                });
            });
        }
        lucide.createIcons();

    } catch(e) { console.error(e); list.innerHTML='<p>Erro ao carregar capítulos</p>'; }
}


// 8. Upload de Capítulo
document.getElementById('form-upload-chapter').addEventListener('submit', async (e) => {
    e.preventDefault();
    const capData = {
        titulo: document.getElementById('chapter-title').value,
        numero: Number(document.getElementById('chapter-number').value),
        texto: document.getElementById('chapter-text').value,
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, `lightnovels/${currentNovelId}/capitulos`), capData);
        alert("Capítulo publicado!");
        e.target.reset();
        openNovel(currentNovelId, false); // Atualiza view
    } catch (e) { alert("Erro: " + e.message); }
});


// --- LEITOR (READER) ---
function openReader(capId, capData = null, pushHistory = true) {
    currentChapterId = capId;
    navigateTo('reader', false);
    
    // Atualiza a URL para o leitor de capítulos
    if (pushHistory) {
        history.pushState({ viewId: 'reader', capId: capId }, "", `/capitulo-${capId}`);
    }
    
    localStorage.setItem(`ln_progress_${currentNovelId}`, capId);

    const content = document.getElementById('reader-content');
    content.style.fontSize = `${fontSize}px`;
    
    // Se recebemos os dados já (clique pela lista), carrega. Se não (acesso pelo link direto), busca no banco.
    if (capData) {
        renderReaderData(capId, capData);
    } else {
        content.innerHTML = '<p style="text-align:center;">Carregando capítulo...</p>';
        if(!currentNovelId) currentNovelId = localStorage.getItem('last_viewed_novel') || ""; // Tenta puxar fallback
        
        getDoc(doc(db, `lightnovels/${currentNovelId}/capitulos`, capId)).then(docSnap => {
            if (docSnap.exists()) {
                renderReaderData(capId, docSnap.data());
            } else {
                content.innerHTML = '<p style="text-align:center;">Capítulo não encontrado.</p>';
            }
        }).catch(e => {
            content.innerHTML = '<p style="text-align:center;">Erro ao carregar capítulo.</p>';
        });
    }
}

function renderReaderData(capId, capData) {
    document.getElementById('reader-title').textContent = `Cap. ${capData.numero}`;
    const content = document.getElementById('reader-content');
    
    const formatText = capData.texto.split('\n').map(p => p.trim() ? `<p style="margin-bottom:20px;">${p}</p>` : '').join('');
    content.innerHTML = `<h2 style="margin-bottom: 30px; text-align:center;">${capData.titulo}</h2>${formatText}`;

    const currentIndex = currentChaptersList.findIndex(c => c.id === capId);
    const btnPrev = document.getElementById('btn-prev-chapter');
    const btnNext = document.getElementById('btn-next-chapter');

    if(currentIndex > 0) {
        btnPrev.disabled = false;
        btnPrev.onclick = () => openReader(currentChaptersList[currentIndex - 1].id, currentChaptersList[currentIndex - 1]);
    } else { btnPrev.disabled = true; btnPrev.onclick = null; }

    if(currentIndex !== -1 && currentIndex < currentChaptersList.length - 1) {
        btnNext.disabled = false;
        btnNext.onclick = () => openReader(currentChaptersList[currentIndex + 1].id, currentChaptersList[currentIndex + 1]);
    } else { btnNext.disabled = true; btnNext.onclick = null; }
}

document.getElementById('reader-back-btn').addEventListener('click', () => {
    if(currentNovelId) openNovel(currentNovelId);
    else navigateTo('home');
});

document.getElementById('btn-font-up').addEventListener('click', () => {
    fontSize += 2;
    document.getElementById('reader-content').style.fontSize = `${fontSize}px`;
    localStorage.setItem('ln_fontsize', fontSize);
});

document.getElementById('btn-font-down').addEventListener('click', () => {
    fontSize = Math.max(14, fontSize - 2);
    document.getElementById('reader-content').style.fontSize = `${fontSize}px`;
    localStorage.setItem('ln_fontsize', fontSize);
});

document.getElementById('btn-reader-mode').addEventListener('click', () => {
    const root = document.documentElement;
    const currentBg = getComputedStyle(root).getPropertyValue('--reader-bg').trim();
    if(currentBg === '#1e1e1e') {
        root.style.setProperty('--reader-bg', '#f4f4f4');
        root.style.setProperty('--reader-text', '#121212');
    } else {
        root.style.setProperty('--reader-bg', '#1e1e1e');
        root.style.setProperty('--reader-text', '#e0e0e0');
    }
});

// Iniciar app verificando a Rota Atual (em vez de forçar carregamento da Home direto)
handleInitialRoute();
