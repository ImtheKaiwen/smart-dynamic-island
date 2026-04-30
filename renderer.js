const island = document.getElementById('island');
const searchInput = document.getElementById('search-input');
const cancelSearch = document.getElementById('cancel-search');
const cancelThinking = document.getElementById('cancel-thinking');
const closeExpanded = document.getElementById('close-expanded');
const islandTitle = document.querySelector('.title');
const buttonList = document.querySelector('.button-list');

// Initialize Lucide icons
lucide.createIcons();

// --- State Management ---
const STATE_SIZES = {
    'collapsed': { width: 100, height: 32 },
    'active-search': { width: 420, height: 54 },
    'thinking': { width: 170, height: 40 },
    'expanded': { width: 420, height: null },
    'music': { width: 280, height: 60 }
};

function setIslandState(state) {
    island.classList.remove('collapsed', 'active-search', 'thinking', 'expanded', 'reply-mode', 'music');
    island.classList.add(state);

    // Müzik ve Collapsed hariç tüm modlarda tıklanabilirliği zorunlu tut
    // Müzik modunda butonlar olduğu için tıklanabilir olmalı!
    if (state === 'collapsed') {
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    } else {
        window.electronAPI.setIgnoreMouseEvents(false);
    }

    if (state === 'active-search') {
        setTimeout(() => searchInput.focus(), 100);
    }
    updateWindowSize(state);
}

// --- Window Size Logic ---
function updateWindowSize() {
    // Adanın gerçek boyutlarını (CSS ile oluşan fit-content dahil) al
    const rect = island.getBoundingClientRect();

    // Pencereyi adadan biraz daha büyük yap (pürüzsüz kenarlar için)
    window.electronAPI.resizeWindow({
        width: Math.ceil(rect.width) + 40,
        height: Math.ceil(rect.height) + 40
    });
}


// --- WebSocket Connection ---
let socket = null;

function connectBackend() {
    socket = new WebSocket('ws://127.0.0.1:8000/ws/thinking');
    socket.onopen = () => console.log('Connected to Python Backend');
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data) handleBackendStep(data);
    };
    socket.onclose = () => setTimeout(connectBackend, 3000);
}

// Markdown Yapılandırması
marked.setOptions({
    breaks: true,
    gfm: true
});

function formatMarkdown(text) {
    if (!text) return "";
    return marked.parse(text);
}

function addCopyButtons() {
    // Önce renklendirmeyi yap
    document.querySelectorAll('pre code').forEach((block) => {
        if (!block.classList.contains('hljs')) {
            hljs.highlightElement(block);
        }

        if (block.parentElement.querySelector('.copy-code-btn')) return;

        const button = document.createElement('button');
        button.className = 'copy-code-btn';
        button.innerHTML = '<i data-lucide="copy"></i>';

        button.onclick = () => {
            navigator.clipboard.writeText(block.innerText);
            button.innerHTML = '<i data-lucide="check" style="color: var(--green-accent)"></i>';
            setTimeout(() => {
                button.innerHTML = '<i data-lucide="copy"></i>';
                lucide.createIcons();
            }, 2000);
            lucide.createIcons();
        };

        block.parentElement.style.position = 'relative';
        block.parentElement.appendChild(button);
    });
    lucide.createIcons();
}

function handleBackendStep(step) {
    const thinkingText = document.querySelector('.thinking-text');

    if (step.status === 'thinking') {
        setIslandState('thinking');
        if (thinkingText && step.message) {
            thinkingText.innerHTML = formatMarkdown(step.message);
            addCopyButtons();
        }
    } else if (step.status === 'complete') {
        setIslandState('expanded');
        // Normal sonuçlarda karuseli gizle
        document.querySelector('.carousel-container').style.display = 'none';
        document.querySelector('.carousel-nav').style.display = 'none';

        const title = document.getElementById('expanded-title');
        if (title) {
            title.innerHTML = formatMarkdown(step.message);
            addCopyButtons();
        }
        buttonList.innerHTML = `
            <button class="action-btn reply-btn">
                <i data-lucide="check" class="btn-icon"></i>
                <span>Tamam</span>
            </button>
        `;
        lucide.createIcons();
        buttonList.querySelector('.reply-btn').onclick = () => setIslandState('collapsed');
    } else if (step.status === 'music_update') {
        const idleDefault = document.querySelector('.idle-info-default');
        const idleMusic = document.querySelector('.idle-info-music');
        const miniSongName = document.getElementById('mini-song-name');

        if (step.media_status === 'playing' || step.media_status === 'paused') {
            // Pill modundaki gorunumu guncelle
            if (idleDefault) idleDefault.style.display = 'none';
            if (idleMusic) {
                idleMusic.style.display = 'flex';
                if (miniSongName) miniSongName.textContent = step.title;
            }

            // Player modundaki gorunumu guncelle
            const songNameEl = document.querySelector('.song-name');
            const artistNameEl = document.querySelector('.artist-name');
            if (songNameEl) songNameEl.textContent = step.title;
            if (artistNameEl) artistNameEl.textContent = step.artist;

            // Iconu guncelle (Ters mantik: Caliyorsa duraklat butonu, durmussa oynat butonu)
            const playPauseContainer = document.getElementById('music-play-pause');
            if (playPauseContainer) {
                const icon = playPauseContainer.querySelector('[data-lucide]');
                if (icon) {
                    const nextIcon = step.media_status === 'playing' ? 'pause' : 'play';
                    icon.setAttribute('data-lucide', nextIcon);
                    lucide.createIcons();
                }
            }
        } else {
            // Muzik durunca veya kapaninca
            if (idleDefault) idleDefault.style.display = 'flex';
            if (idleMusic) idleMusic.style.display = 'none';
            setIslandState('collapsed');
        }
    } else if (step.status === 'error') {
        setIslandState('expanded');
        const title = document.getElementById('expanded-title');
        if (title) title.textContent = "Hata oluştu.";
        buttonList.innerHTML = `
            <button class="action-btn error-close-btn" style="background: #ff4444; color: white;">
                <i data-lucide="alert-circle" class="btn-icon"></i>
                <span>${step.message} (Kapat)</span>
            </button>
        `;
        lucide.createIcons();
        buttonList.querySelector('.error-close-btn').onclick = () => setIslandState('collapsed');
        setTimeout(() => setIslandState('collapsed'), 4000);
    }
}

// --- Reply Mode Logic ---
const replyInput = document.getElementById('reply-input');
const sendReplyBtn = document.getElementById('send-reply-btn');
const replyContact = document.getElementById('reply-contact');

function openReplyMode(contact) {
    replyContact.textContent = contact;
    setIslandState('reply-mode');
    setTimeout(() => replyInput.focus(), 300);
}

function sendQuickReply() {
    const text = replyInput.value.trim();
    const contact = replyContact.textContent;
    if (text && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ query: `${contact} kişisine şu mesajı gönder: ${text}` }));
        replyInput.value = '';

        // Cevap verilen mesajı listeden sil (Akıllı Temizlik)
        unreadMessages.splice(currentCarouselIndex, 1);
        if (currentCarouselIndex >= unreadMessages.length) {
            currentCarouselIndex = Math.max(0, unreadMessages.length - 1);
        }

        setIslandState('thinking');
    }
}


sendReplyBtn.onclick = sendQuickReply;
replyInput.onkeydown = (e) => { if (e.key === 'Enter') sendQuickReply(); };

connectBackend();

// --- UI Interactions ---

// 1. Idle Click -> Search Bar
island.onclick = () => {
    if (island.classList.contains('collapsed') || island.classList.contains('music')) {
        setIslandState('active-search');
    }
};

// 2. Search Bar X -> Back to Pill
cancelSearch.onclick = (e) => {
    e.stopPropagation();
    setIslandState('collapsed');
};

// 3. Thinking X -> Send Cancel to Backend & Back to Search
cancelThinking.onclick = (e) => {
    e.stopPropagation();
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "cancel" }));
    }
    setIslandState('active-search');
};

// 4. Results View X -> Back to Search Bar
closeExpanded.onclick = (e) => {
    e.stopPropagation();
    setIslandState('active-search');
};

// --- Carousel State & Logic ---
let unreadMessages = [];
let currentCarouselIndex = 0;

const carouselTrack = document.getElementById('carousel-track');
const carouselInfo = document.getElementById('carousel-info');
const prevMsgBtn = document.getElementById('prev-msg');
const nextMsgBtn = document.getElementById('next-msg');

// Backend'den okunmamış mesajları çek
async function fetchUnread() {
    try {
        const response = await fetch('http://127.0.0.1:8000/unread');
        unreadMessages = await response.json();
        updateBadges();

        if (unreadMessages && unreadMessages.length > 0) {
            // Hemen karuseli açma, önce sor!
            showUnreadPrompt(unreadMessages.length);
        }
    } catch (e) {
        console.error("Hafıza bağlantı hatası:", e);
    }
}

function showUnreadPrompt(count) {
    setIslandState('expanded');
    const title = document.getElementById('expanded-title');
    title.textContent = "Hoş Geldin!";

    // Karusel alanını şimdilik gizle, sadece soruyu sor
    carouselTrack.parentElement.style.display = 'none';

    buttonList.innerHTML = `
        <div style="color: white; margin-bottom: 10px; font-size: 14px;">
            ${count} adet okunmamış mesajın var.
        </div>
        <div style="display: flex; gap: 10px;">
            <button class="action-btn read-now-btn" style="background: var(--green-accent); color: black;">
                <i data-lucide="mail-open"></i> <span>Şimdi Oku</span>
            </button>
            <button class="action-btn later-btn">
                <span>Daha Sonra</span>
            </button>
        </div>
    `;
    lucide.createIcons();

    buttonList.querySelector('.read-now-btn').onclick = () => {
        title.textContent = "Mesajların";
        carouselTrack.parentElement.style.display = 'block';
        renderCarousel();
    };

    buttonList.querySelector('.later-btn').onclick = () => {
        // Tamamen kapatma, arama çubuğuna (asistanın ilk hali) geri dön
        setIslandState('active-search');
    };
}



function updateBadges() {
    const pillBadge = document.getElementById('unread-badge-pill');
    const searchBadge = document.getElementById('unread-badge-search');
    const searchCount = searchBadge.querySelector('.badge-count');
    const count = unreadMessages.length;

    if (count > 0) {
        pillBadge.textContent = count;
        pillBadge.style.display = 'flex';
        searchCount.textContent = count;
        searchBadge.style.display = 'flex';
    } else {
        pillBadge.style.display = 'none';
        searchBadge.style.display = 'none';
    }
}

function renderCarousel() {
    updateBadges(); // Mesajlar basılırken rozetleri de güncelle
    const nav = document.querySelector('.carousel-nav');
    carouselTrack.parentElement.style.display = 'block'; // Kabı göster
    nav.style.display = unreadMessages.length > 1 ? 'flex' : 'none'; // 1'den fazla mesaj varsa okları göster

    carouselTrack.innerHTML = '';
    if (unreadMessages.length === 0) {
        setIslandState('active-search');
        return;
    }

    unreadMessages.forEach(msg => {
        const card = document.createElement('div');
        card.className = 'message-card';
        card.innerHTML = `
            <span class="card-sender">${msg.from}</span>
            <span class="card-text">${msg.text}</span>
        `;
        carouselTrack.appendChild(card);
    });

    updateCarouselView();
}

function updateCarouselView() {
    const offset = currentCarouselIndex * (100 + 5.5); // 100% width + gap
    carouselTrack.style.transform = `translateX(-${offset}%)`;
    carouselInfo.textContent = `${currentCarouselIndex + 1} / ${unreadMessages.length}`;

    // Reply butonu her zaman o anki kişiye göre güncellenmeli
    const currentMsg = unreadMessages[currentCarouselIndex];
    buttonList.innerHTML = `
        <button class="action-btn reply-trigger-btn"><i data-lucide="message-square" class="btn-icon"></i><span>Cevapla</span></button>
        <button class="action-btn ignore-btn"><i data-lucide="check" class="btn-icon"></i><span>Okundu</span></button>
    `;
    lucide.createIcons();

    buttonList.querySelector('.reply-trigger-btn').onclick = () => openReplyMode(currentMsg.from);
    buttonList.querySelector('.ignore-btn').onclick = async () => {
        await fetch(`http://127.0.0.1:8000/unread/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ msg_index: currentCarouselIndex })
        });

        const response = await fetch('http://127.0.0.1:8000/unread');
        unreadMessages = await response.json();

        if (currentCarouselIndex >= unreadMessages.length) {
            currentCarouselIndex = Math.max(0, unreadMessages.length - 1);
        }
        renderCarousel();
    };
}

async function sendQuickReply() {
    const text = replyInput.value.trim();
    const contact = replyContact.textContent;
    const replyBody = document.querySelector('.reply-body');
    const replySuccess = document.getElementById('reply-success');

    if (text) {
        // AI'yı beklemeden direkt gönder!
        fetch('http://127.0.0.1:8000/send_direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: contact, message: text })
        });

        // Görsel Geri Bildirim Başlasın
        replyBody.style.display = 'none';
        replySuccess.style.display = 'flex';

        // 1 saniye bekle ve sonra aksiyon al
        setTimeout(async () => {
            // Backend'den bu mesajı sil (Arşivle)
            await fetch(`http://127.0.0.1:8000/unread/clear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msg_index: currentCarouselIndex })
            });

            // GÜNCEL LİSTEYİ BACKEND'DEN ÇEK
            const response = await fetch('http://127.0.0.1:8000/unread');
            unreadMessages = await response.json();

            // Görünümü sıfırla
            replyInput.value = '';
            replyBody.style.display = 'flex';
            replySuccess.style.display = 'none';

            if (unreadMessages.length > 0) {
                // Eğer hala mesaj varsa, index'i kontrol et ve karuseli göster
                if (currentCarouselIndex >= unreadMessages.length) {
                    currentCarouselIndex = Math.max(0, unreadMessages.length - 1);
                }
                setIslandState('expanded');
                renderCarousel();
            } else {
                // Mesajlar bitti, rozetleri temizle ve arama çubuğuna geri dön
                updateBadges();
                setIslandState('active-search');
            }
        }, 1000);
    }
}



prevMsgBtn.onclick = () => {
    if (currentCarouselIndex > 0) {
        currentCarouselIndex--;
        updateCarouselView();
    }
};

nextMsgBtn.onclick = () => {
    if (currentCarouselIndex < unreadMessages.length - 1) {
        currentCarouselIndex++;
        updateCarouselView();
    }
};

// Search Trigger
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();

        if (query === '/test') {
            searchInput.value = '';
            setIslandState('collapsed');
            setTimeout(() => {
                triggerNotification({ type: 'message', from: 'Hayrünnisa', text: 'Selam! Mesajını aldım, nasılsın?' });
            }, 500);
            return;
        }

        if (query === '/music' || query === '/müzik') {
            searchInput.value = '';
            setIslandState('music');
            return;
        }

        if (query === '/stress') {
            searchInput.value = '';
            setIslandState('collapsed');
            console.log("Stres testi başladı: 5 saniye içinde mesaj gelecek. Lütfen o sırada birine cevap vermeye başlayın!");
            setTimeout(() => {
                triggerNotification({ type: 'message', from: 'Sistem', text: 'Siz yazarken ben geldim, ama sizi bölmedim! 😊' });
            }, 5000);
            return;
        }
        if (query === '/unread') {
            searchInput.value = '';
            setIslandState('thinking'); // İşlem yapıldığını göster

            const testMsgs = [
                { from: 'Hayrünnisa', text: 'Selam, nasılsın?' },
                { from: 'Ali', text: 'Yarın buluşuyor muyuz?' },
                { from: 'Ayşe', text: 'Proje ne durumda?' }
            ];

            (async () => {
                try {
                    for (const m of testMsgs) {
                        await fetch('http://127.0.0.1:8000/unread/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(m)
                        });
                    }
                    // Backend'in dosyayı yazması için çok kısa bir bekleme
                    setTimeout(fetchUnread, 300);
                } catch (err) {
                    console.error("Test mesajları eklenemedi:", err);
                    setIslandState('collapsed');
                }
            })();
            return;
        }




        if (query && socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ query }));
            searchInput.value = '';
            setIslandState('thinking');
        }
    }
});

// Notification Handler
async function triggerNotification(event) {
    if (event.type === 'message') {
        // Backend'e ekle (Kalıcı olması için)
        await fetch('http://127.0.0.1:8000/unread/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: event.from, text: event.text })
        });

        // EĞER ŞU AN CEVAP YAZIYORSAK: Adayı bozma, sadece listeyi güncelle
        if (island.classList.contains('reply-mode')) {
            console.log("Cevap yazılırken yeni mesaj geldi, kuyruğa atıldı.");
            // unreadMessages listesini güncelle ama arayüzü değiştirme
            const response = await fetch('http://127.0.0.1:8000/unread');
            unreadMessages = await response.json();
            updateBadges(); // Kuyruğa atılsa bile sayıyı güncelle
            return;
        }

        // Değilse, normal bildirim akışını başlat
        unreadMessages.push({ from: event.from, text: event.text });
        updateBadges(); // Yeni mesaj geldiğinde sayıyı güncelle
        showUnreadPrompt(unreadMessages.length);
    }
}



// Mouse events
island.addEventListener('mouseenter', () => {
    window.electronAPI.setIgnoreMouseEvents(false);
});

island.addEventListener('mouseleave', () => {
    // Sadece ada kapalıyken fareyi yok say, açıkken tıklanabilir kalmalı!
    if (island.classList.contains('collapsed')) {
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
});

// Notification (Firebase) Handling
window.electronAPI.onFirebaseEvent((event) => {
    triggerNotification(event);
});

// Rozet tıklama mantığı (Arama çubuğundaki zil simgesi)
document.getElementById('unread-badge-search').onclick = (e) => {
    e.stopPropagation();
    if (unreadMessages.length > 0) {
        showUnreadPrompt(unreadMessages.length);
    }
};


// --- Auto Resize Observer ---
const resizeObserver = new ResizeObserver(() => {
    updateWindowSize();
});
resizeObserver.observe(island);

// --- Clock & Weather ---
function updateClock() {
    const clockEl = document.getElementById('idle-clock');
    if (!clockEl) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${hours}:${hours === mins ? mins : mins}`; // Sadece saati güncelle
    clockEl.textContent = `${hours}:${mins}`;
}

async function updateWeather() {
    const tempEl = document.getElementById('idle-temp');
    if (!tempEl) return;

    // Gerçek API yerine şimdilik simülasyon (Sonra OpenWeather eklenebilir)
    const mockTemps = ['22°C', '24°C', '21°C', '19°C'];
    const randomTemp = mockTemps[Math.floor(Math.random() * mockTemps.length)];
    tempEl.textContent = randomTemp;
}

// Her dakika saati güncelle
setInterval(updateClock, 1000);
// Her 30 dakikada havayı güncelle
setInterval(updateWeather, 1800000);
updateClock();
updateWeather();

// Initial sync
setTimeout(() => {
    setIslandState('collapsed');
    updateWindowSize();
    fetchUnread(); // Uygulama açıldığında hafızadaki mesajları getir
}, 100);

window.electronAPI.setIgnoreMouseEvents(false);

// --- Music Button Listeners ---
// Müzik panelindeki kontrol bölgesine yapılan tıklamaların yukarı (adaya) gitmesini engelle
// --- Music Interaction (Event Delegation) ---
const musicView = document.querySelector('.music-view');
if (musicView) {
    musicView.addEventListener('click', (e) => {
        e.stopPropagation(); // Adayı tetiklemesini her durumda engelle

        // Tıklanan elementi veya en yakın üst butonunu bul
        const target = e.target.closest('#music-play-pause, #music-next, #music-prev, .album-art-container, .music-info');
        if (!target) return;

        const id = target.id;

        // 1. Navigasyon: Albüm kapağı veya info ise aramaya dön
        if (target.classList.contains('album-art-container') || target.classList.contains('music-info')) {
            console.log("Nav: Back to search");
            setIslandState('active-search');
            return;
        }

        // 2. Medya Komutları
        let command = null;
        if (id === 'music-play-pause') command = 'play_pause';
        else if (id === 'music-next') command = 'next';
        else if (id === 'music-prev') command = 'prev';

        if (command) {
            console.log(`Media Action: ${command}`);
            fetch('http://127.0.0.1:8000/media/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: command })
            }).catch(err => console.error("Fetch Error:", err));
        }
    });
}

// İdle (hap) modundaki müzik ikonuna tıklama
const idleMusic = document.querySelector('.idle-info-music');
if (idleMusic) {
    idleMusic.onclick = (e) => {
        e.stopPropagation();
        setIslandState('music');
    };
}


