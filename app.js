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
    // เรื่องที่ทักตามเวลา มี dueKey ติดข้อความ → ถ้าหลังบ้าน (worker.js) ส่ง Push ไปแล้ว แอปจะไม่ทักซ้ำ
    const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const alreadySent = key => chat.messages.some(m => m.dueKey === key);
    const tagDue = (key, since) => {
        const msg = chat.messages.find(m => m.type === 'received' && m.timestamp >= since);
        if (!msg) return;
        msg.dueKey = key;
        chat.saveHistory();
    };

    reminders.onDue = (r) => {
        if (alreadySent(`rm:${r.id}`)) return;
        // ถึงเวลานัด → โมโทรมา แล้วรอดูว่ามาตามนัดไหม
        if (r.kind === 'date') {
            chat.dateWaiting = { at: Date.now(), text: r.text };
            chat.addMessage('received', reminders.dueMessage(r));
            tagDue(`rm:${r.id}`, Date.now() - 1000);
            if (!call.getCallStatus()) setTimeout(() => call.startIncomingCall(), 1500);
            return;
        }
        const msg = reminders.dueMessage(r);
        const since = Date.now();
        chat.addMessage('received', msg);
        tagDue(`rm:${r.id}`, since);
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
        const key = `rt:${r.id}:${localDate()}`;
        if (alreadySent(key)) return true;
        if (call.getCallStatus() || chat.isTyping) return false;
        mind.decide(`ถึงเวลาที่ตั้งใจไว้: ${r.intent}`);
        const since = Date.now();
        chat.sendProactiveMessage(
            `โมตั้งใจไว้เองว่าจะทักตอนนี้ เพราะจำได้ว่าเอง${r.what}ตอน ${r.time} — ${r.intent}`,
            `ทักเรื่องนี้ตรงๆ แบบคนที่จำกิจวัตรของอีกฝ่ายได้และใส่ใจจริง: ${r.intent} (อย่าเล่าเรื่องอื่นของโมแทรก)`)
            .then(() => tagDue(key, since));
        return true;
    };
    // เรื่องที่รอถามผล (สัมภาษณ์/สอบ/หาหมอ) → ทักถามเองเมื่อถึงเวลา
    routines.onFollowUp = (f) => {
        if (alreadySent(`fu:${f.id}`)) return true;
        if (!canReachOut() || chat.awaitingReply) return false;
        mind.decide(`ถึงเวลาถามเรื่อง${f.topic}`);
        const since = Date.now();
        chat.sendProactiveMessage(
            `โมจำได้ว่าเองมีเรื่อง "${f.topic}" แล้วตอนนี้น่าจะผ่านไปแล้ว — ${f.intent}`,
            `ทักถามผลเรื่อง${f.topic}ตรงๆ แบบคนที่จำได้และลุ้นอยู่ตลอด (${f.intent}) อย่าเล่าเรื่องอื่นของโมแทรก`)
            .then(() => tagDue(`fu:${f.id}`, since));
        return true;
    };

    // ตัวตนของโม: ความเห็น มุกของเรา รูปที่เคยเห็น สรุปรายสัปดาห์ วันแย่ของโม
    const self = new MoSelf();
    window.MoSelfInstance = self;
    chat.self = self;
    window.MoLLMInstance = llm;
    // โลกภายในของโม: คิดในใจก่อนตอบ, ทบทวนก่อนนอน, ตั้งใจพรุ่งนี้, เป้าหมายของตัวเอง
    const inner = new MoInner(llm);
    window.MoInnerInstance = inner;
    const reflectTick = () => inner.maybeReflect(chat.messages, memory.getUserName());
    setInterval(reflectTick, 10 * 60000);
    setTimeout(reflectTick, 45000);
    // โมห่วงเอง: สังเกตจากแชท แล้วถามไถ่ตามจังหวะ
    const care = new MoCare();
    window.MoCareInstance = care;
    chat.care = care;
    // คนรอบตัวโม & เรื่องราวที่ดำเนินต่อหลายวัน
    const social = new MoSocial(llm);
    window.MoSocialInstance = social;
    setInterval(() => social.tick(), 15 * 60000);
    setTimeout(() => social.tick(), 30000);
    // โทร: ใช้เสียงโมจริง (Gemini TTS) ถ้ามี key
    call.tts = text => llm.speak(text);
    // สตอรี่ของโม, เกม & คำถามประจำวัน
    const stories = new MoStories(llm);
    window.MoStoriesInstance = stories;
    const games = new MoGames();
    chat.games = games;
    // "สถานะหลังบ้านเป็นไง" → โมไล่เช็คระบบตัวเอง
    chat.statusContext = () => ({ llm, sync: window.MoSyncInstance, memory, routines, reminders, self });

    // ไดอารี่ของโม
    const diary = new MoDiary(memory, brain, llm);
    window.MoDiaryInstance = diary;
    // เขียนไดอารี่วันที่ค้างตั้งแต่เปิดแอป (ไม่ต้องรอเปิดหน้าความจำ) ให้โมจำเมื่อวานได้
    setTimeout(() => diary.update(chat.messages.filter(m => new Date(m.timestamp).toDateString() !== new Date().toDateString())), 8000);

    // ตอนโทร: ใช้สมองเดียวกับแชท และจำสิ่งที่พูดด้วย
    call.setResponder(async (text) => {
        memory.extractFacts(text);
        // โทรด่วน: บอกโมว่านี่เป็นเรื่องด่วน (จนกว่าจะวางสาย)
        const note = call.urgentNote ? `[ข้อความระบบ: นี่คือสายด่วน${call.urgentNote}— โมจริงจัง ตั้งใจฟัง ถามว่าเกิดอะไรขึ้น ช่วยคิด ไม่เล่นมุก]\n` : '';
        return brain.generateResponse(note + text, memory, chat.messages, llm);
    });

    // ======= โทรหาโม: รับตามสถานการณ์จริง / โทรด่วน = รับแน่นอน =======
    call.canAnswer = ({ urgent }) => {
        if (!urgent) return life.answerCall();
        const { wasAsleep } = life.interruptUrgent();
        mind.decide(wasAsleep ? 'สะดุ้งตื่นเพราะเองโทรมาด่วน' : 'ทิ้งทุกอย่างมารับสายด่วน');
        updateLifeStatus();
        return {
            answer: true,
            delay: wasAsleep ? 9000 : 4000,
            greeting: wasAsleep ? 'ฮัลโหล... เค้าตื่นแล้วๆ มีไรด่วน เป็นไรรึเปล่า' : 'ฮัลโหล! มีไรด่วน เกิดอะไรขึ้น',
        };
    };
    // ไม่รับสาย → พอโมเห็นมือถือ จะโทรกลับ/ทักกลับเอง
    call.onMissed = () => {
        chat.addSystemMessage('📵 โมไม่รับสาย — ถ้ามีเรื่องด่วน กด 🚨 ที่บ้านโม');
        chat.missedCallAt = Date.now();
    };

    // Make reels accessible globally for chat
    window.MoReels = reels;
    // ดูคลิปที่โมส่งจบ → โมถามว่าเป็นไง (โมรู้เนื้อหาคลิปจริงผ่าน Gemini)
    reels.onClose = (seconds) => {
        document.getElementById('watch-comments').innerHTML = '';
        chat.reelWatched(seconds);
    };
    // เปิดคลิปไหนก็ได้ → โมดูด้วยกันแล้วคอมเมนต์สด
    reels.onPlay = (clip) => chat.watchTogether(clip);

    // ======= สตอรี่: วงแหวนรอบรูปโม + แตะเพื่อดู =======
    const avatarEl = document.getElementById('mo-avatar');
    const renderStoryRing = () => avatarEl.classList.toggle('has-story', stories.hasUnseen());
    stories.onChange = renderStoryRing;
    renderStoryRing();
    avatarEl.addEventListener('click', () => {
        if (!stories.open((story, text) => chat.replyToStory(story, text))) chat.showNotification('โมยังไม่ได้ลงสตอรี่วันนี้');
    });
    setInterval(() => stories.maybePost(), 10 * 60000);
    setTimeout(() => stories.maybePost(), 20000);

    // ======= เกม =======
    const gamesMenu = document.getElementById('games-menu');
    gamesMenu.innerHTML = Object.entries(MO_GAMES).map(([id, g]) => `<button data-game="${id}">${g.emoji} ${g.name}</button>`).join('');
    document.getElementById('btn-games').addEventListener('click', (e) => {
        e.stopPropagation();
        gamesMenu.classList.toggle('hidden');
    });
    gamesMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-game]');
        if (!btn) return;
        gamesMenu.classList.add('hidden');
        chat.startGame(btn.dataset.game);
    });
    document.addEventListener('click', (e) => { if (!gamesMenu.contains(e.target)) gamesMenu.classList.add('hidden'); });

    // ======= ข้อความเสียง: กดไมค์ = อัด, กดอีกที = ส่ง =======
    const micBtn = document.getElementById('btn-mic');
    let micTimer = null;
    const stopMic = async () => {
        clearInterval(micTimer);
        micBtn.classList.remove('recording');
        chat.input.placeholder = 'พิมพ์ข้อความ...';
        const rec = await MoVoice.stop();
        if (rec) chat.sendUserVoice(rec.blob, rec.duration);
        else chat.showNotification('สั้นไปนิด กดค้างพูดให้นานกว่านี้หน่อย');
    };
    MoVoice.onAutoStop = stopMic;
    if (!MoVoice.supported()) micBtn.classList.add('hidden');
    micBtn.addEventListener('click', async () => {
        if (MoVoice.recorder) return stopMic();
        try {
            await MoVoice.start();
        } catch (e) {
            return chat.showNotification('เปิดไมค์ไม่ได้ ลองอนุญาตไมโครโฟนก่อนนะ');
        }
        micBtn.classList.add('recording');
        const t0 = Date.now();
        micTimer = setInterval(() => {
            chat.input.placeholder = `🔴 กำลังอัด ${Math.round((Date.now() - t0) / 1000)} วิ — กดไมค์อีกทีเพื่อส่ง`;
        }, 250);
    });

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
        // เพิ่งเห็นสายที่ไม่ได้รับ → ทักกลับ
        if (chat.missedCallAt && life.canSeePhone() && !call.getCallStatus() && !chat.isTyping) {
            const mins = Math.round((Date.now() - chat.missedCallAt) / 60000);
            chat.missedCallAt = null;
            chat.sendProactiveMessage(`โมเพิ่งเห็นว่าเองโทรมาเมื่อ ${mins} นาทีที่แล้วแต่ไม่ได้รับ เพราะตอนนั้น${prev ? prev.label : 'ไม่ได้ถือมือถือ'}`,
                'ทักกลับแบบรู้สึกผิดนิดๆ ที่ไม่ได้รับ บอกสั้นๆ ว่าตอนนั้นทำอะไรอยู่ แล้วถามว่ามีอะไรรึเปล่า');
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
        // ผิดนัด: ถึงเวลานัดแล้ว 20 นาทีเองยังไม่มา → โมงอน
        if (chat.dateWaiting && Date.now() - chat.dateWaiting.at > 20 * 60000) {
            const d = chat.dateWaiting;
            chat.dateWaiting = null;
            if (self.data) {
                self.data.grudge = { level: 2, reason: `เองผิดนัด${d.text}`, since: Date.now() };
                self.save();
            }
            mind.decide(`เองผิดนัด${d.text} → งอน`);
            chat.sendProactiveMessage(`เองผิดนัด${d.text}ที่นัดกันไว้ โมรอแล้วเองไม่มา`, 'บ่นแบบงอนจริงๆ ว่ารอแล้วไม่มา น้อยใจ แต่ยังห่วงว่าเป็นอะไรรึเปล่า สั้นๆ 2 บรรทัด');
            return;
        }
        // ทักไปแล้วเองเปิดแอปอยู่แต่ไม่ตอบ → ทักตามสั้นๆ ครั้งเดียว (แบบคนจริง)
        if (chat.awaitingReply && chat.awaitingSince && !chat.nudged && canReachOut()
            && Date.now() - chat.awaitingSince > (6 + Math.random() * 6) * 60000) {
            chat.nudged = true;
            const nudges = ['??', 'เองงง', 'อ่านแล้วไม่ตอบ 🙄', 'หลับไปแล้วเหรอ', 'ฮัลโหลลล', 'เมินเค้าอ่อ'];
            chat.showTyping();
            setTimeout(() => {
                chat.hideTyping();
                chat.addMessage('received', nudges[Math.floor(Math.random() * nudges.length)]);
            }, 1200);
            return;
        }
        if (!canReachOut() || chat.awaitingReply) return;
        // สิ่งที่โมตั้งใจไว้เองเมื่อคืน → ลงมือทำวันนี้
        const intent = inner.takeIntention();
        if (intent) {
            mind.decide(`ทำตามที่ตั้งใจไว้: ${intent.text}`);
            chat.sendProactiveMessage(`เมื่อคืนก่อนนอนโมตั้งใจไว้เองว่าวันนี้จะ: ${intent.text}`,
                `ทำตามที่ตั้งใจไว้จริง (${intent.text}) แบบเป็นธรรมชาติ เหมือนคนที่คิดมาแล้วตั้งแต่เมื่อคืน ไม่ต้องบอกว่า "ตั้งใจไว้"`);
            return;
        }
        // ห่วงเอง (กินข้าวยัง หายป่วยยัง ฝนตก ถึงบ้านยัง) → ทักถามก่อน
        const worry = care.takeProactive();
        if (worry) {
            mind.decide(worry.reason);
            chat.sendProactiveMessage(worry.reason, worry.style);
            return;
        }
        // เรื่องของคนรอบตัวเพิ่งเกิดตอนใหม่ → โมอยากเล่า
        const fresh = social.takeFresh();
        if (fresh && Math.random() < 0.7) {
            mind.decide(`อยากเล่าเรื่อง${fresh.who}ให้เองฟัง`);
            chat.sendProactiveMessage(`มีเรื่องของ${fresh.who}เพิ่งเกิดขึ้น: ${fresh.beat}`,
                `เล่าเรื่อง${fresh.who}ที่เพิ่งเกิดให้เองฟังแบบเม้าท์ เหมือนเพื่อนสนิทเล่าเรื่องในชีวิต (${fresh.beat}) มีความรู้สึกของโมด้วย แล้วถามความเห็นเอง`);
            return;
        }
        // คิดถึงมาก → ทักเร็วขึ้น, ง่วง/เครียด → ช้าลง
        if (Date.now() - lastActivity() < nextGapMs * mind.behavior().proactiveGapFactor) return;
        mind.decide(`เงียบกันไปนาน + อารมณ์${mind.emotion().label} → ทักไปก่อน`);
        nextGapMs = randomGap();

        // วันเทศกาล: ทักวันละครั้ง
        const fest = MoFestivals.takeGreeting('mo_festival_greeted_v1');
        if (fest) {
            chat.sendProactiveMessage(`วันนี้เป็น${fest.name} ${fest.emoji}`,
                `ทักเรื่อง${fest.name}แบบตื่นเต้น อวยพร/ชวนทำกิจกรรมตามเทศกาล (${fest.idea}) เหมือนแฟนที่รอวันนี้อยู่`);
            return;
        }
        // บางทีกำลังฟังเพลงอยู่ → ส่งเพลงมาให้ฟัง
        if (life.state.current && life.state.current.id === 'music' && Math.random() < 0.5) {
            chat.sendProactiveMessage(`โมกำลัง${life.state.current.label} แล้วอยากแชร์เพลงที่ฟังอยู่ให้เอง`,
                'เล่าว่าฟังเพลงอะไรอยู่ ชอบท่อนไหน แล้วส่งเพลงนั้นด้วย [เพลง: ศิลปิน - ชื่อเพลง] (เพลงที่มีจริงเท่านั้น)');
            return;
        }
        // วันละครั้ง: คำถามประจำวัน
        const daily = games.takeDailyQuestion();
        if (daily) {
            chat.sendProactiveMessage('ถึงเวลาคำถามประจำวันที่โมชอบถาม',
                `ถามคำถามประจำวันนี้แบบโม อยากรู้จริง (เรียบเรียงใหม่ให้เป็นภาษาโม): "${daily}" แล้วบอกคำตอบของโมเองสั้นๆ ด้วย หรือบอกว่าจะเฉลยของโมหลังเองตอบ`);
            return;
        }

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
        if (has('mo_followups_v1')) routines.followUps = routines.loadFollowUps();
        if (has('mo_self_v1')) self.data = self.load();
        if (has('mo_profile_v1')) MoConfig.reloadProfile();
        if (has('mo_stories_v1')) { stories.data = stories.load(); renderStoryRing(); }
        if (has('mo_games_v1')) games.data = games.load();
        if (has('mo_social_v1')) social.data = social.load();
        if (has('mo_care_v1')) care.data = care.load();
        if (has('mo_inner_v1')) inner.data = inner.load();
        // คีย์ AI จากเครื่องอื่นในบัญชีเดียวกัน → มือถือไม่ต้องกรอกเอง
        if (has('mo_device_keys_v1')) {
            // เครื่องที่มีไฟล์คีย์: อย่าให้ของจากเครื่องอื่นทับ → ส่งของที่ครบกลับขึ้นไป
            MoConfig.shareKeys();
            window.MO_KEYS = { ...window.MO_KEYS, ...MoConfig.loadKeys() };
            if (!llm.config.apiKey && window.MO_KEYS.gemini) {
                llm.saveConfig({ enabled: true, provider: 'gemini', apiKey: window.MO_KEYS.gemini, model: 'gemini-3.8-flash' });
            }
        }
        if (has('mo_clips_v1')) {
            reels.reels = [...reels.reels.filter(r => r.from === 'mo'), ...reels.loadUserClips()];
            reels.renderReels();
        }
    };

    // เครื่องที่มี mo-keys.local.js → ส่งโปรไฟล์ขึ้นซิงก์ให้มือถือรู้ด้วย
    MoConfig.shareProfile();
    MoConfig.shareKeys();

    // เครื่องใหม่ (เช่นมือถือที่เปิดจากโฮส): กรอก Supabase เองครั้งแรก
    document.getElementById('sync-url').value = window.MO_KEYS.supabaseUrl || '';
    document.getElementById('sync-anon').value = window.MO_KEYS.supabaseAnonKey || '';
    document.getElementById('sync-server').open = !sync.client;
    document.getElementById('btn-sync-server').addEventListener('click', () => {
        const url = document.getElementById('sync-url').value.trim();
        const anon = document.getElementById('sync-anon').value.trim();
        if (!/^https:\/\/.+/.test(url) || !anon) return chat.showNotification('ใส่ URL (https://...) กับ key ให้ครบก่อนนะ');
        let secret = /^sb_secret_/.test(anon);
        try { secret = secret || /service_role/.test(atob(anon.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) {}
        if (secret) {
            return chat.showNotification('อันนี้ service_role key ห้ามใช้นะ ใช้ anon/publishable แทน');
        }
        MoConfig.saveKeys({ supabaseUrl: url, supabaseAnonKey: anon });
        location.reload();
    });

    // ======= แจ้งเตือนจากโม (Push) — ให้โมทักได้แม้ปิดแอป =======
    const pushBtn = document.getElementById('btn-push');
    const pushStatus = document.getElementById('push-status');
    const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    async function renderPush() {
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;   // แอป Android ใช้ FCM แทน
        if (!pushSupported) {
            pushBtn.disabled = true;
            pushStatus.textContent = 'เครื่องนี้ยังไม่รองรับ (iPhone ต้องติดตั้งลงหน้าจอโฮมก่อน)';
            return;
        }
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        pushBtn.textContent = sub ? '🔔 แจ้งเตือนเปิดอยู่ (กดเพื่อปิด)' : '🔔 เปิดแจ้งเตือนจากโม';
        pushStatus.textContent = Notification.permission === 'denied' ? 'ถูกบล็อกไว้ ไปเปิดในตั้งค่าของเบราว์เซอร์/มือถือ' : '';
    }
    const b64ToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
    async function subKey(sub) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint));
        return 'push_sub:' + [...new Uint8Array(hash)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    pushBtn.addEventListener('click', async () => {
        if (!sync.user) return chat.showNotification('เข้าสู่ระบบซิงก์ก่อนนะ');
        try {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (existing) {
                await sync.client.from('mo_state').delete().eq('user_id', sync.user.id).eq('key', await subKey(existing));
                await existing.unsubscribe();
                chat.showNotification('ปิดแจ้งเตือนแล้ว');
                return renderPush();
            }
            const { key } = await (await fetch('/api/push/key')).json();
            if (!key) return chat.showNotification('หลังบ้านยังไม่ได้ตั้งค่า VAPID key');
            if (await Notification.requestPermission() !== 'granted') return renderPush();
            const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
            const { error } = await sync.client.from('mo_state').upsert({
                user_id: sync.user.id,
                key: await subKey(sub),
                value: { endpoint: sub.endpoint, tz: new Date().getTimezoneOffset(), ua: navigator.userAgent.slice(0, 80) },
                updated_at: new Date().toISOString(),
            });
            if (error) throw new Error(error.message);
            chat.showNotification('🔔 เปิดแล้ว! ปิดแอปไปโมก็ทักได้');
        } catch (e) {
            chat.showNotification(`เปิดแจ้งเตือนไม่สำเร็จ: ${e.message}`);
        }
        renderPush();
    });

    // ======= แอป Android: ลงทะเบียนเครื่อง (FCM) ให้โมโทรเข้าเต็มจอได้ =======
    const moNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
        && window.Capacitor.Plugins && window.Capacitor.Plugins.MoNative;
    let nativeRegistered = false;
    async function registerNative() {
        if (!moNative || nativeRegistered || !sync.user) return;
        nativeRegistered = true;
        try {
            const res = await moNative.setup();
            const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(res.token));
            const { error } = await sync.client.from('mo_state').upsert({
                user_id: sync.user.id,
                key: 'fcm_token:' + [...new Uint8Array(hash)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(''),
                value: { token: res.token, tz: new Date().getTimezoneOffset(), ua: navigator.userAgent.slice(0, 80) },
                updated_at: new Date().toISOString(),
            });
            if (error) throw new Error(error.message);
            if (!res.fullScreen && confirm('ให้โมโทรเข้าเต็มจอตอนล็อกจอได้ ต้องเปิดสิทธิ์ "แสดงแบบเต็มหน้าจอ" ก่อน ไปเปิดเลยไหม?')) {
                moNative.openFullScreenSettings();
            }
        } catch (e) {
            nativeRegistered = false;
            console.warn('native push setup failed:', e.message);
        }
    }
    if (moNative) {
        pushBtn.disabled = true;
        pushStatus.textContent = 'แอป Android: แจ้งเตือน + สายเรียกเข้าเต็มจอ เปิดให้อัตโนมัติหลังเข้าสู่ระบบซิงก์';
        sync.onStatus(registerNative);
        registerNative();
    }

    const syncModal = document.getElementById('sync-modal');
    const syncStatus = document.getElementById('sync-status');
    const syncBtn = document.getElementById('btn-sync');

    function renderSync() {
        const loggedIn = Boolean(sync.user);
        document.getElementById('sync-login').classList.toggle('hidden', loggedIn || !sync.client);
        document.getElementById('sync-server').open = !sync.client;
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
        // ยังไม่มี Supabase (เช่นมือถือที่เปิดจากโฮส) → เปิดหน้าตั้งค่าเซิร์ฟเวอร์ให้กรอก
        renderSync();
        renderPush();
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
        const escM = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const aiFacts = memory.data.longTerm.aiFacts || [];
        const fixedFacts = [...summary.facts.filter(f => !aiFacts.includes(f)), ...(profile.topics || []).flatMap(t => t.facts)];
        const editable = (list, kind) => list.map((f, i) => `<div class="memory-item memory-edit">
                <span>💭 ${escM(f)}</span>
                <span class="memory-edit-actions"><button data-edit="${kind}:${i}" title="แก้">✏️</button><button data-del="${kind}:${i}" title="ลบ">&times;</button></span>
            </div>`).join('');
        if (aiFacts.length || fixedFacts.length) {
            factsEl.innerHTML = editable(aiFacts, 'fact') + fixedFacts.map(f => `<div class="memory-item">📌 ${escM(f)}</div>`).join('');
        } else {
            factsEl.innerHTML = '<div class="memory-item" style="opacity:0.5">ยังไม่มีข้อมูลระยะยาวที่บันทึกไว้</div>';
        }

        // ตัวตนของโม & มุกของเรา (แก้/ลบได้)
        const selfEl = document.getElementById('memory-self');
        selfEl.innerHTML = (editable(self.data.opinions, 'opinion') + editable(self.data.jokes, 'joke'))
            || '<div class="memory-item" style="opacity:0.5">ยังไม่มี คุยกันไปเรื่อยๆ เดี๋ยวโมจำเอง</div>';

        // แก้/ลบความจำ: fact = เรื่องของเอง, opinion/joke = ของโม
        const lists = {
            fact: () => memory.data.longTerm.aiFacts || (memory.data.longTerm.aiFacts = []),
            opinion: () => self.data.opinions,
            joke: () => self.data.jokes,
        };
        const saveList = kind => (kind === 'fact' ? memory.save() : self.save());
        [factsEl, selfEl].forEach(el => el.querySelectorAll('[data-edit],[data-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [kind, idx] = (btn.dataset.edit || btn.dataset.del).split(':');
                const list = lists[kind]();
                if (btn.dataset.del) {
                    if (!confirm(`ให้โมลืมเรื่องนี้?\n"${list[idx]}"`)) return;
                    list.splice(Number(idx), 1);
                } else {
                    const next = prompt('แก้ความจำนี้', list[idx]);
                    if (next === null || !next.trim()) return;
                    list[idx] = next.trim().slice(0, 120);
                }
                saveList(kind);
                updateMemoryDisplay();
            });
        }));

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
        const followUps = routines.followUps.map(f =>
            `<div class="memory-item" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div>💭 รอถามเรื่อง${esc(f.topic)} <span style="opacity:0.6; font-size:0.8rem;">• ${new Date(f.askAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
                <button class="close-btn" data-followup="${esc(f.id)}" title="ไม่ต้องถาม" style="width:24px; height:24px; font-size:1rem;">&times;</button>
            </div>`);
        const upcoming = reminders.getUpcoming().map(u =>
            `<div class="memory-item">${esc(u.title)} <span style="opacity:0.6; font-size:0.8rem;">• ${u.daysLeft === 0 ? 'วันนี้!' : `อีก ${u.daysLeft} วัน`}</span></div>`
        );
        remindersEl.innerHTML = [...pending, ...learned, ...followUps, ...upcoming].join('') ||
            '<div class="memory-item" style="opacity:0.5">ยังไม่มี ลองพิมพ์ "เตือนกินยาอีก 30 นาที" หรือบอกวันเกิดดูสิ</div>';
        remindersEl.querySelectorAll('[data-followup]').forEach(btn => {
            btn.addEventListener('click', () => {
                routines.removeFollowUp(btn.dataset.followup);
                updateMemoryDisplay();
            });
        });
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
        document.getElementById('llm-groq-key').value = (window.MO_KEYS && window.MO_KEYS.groq) || '';
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
            MoConfig.saveKeys({ gemini: llmApiKey.value.trim(), groq: document.getElementById('llm-groq-key').value.trim() });
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
    // กล้อง: มือถือเปิดกล้องถ่ายทันที (คอมจะเปิดหน้าต่างเลือกไฟล์แทน)
    const cameraInput = document.getElementById('camera-input');
    document.getElementById('btn-camera').addEventListener('click', () => cameraInput.click());
    cameraInput.addEventListener('change', () => {
        const file = cameraInput.files[0];
        cameraInput.value = '';
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
        const hour = new Date().getHours();
        const night = hour >= 19 || hour < 6;
        const asleep = c.id === 'sleep';
        const spot = MO_SPOTS[c.id];
        const sky = window.MoWeather && window.MoWeather.isRaining() ? '🌧️' : night ? '🌙' : '☀️';
        const leftMin = Math.max(1, Math.round((c.endsAt - Date.now()) / 60000));
        const leftText = asleep ? `น่าจะตื่นราว ${fmt(c.endsAt)}` : leftMin > 90 ? `อีกนานเลย` : `อีกประมาณ ${leftMin} นาที`;
        const bar = (label, value) => `<div class="house-bar"><span>${label}</span>
            <div class="house-bar-track"><div class="house-bar-fill" style="width:${value}%"></div></div><span>${value}</span></div>`;

        document.getElementById('house-content').innerHTML = `
            <div class="house-card house-now">
                <img src="mo_avatar.jpg" alt="โม">
                <div class="house-now-text">
                    <strong>${c.emoji} ${esc(c.label)}</strong>
                    <span>ตั้งแต่ ${fmt(c.startedAt)} • ${leftText}</span>
                    <span>มือถือ: ${phoneText}</span>
                </div>
            </div>
            <div class="house-card house-urgent">
                <div>
                    <strong>มีเรื่องด่วน?</strong>
                    <span>${life.canSeePhone() ? 'โมถือมือถืออยู่ โทรปกติก็รับ' : asleep ? 'โมหลับอยู่ โทรด่วนจะปลุกโมขึ้นมา' : 'โมไม่ได้ถือมือถือ โทรปกติอาจไม่รับ'}</span>
                </div>
                <button class="btn-primary" id="house-urgent">🚨 โทรด่วน</button>
            </div>
            <div class="house-card">
                <h3>แผนผังบ้าน ${night ? '🌙 กลางคืน' : '☀️ กลางวัน'}${window.MoWeather && window.MoWeather.describe() ? ` • ${esc(window.MoWeather.describe())}` : ''}</h3>
                ${MoHouseView.render(life, { night, spot, phoneRoom, rain: window.MoWeather && window.MoWeather.isRaining(), gifts: MoGifts.owned(life), festival: MoFestivals.upcoming() })}
            </div>
            <div class="house-card">
                <h3>🎁 ร้านของขวัญ <small>เงินเรา ฿${s.userWallet.toLocaleString()}</small></h3>
                <div class="gift-shop">${MO_GIFTS.map(gf => {
                    const has = (s.gifts || []).some(x => x.id === gf.id);
                    return `<button class="gift-item ${has ? 'owned' : ''}" data-gift="${gf.id}" ${has ? 'disabled' : ''}>
                        <span class="gift-emoji">${gf.emoji}</span><span>${esc(gf.name)}</span><small>${has ? 'โมมีแล้ว 💕' : `฿${gf.price}`}</small></button>`;
                }).join('')}</div>
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
        document.querySelectorAll('[data-gift]').forEach(btn => btn.addEventListener('click', () => {
            const gift = MO_GIFTS.find(g => g.id === btn.dataset.gift);
            if (!confirm(`ซื้อ${gift.name} ให้โม ฿${gift.price}?`)) return;
            const r = MoGifts.buy(life, gift.id);
            if (r.error) return chat.showNotification(r.error);
            mind.decide(`ได้${gift.name}จากเอง ดีใจมาก`);
            renderHouse();
            houseScreen.classList.add('hidden');
            chat.addSystemMessage(`🎁 ส่ง${gift.name}ให้โมแล้ว`);
            chat.queueReply(note => chat.moRespond(`${note}[ข้อความระบบ: เองเพิ่งซื้อ "${gift.name}" ${gift.emoji} ให้โม (฿${gift.price}) — ดีใจมาก ขอบคุณแบบอ้อนๆ บอกว่าจะเอาไป${gift.note}]`));
        }));
        document.getElementById('house-urgent').addEventListener('click', () => {
            const reason = prompt('เรื่องด่วนอะไร? (ไม่ใส่ก็ได้ โมจะถามเอง)', '');
            if (reason === null) return;
            call.urgentNote = reason.trim() ? ` เรื่อง: "${reason.trim().slice(0, 120)}" ` : ' ';
            houseScreen.classList.add('hidden');
            call.startOutgoingCall({ urgent: true });
        });
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


    // ======= ติดตั้งเป็นแอป: service worker (ต้องเปิดผ่าน https หรือ localhost) =======
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW register failed:', err.message));
    }

    // ======= แถบพิมพ์: ปุ่มเสริมอยู่ในถาด + / ไมค์โชว์เฉพาะตอนช่องพิมพ์ว่าง (แบบ LINE) =======
    const inputArea = document.querySelector('.input-area');
    const moreBtn = document.getElementById('btn-more');
    const setTray = open => {
        inputArea.classList.toggle('tray-open', open);
        moreBtn.setAttribute('aria-expanded', String(open));
    };
    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setTray(!inputArea.classList.contains('tray-open'));
    });
    document.getElementById('input-tray').addEventListener('click', () => setTray(false));
    document.addEventListener('click', (e) => { if (!inputArea.contains(e.target)) setTray(false); });
    const msgInput = document.getElementById('message-input');
    const syncHasText = () => inputArea.classList.toggle('has-text', msgInput.value.trim().length > 0);
    msgInput.addEventListener('input', syncHasText);
    document.getElementById('btn-send').addEventListener('click', () => setTimeout(syncHasText, 0));
    msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') setTimeout(syncHasText, 0); });

    // ======= เสียง & สั่น: เปิด/ปิดในหน้าตั้งค่า (ปิดแล้วจำไว้ในเครื่องนี้) =======
    const alertsToggle = document.getElementById('alerts-toggle');
    alertsToggle.checked = chat.alertsOn();
    alertsToggle.addEventListener('change', () => {
        try { localStorage.setItem('mo_alerts_v1', alertsToggle.checked ? 'on' : 'off'); } catch (e) {}
        if (alertsToggle.checked) chat.playTone('receive');
    });
    // ขอสิทธิ์แจ้งเตือนครั้งแรกที่แตะหน้าจอ (ย่อแอปไว้แล้วโมทักจะเด้ง) — มือถือบังคับต้องมาจากการแตะ
    document.addEventListener('pointerdown', function askOnce() {
        document.removeEventListener('pointerdown', askOnce);
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    });

    // ======= โมโทรมาจากแจ้งเตือน (Push แบบสายเรียกเข้า) =======
    const callFromPush = (answer) => {
        if (call.getCallStatus()) return;
        call.startIncomingCall();
        if (answer) setTimeout(() => call.acceptIncomingCall(), 600);
    };
    const callParam = new URLSearchParams(location.search).get('call');
    if (callParam) {
        history.replaceState(null, '', location.pathname);
        setTimeout(() => callFromPush(callParam === 'answer'), 3600);   // หลัง splash
    }
    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'mo-call') callFromPush(e.data.answer);
        });
    }
    // แอป Android (Capacitor): แตะแจ้งเตือนสายเข้าตอนแอปเปิดอยู่
    window.addEventListener('mo-native-call', (e) => callFromPush(e.detail && e.detail.answer));
})();
