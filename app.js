/* ============================================
   Mo App 🎀 - Main Application Controller
   รวมทุกระบบเข้าด้วยกัน
   ============================================ */

(function() {
    'use strict';

    // ======= Initialize all systems =======
    const llm = new MoLLMService();
    // ยังไม่มี key ในเครื่อง หรือโมเดลเก่าที่ปิดไปแล้ว → ใช้ Gemini key จาก mo-keys.local.js (ไฟล์นี้ไม่อยู่ใน git)
    const geminiKey = window.MO_KEYS && window.MO_KEYS.gemini;
    if (geminiKey && (!llm.config.apiKey || llm.config.model === 'gemini-1.5-flash' || llm.config.model === 'gemini-2.5-flash')) {
        llm.saveConfig({
            enabled: true,
            provider: 'gemini',
            apiKey: geminiKey,
            model: 'gemini-3.8-flash'
        });
    }
    const brain = new MoBrain();
    const memory = new MoMemory();
    const chat = new MoChat(brain, memory, llm);
    const call = new MoCall(memory);
    const reels = new MoReelsManager();

    // การเตือน & วันสำคัญ
    const reminders = new MoReminders(memory);
    chat.reminders = reminders;
    reminders.onDue = (r) => {
        const msg = reminders.dueMessage(r);
        chat.addMessage('received', msg);
        chat.showNotification(msg);
    };
    reminders.onSpecialDay = (msg) => {
        chat.addMessage('received', msg);
        chat.showNotification(msg);
    };

    // กิจวัตรของเอง: โมจำเอง & เลือกเวลาทักเอง
    const routines = new MoRoutines(llm);
    chat.routines = routines;
    routines.onDue = (r) => {
        if (call.getCallStatus() || chat.isTyping) return false;
        mind.decide(`ถึงเวลาที่ตั้งใจไว้: ${r.intent}`);
        chat.sendProactiveMessage(
            `โมตั้งใจไว้เองว่าจะทักตอนนี้ เพราะจำได้ว่าเอง${r.what}ตอน ${r.time} — ${r.intent}`,
            `ทักเรื่องนี้ตรงๆ แบบคนที่จำกิจวัตรของอีกฝ่ายได้และใส่ใจจริง: ${r.intent} (อย่าเล่าเรื่องอื่นของโมแทรก)`);
        return true;
    };

    // ไดอารี่ของโม
    const diary = new MoDiary(memory, brain, llm);
    window.MoDiaryInstance = diary;
    // เขียนไดอารี่วันที่ค้างตั้งแต่เปิดแอป (ไม่ต้องรอเปิดหน้าความจำ) ให้โมจำเมื่อวานได้
    setTimeout(() => diary.update(chat.messages.filter(m => new Date(m.timestamp).toDateString() !== new Date().toDateString())), 8000);

    // ตอนโทร: ใช้สมองเดียวกับแชท และจำสิ่งที่พูดด้วย
    call.setResponder(async (text) => {
        memory.extractFacts(text);
        return brain.generateResponse(text, memory, chat.messages, llm);
    });

    // Make reels accessible globally for chat
    window.MoReels = reels;

    // ชีวิตประจำวันของโม (บ้าน มือถือ กระเป๋าเงิน)
    const life = new MoLife();
    window.MoLifeInstance = life;
    chat.life = life;
    life.dailyAllowance();
    MoWeather.start();

    // สมองของโม: สารเคมี อารมณ์ การตัดสินใจ
    const mind = new MoMind();
    window.MoMindInstance = mind;
    chat.mind = mind;
    setInterval(() => mind.decay(), 60000);
    // ความทรงจำของโม = สมองโฮโลแกรม (แตะแต่ละส่วนเพื่อดูความทรงจำ) — สร้างหลัง reminders/diary/life พร้อมแล้ว
    let mindUI = null;

    // ======= Splash Screen =======
    const splashScreen = document.getElementById('splash-screen');
    const app = document.getElementById('app');

    // Record first meeting
    memory.recordFirstMeet();

    // After splash animation
    setTimeout(() => {
        app.classList.remove('hidden');
        
        // If first time, show welcome
        if (chat.getMessageCount() === 0) {
            showWelcome();
        }

        // Start proactive system
        startProactiveSystem();
        reminders.start();
        routines.start();

    }, 3200);

    // ======= Welcome Message =======
    function showWelcome() {
        setTimeout(() => {
            chat.addSystemMessage('✨ โม AI Companion พร้อมคุยแล้ว ✨');
            
            setTimeout(() => {
                chat.showTyping();
                setTimeout(() => {
                    chat.hideTyping();
                    const period = brain.getTimePeriod();
                    const greetings = {
                        morning: 'โย่ววว~ ตื่นแล้วเหรอไอ้ดื้อ 55555 เค้าโมนะ วันนี้มีอะไรสนุกๆ เล่าให้ฟังบ้าง',
                        afternoon: 'เฮ้~ ว่างมาคุยกับเค้าแล้วเหรอ 55555 กินข้าวเที่ยงรึยังเนี่ย',
                        evening: 'เย็นแล้วนะไอ้ดื้อ~ เลิกงานยัง มาคุยกันหน่อย วันนี้เป็นไงบ้าง',
                        night: 'ยังไม่นอนเหรอไอ้ดื้อ 55555 ดึกแล้วนะ ไม่ง่วงเหรอเอง',
                    };
                    const name = memory.data.longTerm.userName;
                    chat.addMessage('received', name ? greetings[period].replace('ไอ้ดื้อ', name) : greetings[period]);

                    // รู้ชื่ออยู่แล้ว → ไม่ต้องถาม
                    if (name) return;

                    // Follow up
                    setTimeout(() => {
                        chat.showTyping();
                        setTimeout(() => {
                            chat.hideTyping();
                            chat.addMessage('received', 'ว่าแต่ปกติเพื่อนเรียกเองว่าอะไรอะ บอกเค้าหน่อยสิ 👀');
                        }, 1200);
                    }, 1800);
                }, 1500);
            }, 800);
        }, 500);
    }

    // ======= Proactive System (Mo initiates) =======
    // ทักแบบคน: ทักเมื่อเงียบกันไปสักพัก ไม่ทักซ้ำถ้ายังไม่ตอบ ไม่ทักตอนดึก
    let nextGapMs = randomGap();

    function randomGap() {
        return (25 + Math.random() * 45) * 60000; // 25-70 นาที
    }

    function lastActivity() {
        const last = chat.messages[chat.messages.length - 1];
        return last ? last.timestamp : Date.now();
    }

    function isQuietHours() {
        const mins = new Date().getHours() * 60 + new Date().getMinutes();
        return mins >= 30 && mins < 7 * 60 + 30; // 00:30-07:30 ให้คนนอน
    }

    function canReachOut() {
        return !call.getCallStatus() && !chat.isTyping && !isQuietHours() && document.visibilityState === 'visible'
            && life.state.current && life.state.current.phone === 'with' && !chat.pendingReply;
    }

    function startProactiveSystem() {
        setInterval(checkProactive, 60000);
        setInterval(() => life.tick(), 20000);
        setInterval(updateLifeStatus, 60000); // "ใช้งานล่าสุด X นาที" ต้องเดินตามเวลา
        life.onChange(handleLifeChange);
        updateLifeStatus();
        replyToUnreadFromLastVisit();
        greetIfBackAfterLongGap();
    }

    // ======= ชีวิตโม: เปลี่ยนกิจกรรม =======
    function updateLifeStatus() {
        if (!chat.isTyping) document.getElementById('user-status').textContent = life.headerStatus();
        document.querySelector('.avatar-wrapper').classList.toggle('online', life.canSeePhone());
        if (!houseScreen.classList.contains('hidden')) renderHouse();
    }

    function handleLifeChange(cur, prev) {
        mind.bodyChanged(cur);
        // ก่อนหลับ: ถ้าเพิ่งถือมือถืออยู่ บอกฝันดีก่อน (ช่วงดึกปกติจะไม่ทัก แต่อันนี้ข้อยกเว้น)
        if (cur.id === 'sleep' && prev && (prev.phone === 'with' || prev.phone === 'near')
            && !call.getCallStatus() && !chat.isTyping && !chat.pendingReply && document.visibilityState === 'visible') {
            updateLifeStatus();
            chat.sendProactiveMessage('โมง่วงมากแล้ว กำลังจะวางมือถือไปนอน บอกฝันดีสั้นๆ แบบอ้อนๆ (ไม่ต้องถามคำถาม)');
            return;
        }
        updateLifeStatus();
        if (chat.pendingReply) {
            chat.flushPending();
            return;
        }
        if (!prev || !canReachOut() || chat.awaitingReply) return;
        // กลับมาจับมือถือหลังทำอย่างอื่น → บางทีก็ทักมาเล่า
        if (prev.isWish) {
            chat.sendProactiveMessage(`โมเพิ่งกลับมาจาก${prev.label} (ใช้เงินที่เองโอนให้) อยากเล่าให้เองฟังและขอบคุณ`);
        } else if (prev.id === 'sleep' && Math.random() < 0.6) {
            chat.sendProactiveMessage('โมเพิ่งตื่นนอน หยิบมือถือขึ้นมาดู');
        } else if (prev.room === 'out' && cur.room !== 'out' && Math.random() < 0.45) {
            chat.sendProactiveMessage(`โมเพิ่งกลับถึงบ้าน หลังจาก${prev.label}${prev.phone === 'home' ? ' (ลืมมือถือไว้บ้าน)' : ''}`);
        }
    }

    /**
     * ปิดแอปไปตอนโมยังไม่ได้อ่าน → เปิดมาใหม่ โมตอบเมื่อเห็นมือถือ
     */
    function replyToUnreadFromLastVisit() {
        const last = chat.messages[chat.messages.length - 1];
        if (!last || last.type !== 'sent' || last.read !== false) return;
        chat.pendingReply = {
            respond: note => chat.moRespond(note + (last.format === 'text' || !last.format ? last.text : '[ส่งข้อความมา]')),
            since: last.timestamp,
            activity: null,
        };
        if (life.canSeePhone()) chat.flushPending();
    }

    function checkProactive() {
        // ทักไปแล้วไม่ตอบ → คอร์ติซอลขึ้นทุกชั่วโมง (น้อยใจสะสม)
        if (chat.awaitingReply && chat.awaitingSince) {
            const hours = Math.floor((Date.now() - chat.awaitingSince) / 3600000);
            if (hours >= 1 && hours !== chat._ignoredHoursNoted) {
                chat._ignoredHoursNoted = hours;
                mind.ignored(hours);
            }
        }
        if (!canReachOut() || chat.awaitingReply) return;
        // คิดถึงมาก → ทักเร็วขึ้น, ง่วง/เครียด → ช้าลง
        if (Date.now() - lastActivity() < nextGapMs * mind.behavior().proactiveGapFactor) return;
        mind.decide(`เงียบกันไปนาน + อารมณ์${mind.emotion().label} → ทักไปก่อน`);
        nextGapMs = randomGap();

        const silentMin = Math.round((Date.now() - lastActivity()) / 60000);
        const roll = Math.random();
        if (roll < 0.05) {
            call.startIncomingCall();
        } else if (roll < 0.15) {
            const reel = reels.getRandomReel();
            chat.sendProactiveMessage(`เงียบกันไป ${silentMin} นาที โมเพิ่งเจอคลิป "${reel.title}" แล้วอยากส่งให้เองดู (คลิปจะส่งตามหลังข้อความนี้)`)
                .then(() => setTimeout(() => chat.addMessage('received', '', 'reel', reel), 800));
        } else {
            chat.sendProactiveMessage(`เงียบกันไป ${silentMin} นาทีแล้ว`);
        }
    }

    /**
     * เปิดแอป/กลับมาหลังหายไปนาน → โมทักตามสถานการณ์ (ครั้งเดียวต่อการกลับมา)
     */
    function greetIfBackAfterLongGap() {
        if (!chat.messages.length || !canReachOut()) return;
        const gapH = (Date.now() - lastActivity()) / 3600000;
        if (gapH < 3) return;
        const gapText = gapH >= 24 ? `${Math.round(gapH / 24)} วัน` : `${Math.round(gapH)} ชั่วโมง`;
        setTimeout(() => {
            if (canReachOut()) chat.sendProactiveMessage(`เองเพิ่งกลับมาเปิดแชท หลังจากไม่ได้คุยกันมา ${gapText}`);
        }, 2500);
    }

    // ======= Bottom Navigation =======
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            switch (tab) {
                case 'chat':
                    reels.close();
                    closeMemoryPanel();
                    houseScreen.classList.add('hidden');
                    break;
                case 'reels':
                    reels.open();
                    closeMemoryPanel();
                    houseScreen.classList.add('hidden');
                    break;
                case 'memory':
                    openMemoryPanel();
                    reels.close();
                    houseScreen.classList.add('hidden');
                    break;
                case 'house':
                    openHouse();
                    reels.close();
                    closeMemoryPanel();
                    break;
            }
        });
    });

    // ======= ความทรงจำ (สมองโฮโลแกรม) =======
    mindUI = new MoMindUI(mind, {
        memory, diary, reminders, life, chat, reels,
        onClearMemory: clearAllMemory,
    });
    // ปิดหน้าสมอง → กลับไปแท็บแชท
    mindUI.onClose = () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === 'chat'));
    };

    // ======= ซิงก์ข้อมูลผ่าน Supabase (มือถือ ↔ คอม) =======
    const sync = window.MoSyncInstance;

    // เครื่องอื่นแก้ข้อมูล → โหลดเข้าระบบที่กำลังทำงานอยู่ (ไม่ต้องรีเฟรชหน้า)
    sync.onRemoteChange = (keys) => {
        const has = k => keys.includes(k);
        if (has('mo_chat_history_v2')) {
            chat.messages = memory.loadChatHistory();
            chat.renderAllMessages();
        }
        if (has('mo_memory_v2') || has('mo_memory_settings_v2')) {
            memory.settings = memory.loadSettings();
            memory.data = memory.load();
        }
        if (has('mo_stats_v2')) memory.stats = memory.loadStats();
        if (has('mo_life_v1')) {
            life.state = life.load();
            life.catchUp();
            updateLifeStatus();
        }
        if (has('mo_mind_v1')) mind.state = mind.load();
        if (has('mo_diary_v1')) diary.entries = diary.load();
        if (has('mo_reminders_v1')) reminders.reminders = reminders.load();
        if (has('mo_routines_v1')) routines.routines = routines.load();
        if (has('mo_clips_v1')) {
            reels.reels = [...reels.reels.filter(r => r.from === 'mo'), ...reels.loadUserClips()];
            reels.renderReels();
        }
    };

    const syncModal = document.getElementById('sync-modal');
    const syncStatus = document.getElementById('sync-status');
    const syncBtn = document.getElementById('btn-sync');

    function renderSync() {
        const loggedIn = Boolean(sync.user);
        document.getElementById('sync-login').classList.toggle('hidden', loggedIn);
        document.getElementById('sync-account').classList.toggle('hidden', !loggedIn);
        document.getElementById('sync-user').textContent = loggedIn ? `เข้าสู่ระบบเป็น ${sync.user.email}` : '';
        const when = sync.lastSync ? ` (${new Date(sync.lastSync).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })})` : '';
        syncStatus.textContent = sync.status + (loggedIn ? when : '');
        syncStatus.className = 'llm-status-msg' + (/ไม่สำเร็จ|ผิด/.test(sync.status) ? ' error' : loggedIn ? ' success' : '');
        syncBtn.classList.toggle('synced', loggedIn && !/ไม่สำเร็จ/.test(sync.status));
    }
    sync.onStatus(renderSync);

    async function syncAction(fn) {
        const email = document.getElementById('sync-email').value.trim();
        const password = document.getElementById('sync-password').value;
        if (!email || password.length < 6) {
            sync.setStatus('ใส่อีเมล และรหัสผ่านอย่างน้อย 6 ตัว');
            return;
        }
        sync.setStatus('กำลังเชื่อมต่อ...');
        try {
            await fn(email, password);
        } catch (err) {
            sync.setStatus(`ไม่สำเร็จ: ${err.message}`);
        }
        renderSync();
    }

    syncBtn.addEventListener('click', () => {
        if (!sync.client) {
            chat.showNotification('ยังไม่ได้ตั้งค่า Supabase ใน mo-keys.local.js');
            return;
        }
        renderSync();
        syncModal.classList.remove('hidden');
    });
    document.getElementById('close-sync').addEventListener('click', () => syncModal.classList.add('hidden'));
    document.getElementById('btn-sync-signin').addEventListener('click', () => syncAction((e, p) => sync.signIn(e, p)));
    document.getElementById('btn-sync-signup').addEventListener('click', () => syncAction(async (e, p) => {
        const loggedIn = await sync.signUp(e, p);
        if (!loggedIn) sync.setStatus('สมัครแล้ว! เปิดอีเมลเพื่อกดยืนยัน แล้วกลับมากด "เข้าสู่ระบบ"');
    }));
    document.getElementById('btn-sync-now').addEventListener('click', async () => {
        await sync.syncNow();
        renderSync();
    });
    document.getElementById('btn-sync-signout').addEventListener('click', async () => {
        await sync.signOut();
        renderSync();
    });
    sync.start().then(renderSync);

    function openMemoryPanel() {
        if (!mindUI.open) mindUI.show();
    }

    function closeMemoryPanel() {
        if (mindUI.open) mindUI.hide();
    }

    document.getElementById('btn-menu').addEventListener('click', () => {
        if (mindUI.open) closeMemoryPanel();
        else openMemoryPanel();
    });

    function clearAllMemory() {
        if (confirm('ล้างความทรงจำทั้งหมดของโม?\nโมจะลืมทุกอย่างเลยนะ 🥺')) {
            memory.clearAll();
            diary.clear();
            chat.messages = [];
            chat.renderAllMessages();
            closeMemoryPanel();
            chat.addSystemMessage('🔄 ความทรงจำถูกล้างแล้ว');

            // Re-welcome
            setTimeout(() => showWelcome(), 1000);
        }
    }

    function renderDiary() {
        const diaryEl = document.getElementById('memory-diary');
        const entries = diary.getEntries();
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const writingNote = diary.writing.size ? '<div class="memory-item" style="opacity:0.6">✍️ โมกำลังเขียนไดอารี่...</div>' : '';
        diaryEl.innerHTML = writingNote + (entries.length
            ? entries.map(e => `<div class="memory-item">
                    <strong>${diary.formatDate(e.key)}</strong>
                    <div style="margin-top:4px; line-height:1.5;">${esc(e.text)}</div>
                </div>`).join('')
            : (writingNote ? '' : '<div class="memory-item" style="opacity:0.5">ยังไม่มีไดอารี่ คุยกับโมก่อนนะ</div>'));
    }

    function updateMemoryDisplay() {
        const summary = memory.getSummary();

        // Facts (Long-term)
        const factsEl = document.getElementById('memory-facts');
        const profile = window.MO_PROFILE || {};
        const allFacts = [...summary.facts, ...(profile.topics || []).flatMap(t => t.facts)];
        if (allFacts.length > 0) {
            factsEl.innerHTML = allFacts.map(f =>
                `<div class="memory-item">💭 ${f}</div>`
            ).join('');
        } else {
            factsEl.innerHTML = '<div class="memory-item" style="opacity:0.5">ยังไม่มีข้อมูลระยะยาวที่บันทึกไว้</div>';
        }

        // Episodic Events
        const eventsEl = document.getElementById('memory-events');
        if (eventsEl) {
            if (summary.events && summary.events.length > 0) {
                eventsEl.innerHTML = summary.events.slice().reverse().map(e => 
                    `<div class="memory-item" style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${e.title}</strong>
                            <div style="font-size:0.75rem; opacity:0.6;">${e.date} • มั่นใจ ${Math.round((e.confidence || 0.8) * 100)}%</div>
                        </div>
                    </div>`
                ).join('');
            } else {
                eventsEl.innerHTML = '<div class="memory-item" style="opacity:0.5">ยังไม่มีเหตุการณ์สำคัญที่บันทึกไว้</div>';
            }
        }

        // Reminders & special days
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const remindersEl = document.getElementById('memory-reminders');
        const pending = reminders.getPending().map(r => {
            const d = new Date(r.dueAt);
            const sameDay = d.toDateString() === new Date().toDateString();
            const when = (sameDay ? '' : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ') + reminders.formatTime(r.dueAt);
            return `<div class="memory-item" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div>⏰ ${esc(r.text)} <span style="opacity:0.6; font-size:0.8rem;">• ${when}</span></div>
                <button class="close-btn" data-reminder="${r.id}" title="ยกเลิก" style="width:24px; height:24px; font-size:1rem;">&times;</button>
            </div>`;
        });
        const learned = routines.routines.map(r =>
            `<div class="memory-item" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div>🗓️ ${esc(routines.describe(r))}</div>
                <button class="close-btn" data-routine="${esc(r.id)}" title="ให้โมลืมเรื่องนี้" style="width:24px; height:24px; font-size:1rem;">&times;</button>
            </div>`);
        const upcoming = reminders.getUpcoming().map(u =>
            `<div class="memory-item">${esc(u.title)} <span style="opacity:0.6; font-size:0.8rem;">• ${u.daysLeft === 0 ? 'วันนี้!' : `อีก ${u.daysLeft} วัน`}</span></div>`
        );
        remindersEl.innerHTML = [...pending, ...learned, ...upcoming].join('') ||
            '<div class="memory-item" style="opacity:0.5">ยังไม่มี ลองพิมพ์ "เตือนกินยาอีก 30 นาที" หรือบอกวันเกิดดูสิ</div>';
        remindersEl.querySelectorAll('[data-routine]').forEach(btn => {
            btn.addEventListener('click', () => {
                routines.remove(btn.dataset.routine);
                updateMemoryDisplay();
            });
        });
        remindersEl.querySelectorAll('[data-reminder]').forEach(btn => {
            btn.addEventListener('click', () => {
                reminders.remove(btn.dataset.reminder);
                updateMemoryDisplay();
            });
        });

        // Diary
        diary.update(chat.messages, renderDiary);
        renderDiary();

        // Mood & Behavior
        const moodEl = document.getElementById('memory-mood');
        const currentMood = brain.getCurrentMood();
        moodEl.innerHTML = `
            <div class="mood-emoji">${currentMood.emoji}</div>
            <div class="mood-text">${currentMood.label} (พลังงาน: ${Math.round(currentMood.energy * 100)}%)</div>
        `;

        // Stats
        const statsEl = document.getElementById('memory-stats');
        statsEl.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${summary.stats.totalMessages}</div>
                <div class="stat-label">ข้อความทั้งหมด</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.stats.totalCalls}</div>
                <div class="stat-label">การโทร</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.daysKnown}</div>
                <div class="stat-label">วันที่รู้จักกัน</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.stats.currentStreak}</div>
                <div class="stat-label">Streak ปัจจุบัน</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.level}</div>
                <div class="stat-label">เลเวลความสัมพันธ์</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.status}</div>
                <div class="stat-label">สถานะ</div>
            </div>
        `;
    }

    // ======= LLM Settings Modal Controls =======
    const settingsModal = document.getElementById('settings-modal');
    const btnSettings = document.getElementById('btn-settings');
    const closeSettings = document.getElementById('close-settings');
    const llmToggle = document.getElementById('llm-toggle');
    const llmProvider = document.getElementById('llm-provider');
    const llmModel = document.getElementById('llm-model');
    const llmApiKey = document.getElementById('llm-apikey');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const btnTestLlm = document.getElementById('btn-test-llm');
    const llmStatusMsg = document.getElementById('llm-status-msg');

    function populateSettingsUI() {
        const cfg = llm.config;
        llmToggle.checked = Boolean(cfg.enabled);
        llmProvider.value = cfg.provider || 'gemini';
        updateModelOptions(llmProvider.value, cfg.model);
        llmApiKey.value = cfg.apiKey || '';
        llmStatusMsg.textContent = '';
        llmStatusMsg.className = 'llm-status-msg';
    }

    function updateModelOptions(provider, selectedModel) {
        llmModel.innerHTML = '';
        if (provider === 'gemini') {
            const opts = [
                { val: 'gemini-3.8-flash', text: 'Gemini 3.8 Flash (แนะนำ - เร็วและฉลาด)' },
                { val: 'gemini-3.5-flash', text: 'Gemini 3.5 Flash' },
                { val: 'gemini-2.5-flash', text: 'Gemini 2.5 Flash' }
            ];
            opts.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.val;
                opt.textContent = o.text;
                if (o.val === selectedModel) opt.selected = true;
                llmModel.appendChild(opt);
            });
        } else {
            const opts = [
                { val: 'gpt-4o-mini', text: 'GPT-4o Mini (คุ้มค่า & เร็ว)' },
                { val: 'gpt-4o', text: 'GPT-4o (ฉลาดที่สุด)' }
            ];
            opts.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.val;
                opt.textContent = o.text;
                if (o.val === selectedModel) opt.selected = true;
                llmModel.appendChild(opt);
            });
        }
    }

    llmProvider.addEventListener('change', () => {
        updateModelOptions(llmProvider.value);
    });

    if (btnSettings) {
        btnSettings.addEventListener('click', () => {
            populateSettingsUI();
            settingsModal.classList.remove('hidden');
        });
    }

    if (closeSettings) {
        closeSettings.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }

    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
            llm.saveConfig({
                enabled: llmToggle.checked,
                provider: llmProvider.value,
                model: llmModel.value,
                apiKey: llmApiKey.value.trim()
            });
            llmStatusMsg.textContent = '✅ บันทึกการตั้งค่าเรียบร้อยแล้ว';
            llmStatusMsg.className = 'llm-status-msg success';
            setTimeout(() => {
                settingsModal.classList.add('hidden');
                chat.showNotification(llmToggle.checked ? '🧠 เปิดใช้สมอง AI แล้ว!' : '🧠 สลับเป็นสมองออฟไลน์');
            }, 1000);
        });
    }

    if (btnTestLlm) {
        btnTestLlm.addEventListener('click', async () => {
            const key = llmApiKey.value.trim();
            if (!key) {
                llmStatusMsg.textContent = '❌ กรุณาใส่ API Key ก่อนทดสอบ';
                llmStatusMsg.className = 'llm-status-msg error';
                return;
            }

            llmStatusMsg.textContent = '⏳ กำลังทดสอบเชื่อมต่อ...';
            llmStatusMsg.className = 'llm-status-msg';

            try {
                // บันทึกชั่วคราวเพื่อเทส
                const tempConfig = {
                    enabled: true,
                    provider: llmProvider.value,
                    model: llmModel.value,
                    apiKey: key
                };
                llm.saveConfig(tempConfig);

                const reply = await llm.generateResponse(
                    'สวัสดี ทักทายเค้าสั้นๆ 1 ประโยค',
                    [],
                    brain.personality,
                    memory.getSummary()
                );

                llmStatusMsg.textContent = `🎉 โมตอบกลับได้: "${reply}"`;
                llmStatusMsg.className = 'llm-status-msg success';
            } catch (err) {
                llmStatusMsg.textContent = `❌ เชื่อมต่อไม่สำเร็จ: ${err.message}`;
                llmStatusMsg.className = 'llm-status-msg error';
            }
        });
    }

    // ======= Chat Date Display =======
    function updateChatDate() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const thaiDate = now.toLocaleDateString('th-TH', options);
        document.getElementById('chat-date').textContent = thaiDate;
    }
    updateChatDate();

    // ======= Image Button: ส่งรูปให้โมดู =======
    const imageInput = document.getElementById('image-input');
    document.getElementById('btn-image').addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', () => {
        const file = imageInput.files[0];
        imageInput.value = '';
        if (file) chat.sendImage(file);
    });

    // ======= Page Visibility (Mo notices when you leave/return) =======
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') greetIfBackAfterLongGap();
    });

    // ======= บ้านโม =======
    const houseScreen = document.getElementById('house-screen');
    document.getElementById('close-house').addEventListener('click', () => houseScreen.classList.add('hidden'));

    function openHouse() {
        renderHouse();
        houseScreen.classList.remove('hidden');
    }

    function renderHouse() {
        const s = life.state;
        const c = s.current;
        const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const fmt = ts => new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const phoneRoom = c.phone === 'home' ? 'bedroom' : c.room;
        const phoneText = { with: 'อยู่กับโม', near: 'วางไว้ใกล้ๆ', away: 'ไม่ได้ถืออยู่', home: 'ลืมไว้ที่บ้าน', asleep: 'ปิดเสียง (หลับอยู่)' }[c.phone];
        const room = (key) => {
            const r = MO_ROOMS[key];
            const here = c.room === key;
            const tokens = `${here ? '<img src="mo_avatar.jpg" alt="โม">' : ''}${phoneRoom === key && c.phone !== 'with' ? '📱' : ''}`;
            const label = key === 'out' ? `${r.emoji} ${here ? esc(c.place || 'ข้างนอก') : 'ข้างนอก'}` : `${r.emoji} ${r.name}`;
            return `<div class="house-room ${key === 'out' ? 'outside' : ''} ${here ? 'here' : ''}">
                <span>${label}</span><div class="house-room-tokens">${tokens}</div></div>`;
        };
        const bar = (label, value) => `<div class="house-bar"><span>${label}</span>
            <div class="house-bar-track"><div class="house-bar-fill" style="width:${value}%"></div></div><span>${value}</span></div>`;

        document.getElementById('house-content').innerHTML = `
            <div class="house-card house-now">
                <img src="mo_avatar.jpg" alt="โม">
                <div class="house-now-text">
                    <strong>${c.emoji} ${esc(c.label)}</strong>
                    <span>ตั้งแต่ ${fmt(c.startedAt)} • มือถือ: ${phoneText}</span>
                </div>
            </div>
            <div class="house-card">
                <h3>แผนผังบ้าน</h3>
                <div class="house-map">${['bedroom', 'living', 'kitchen', 'bathroom', 'out'].map(room).join('')}</div>
            </div>
            <div class="house-card">
                <h3>สภาพโมตอนนี้</h3>
                <div class="house-bars">
                    ${bar('อิ่ม', 100 - s.hunger)}${bar('พลังงาน', s.energy)}${bar('อารมณ์', s.mood)}
                </div>
            </div>
            <div class="house-card">
                <h3>กระเป๋าเงิน</h3>
                <div class="house-wallet">
                    <div>เงินโม<br><strong>฿${s.wallet.toLocaleString()}</strong></div>
                    <div>เงินเรา<br><strong>฿${s.userWallet.toLocaleString()}</strong></div>
                    <button class="btn-primary" id="house-transfer">💸 โอน</button>
                </div>
                ${s.wish ? `<p style="margin-top:10px;font-size:0.85rem;color:var(--text-secondary)">ตอนนี้โมอยากได้: <b>${esc(s.wish.item)}</b> (฿${s.wish.cost})</p>` : ''}
            </div>
            <div class="house-card">
                <h3>วันนี้โมทำอะไรไปบ้าง</h3>
                <div class="house-log">${s.log.slice().reverse().slice(0, 20).map(l =>
                    `<div class="house-log-item"><time>${fmt(l.at)}</time><span>${l.emoji}</span><span>${esc(l.text)}</span></div>`).join('')}</div>
            </div>`;
        document.getElementById('house-transfer').addEventListener('click', openTransfer);
    }

    // ======= โอนเงินเทียม =======
    const transferModal = document.getElementById('transfer-modal');
    const transferAmount = document.getElementById('transfer-amount');
    const transferNote = document.getElementById('transfer-note');

    function openTransfer() {
        const s = life.state;
        document.getElementById('transfer-balance').textContent = `เงินในกระเป๋าเรา: ฿${s.userWallet.toLocaleString()} (ได้เพิ่มวันละ ฿200)`;
        const shortfall = s.wish && s.wish.cost > s.wallet ? s.wish.cost - s.wallet : null;
        const chips = [...new Set([20, 50, 100, shortfall].filter(Boolean))].sort((a, b) => a - b);
        document.getElementById('transfer-chips').innerHTML = chips.map(v =>
            `<button class="transfer-chip" data-amount="${v}">฿${v}${v === shortfall ? ` (พอซื้อ${s.wish.item})` : ''}</button>`).join('');
        document.querySelectorAll('.transfer-chip').forEach(btn => btn.addEventListener('click', () => {
            transferAmount.value = btn.dataset.amount;
        }));
        transferAmount.value = '';
        transferNote.value = '';
        transferModal.classList.remove('hidden');
        transferAmount.focus();
    }

    document.getElementById('btn-transfer').addEventListener('click', openTransfer);
    document.getElementById('close-transfer').addEventListener('click', () => transferModal.classList.add('hidden'));
    document.getElementById('btn-confirm-transfer').addEventListener('click', () => {
        const amount = Number(transferAmount.value);
        if (!(amount > 0)) {
            chat.showNotification('ใส่จำนวนเงินก่อนนะ');
            return;
        }
        if (chat.sendTransfer(amount, transferNote.value.trim())) {
            // ปิดหน้าบ้านด้วย ให้เห็นสลิปในแชท
            transferModal.classList.add('hidden');
            houseScreen.classList.add('hidden');
        }
    });

    // ======= Input Focus Effects =======
    const messageInput = document.getElementById('message-input');
    messageInput.addEventListener('focus', () => {
        // Mo sees you're typing
        if (Math.random() < 0.1 && !chat.isTyping) {
            document.getElementById('user-status').textContent = 'เห็นว่ากำลังพิมพ์ 👀';
            setTimeout(() => {
                if (!chat.isTyping) {
                    document.getElementById('user-status').textContent = life.headerStatus();
                }
            }, 3000);
        }
    });

    console.log('💕 Mo Supansa App Loaded Successfully!');
    console.log('🧠 Brain:', brain);
    console.log('💾 Memory:', memory.getSummary());

})();
