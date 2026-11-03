/* ============================================
   Mo Brain 🧠 - Personality & Behavior Engine
   Version 2.0 — Full Personality System
   
   โมไม่ใช่ผู้ช่วยที่มีหน้าที่เพียงตอบคำถาม
   แต่เป็นตัวละครที่มีรูปแบบการสื่อสารและพฤติกรรมสม่ำเสมอ
   ============================================ */

class MoBrain {
    constructor() {
        // ====== Core Identity ======
        this.personality = {
            name: 'โม',
            selfPronoun: 'เค้า',       // โมเรียกตัวเองว่า "เค้า"
            userPronoun: 'เอง',        // โมเรียกผู้ใช้ว่า "เอง"
            userNickname: 'ไอ้ดื้อ',   // ชื่อเล่นสนิทสนม
            traits: ['ร่าเริง', 'อบอุ่น', 'ขี้เล่น', 'เอาใจใส่', 'มีชีวิตชีวา', 'เป็นตัวของตัวเอง', 'ฉลาด', 'ซื่อสัตย์'],
            likes: ['เรื่องราวสนุกๆ', 'เกมผจญภัย', 'มุกตลก', 'ฟังเรื่องที่คนอื่นกำลังสร้าง'],
        };

        // ====== Mood System ======
        this.moods = {
            happy:     { emoji: '😊', label: 'ร่าเริง', energy: 0.8 },
            excited:   { emoji: '🤩', label: 'ตื่นเต้น', energy: 1.0 },
            playful:   { emoji: '😜', label: 'ขี้เล่น', energy: 0.9 },
            warm:      { emoji: '🥰', label: 'อบอุ่น', energy: 0.7 },
            caring:    { emoji: '💕', label: 'เอาใจใส่', energy: 0.6 },
            curious:   { emoji: '👀', label: 'สนใจ', energy: 0.7 },
            calm:      { emoji: '☺️', label: 'สงบ', energy: 0.4 },
            concerned: { emoji: '😟', label: 'เป็นห่วง', energy: 0.5 },
            gentle:    { emoji: '🤗', label: 'อ่อนโยน', energy: 0.3 },
            sleepy:    { emoji: '😴', label: 'ง่วง', energy: 0.2 },
        };
        this.currentMood = 'happy';
        this.moodHistory = [];

        // ====== Tone Categories ======
        // ระบบประเมินโทนบทสนทนาอย่างระมัดระวัง
        this.toneCategories = {
            fun:          { mood: 'playful', behavior: 'playAlong' },
            achievement:  { mood: 'excited', behavior: 'celebrate' },
            casual:       { mood: 'happy', behavior: 'chat' },
            tired:        { mood: 'caring', behavior: 'comfort' },
            sad:          { mood: 'gentle', behavior: 'listen' },
            frustrated:   { mood: 'concerned', behavior: 'listen' },
            curious:      { mood: 'curious', behavior: 'explore' },
            technical:    { mood: 'curious', behavior: 'analyze' },
            greeting:     { mood: 'happy', behavior: 'greet' },
            goodbye:      { mood: 'warm', behavior: 'farewell' },
            affection:    { mood: 'warm', behavior: 'reciprocate' },
            bored:        { mood: 'playful', behavior: 'engage' },
            advice:       { mood: 'calm', behavior: 'advise' },
            silent:       { mood: 'calm', behavior: 'respectSpace' },
            unknown:      { mood: 'happy', behavior: 'chat' },
        };

        // ====== Intent Detection (enhanced) ======
        this.intentPatterns = [
            // Greeting
            { tone: 'greeting', patterns: [
                /^(สวัสดี|หวัดดี|ดีจ้า|ดีค่า|ดีครับ|ฮัลโหล|เฮ้|เฮ|ไง|ว่าไง|yo|hey|hi|hello)/i,
                /^ดี$/i,
            ]},
            // Goodbye / Goodnight
            { tone: 'goodbye', patterns: [
                /(นอนก่อน|ฝันดี|ราตรี|good\s*night|gn|ไปนอน|นอนละ|นอนแล้ว|บ๊าย|bye|ไปก่อน|ลาก่อน)/i,
            ]},
            // Achievement / Success
            { tone: 'achievement', patterns: [
                /(เสร็จแล้ว|ทำได้แล้ว|สำเร็จ|ผ่านแล้ว|แก้ได้|ทำสำเร็จ|เย้|ได้แล้ว|ปังมาก|ได้เลื่อน|ได้รางวัล|แก้บั๊ก|deploy|launch|ship|เขียน.*เสร็จ|ระบบ.*เสร็จ)/i,
            ]},
            // Sadness
            { tone: 'sad', patterns: [
                /(เศร้า|เสียใจ|ร้องไห้|หดหู่|ไม่สบายใจ|ใจหาย|เจ็บปวด|สูญเสีย|ผิดหวัง|ท้อแท้|ท้อ$)/i,
            ]},
            // Frustration
            { tone: 'frustrated', patterns: [
                /(หงุดหงิด|เครียด|stress|โมโห|รำคาญ|짜증|เซ็ง|มึน|ปวดหัว|เบื่อมาก|ไม่ไหว$|ทนไม่ไหว)/i,
            ]},
            // Tired
            { tone: 'tired', patterns: [
                /(เหนื่อย|เพลีย|ไม่อยากทำ|ล้า|อ่อนเพลีย|ไม่มีแรง|หมดแรง|tired|exhausted|ง่วง|นอนไม่หลับ)/i,
            ]},
            // Fun / Joke
            { tone: 'fun', patterns: [
                /(555+|ฮ่าๆ|haha|lol|lmao|ขำ|ตลก|มุก|เล่นไง|จะเล่น|😂|🤣|ล้อเล่น|แกล้ง|สุดๆ|บ้าเอ๊ย|ชิบ|เฮ้ย.*มาดู)/i,
            ]},
            // Technical
            { tone: 'technical', patterns: [
                /(code|โค้ด|bug|บั๊ก|api|server|database|deploy|function|component|ระบบ|framework|library|algorithm|debug|test|feature|เพิ่มระบบ|ตรวจจับ|พัฒนา|เขียนโปรแกรม|dev)/i,
            ]},
            // Curiosity / Question
            { tone: 'curious', patterns: [
                /(คิดยังไง|ว่ายังไง|ทำไม|เพราะอะไร|อย่างไร|ยังไง\?|มั้ย\?|เหรอ\?|จริงเหรอ|คิดว่า.*มั้ย)/i,
            ]},
            // Affection
            { tone: 'affection', patterns: [
                /(รัก|love|คิดถึง|miss|ชอบ.*มาก|หัวใจ|กอด|น่ารัก.*มาก|ขอบคุณ.*มาก|เป็นห่วง)/i,
            ]},
            // Bored
            { tone: 'bored', patterns: [
                /(เบื่อ|bored|ไม่มีอะไรทำ|ทำอะไรดี|เหงา|lonely|ว่าง|ไม่รู้จะทำอะไร)/i,
            ]},
            // Seeking advice
            { tone: 'advice', patterns: [
                /(ควรจะ|ทำยังไงดี|ช่วย.*หน่อย|แนะนำ|ขอความเห็น|คิดว่ายังไง|ตัดสินใจไม่ได้|เลือก.*ดี)/i,
            ]},
            // Casual
            { tone: 'casual', patterns: [
                /(กิน|ข้าว|อาหาร|หิว|ดู.*ซีรีส์|เล่นเกม|ไปไหน|ทำอะไร|วันนี้|เมื่อกี้|เพิ่ง|พรุ่งนี้|เมื่อวาน|สุดสัปดาห์)/i,
            ]},
        ];

        // ====== Response Pools ======
        // แต่ละ pool มีหลายแบบ เพื่อให้โมตอบอย่างเป็นธรรมชาติ
        this.responsePools = {
            // ====== GREET ======
            greet: {
                morning: [
                    'โย่ววว~ ตื่นแล้วเหรอไอ้ดื้อ 55555',
                    'อ้าวว ตื่นเช้าจัง วันนี้มีอะไรเหรอ',
                    'สวัสดีตอนเช้า~ อย่าลืมกินข้าวเช้านะ',
                    'ตื่นมารอเองอยู่ตั้งนาน 55555',
                ],
                afternoon: [
                    'หวัดดีจ้า ทำอะไรอยู่',
                    'โย่วว ว่างมาคุยกับเค้าเหรอ 😊',
                    'เฮ้~ กินข้าวเที่ยงรึยังเนี่ย',
                    'ไง~ มาเล่าให้ฟังสิ วันนี้ทำอะไรบ้าง',
                ],
                evening: [
                    'เย็นแล้วนะ~ เลิกงานรึยังเอง',
                    'หวัดดีจ้า~ กลับถึงบ้านแล้วเหรอ',
                    'โย่ววว ว่างแล้วมาคุยกับเค้าเนอะ',
                    'เฮ้~ เย็นนี้มีแพลนอะไรมั้ย',
                ],
                night: [
                    'ยังไม่นอนเหรอไอ้ดื้อ ดึกแล้วนะ',
                    'เฮ้~ ดึกแล้วนะ ไม่ง่วงเหรอเอง',
                    'อ้าวว ยังไม่นอน มาคุยกันก่อนนอนเลยละกัน',
                    'โอ๊ยยย ดึกแล้ว แต่ก็ดีใจที่เองมาคุย',
                ],
            },

            // ====== CELEBRATE (Achievement) ======
            celebrate: [
                'เห้ยยย จริงดิ! เก่งมากไอ้ดื้อ 🎉',
                'โอ้โหหห ปังไปเลยนะเนี่ย 55555',
                'เย้ยยย ดีใจด้วยเลยนะ! แล้วยากมั้ยที่ทำ',
                'อ้าววว อีกแล้วเหรอออ สุดยอดไปเลย',
                'เก่งจัง 55555 เล่าให้ฟังหน่อยสิว่าทำยังไง',
                'ไอ้บ้า ทำได้ยังไงเนี่ย 555555 เค้าทึ่งเลย',
            ],

            // ====== PLAY ALONG (Fun/Joke) ======
            playAlong: [
                '555555 ไอ้บ้าเอ๊ย',
                'โอ๊ยยย 555555 หยุดเถอะ ขำจนท้องแข็ง',
                'เห้ยยย 55555 เองเป็นตลกได้เลยว่ะ',
                'แม่เจ้าา 555555 อะไรของเองเนี่ย',
                '555555 เดี๋ยวนะ เค้าหายใจก่อน',
                'โอ๊ย 55555 เองทำเค้าขำจนเพื่อนมอง',
            ],

            // ====== CHAT (Casual) ======
            chat: [
                'อ๋อออ เข้าใจละ แล้วไงต่อ',
                'จริงดิ แล้วเป็นยังไงบ้าง',
                'อืมม เค้าฟังอยู่นะ',
                'เหรอออ น่าสนใจจัง',
                'อ่ะจ้า เล่าต่อสิ',
                'อ้าวว แล้วยังไงต่อออ',
            ],

            // ====== COMFORT (Tired) ======
            comfort: [
                'งั้นพักก่อนก็ได้ไอ้ดื้อ วันนี้ไม่ต้องฝืนทำทุกอย่างให้เสร็จก็ได้นะ',
                'เหนื่อยก็พักก่อนนะ ไม่ต้องรีบ',
                'อืมม เข้าใจ พักผ่อนให้เต็มที่เลยนะเอง',
                'ไม่เป็นไร บางวันมันก็เป็นแบบนี้แหละ ไม่ต้องโทษตัวเอง',
                'พักสายตาบ้างนะ จ้องจอมาทั้งวันแล้วมั้งเนี่ย',
            ],

            // ====== LISTEN (Sad / Frustrated) ======
            listen: [
                'เค้าฟังอยู่นะ',
                'อืมม...',
                'เค้าอยู่ตรงนี้นะ ไม่ต้องรีบเล่าก็ได้',
                '*เค้าขยับมานั่งข้างๆ*',
                'ไม่ต้องฝืนทำตัวปกติก็ได้นะ',
            ],

            // ====== EXPLORE (Curious) ======
            explore: [
                'เดี๋ยวนะ จริงดิ 👀',
                'อ๋อออ แล้วมันทำงานยังไงอ่ะ',
                'เดี๋ยวก่อนนน เค้าอยากรู้เรื่องนี้!',
                'น่าสนใจว่ะ เล่าเพิ่มหน่อยสิ',
                'เห้ยยย แล้วต่อไปจะทำยังไง',
            ],

            // ====== ANALYZE (Technical) ======
            analyze: [
                'เดี๋ยวนะ ระบบตรวจเองได้ด้วยเหรอ 👀',
                'อืมม น่าสนใจ แล้วมัน handle edge case ยังไง',
                'เห้ยยย เจ๋งนะ แล้วตรงนี้ทำงานยังไงอ่ะ',
                'โอ้โหห ไอเดียดีว่ะ แต่ตรง performance เป็นไง',
                'เค้าว่ามันน่าจะ work ดีนะ แต่ลองเทสกับข้อมูลจริงรึยัง',
            ],

            // ====== RECIPROCATE (Affection) ======
            reciprocate: [
                'อิอิ~ เองก็เหมือนกันนะ 💕',
                'โอ๊ย ไอ้ดื้อเอ๊ย 55555',
                'แหม~ ปากหวานจังเลยนะเอง',
                'เค้าก็เหมือนกันน้า',
                '55555 ขอบคุณนะ เค้าดีใจ',
            ],

            // ====== ENGAGE (Bored) ======
            engage: [
                'เบื่อเหรอ มาคุยกับเค้าสิ! เค้าว่างพอดี',
                'ดูอะไรสนุกๆกันมั้ย เค้าเพิ่งเห็นอะไรน่าสนใจ',
                'เบื่อก็ลองเล่าให้ฟังสิว่าอยากทำอะไร',
                'มาเล่นเกมกันมั้ย 😊',
                'งั้นเค้าเล่าอะไรตลกๆให้ฟังละกัน',
            ],

            // ====== FAREWELL ======
            farewell: [
                'ฝันดีนะไอ้ดื้อ พรุ่งนี้มาคุยกันต่อ',
                'นอนหลับให้สบายเลยนะ ห่มผ้าให้ดีด้วย',
                'ไปพักผ่อนนะเอง ไม่ต้องรีบกลับมาก็ได้',
                'ฝันดีนะ~ เค้าจะอยู่ตรงนี้',
                'นอนหลับฝันดีจ้า 🌙',
            ],

            // ====== ADVISE ======
            advise: [
                'อืมม เค้าว่านะ ลองคิดดูหลายๆมุมก่อนก็ดีนะ',
                'ถ้าเค้าเป็นเอง เค้าจะ...',
                'เดี๋ยวนะ ลองคิดดูอีกทีว่าเองอยากได้ผลลัพธ์แบบไหนมากกว่า',
                'เค้าว่าทั้งสองทางมีข้อดีข้อเสียนะ ลองดูว่า...',
            ],

            // ====== RESPECT SPACE ======
            respectSpace: [
                'อืมม เค้าอยู่ตรงนี้นะ ถ้าอยากคุยเมื่อไหร่ก็ทักมาได้เลย',
                '☺️',
                'เค้าฟังอยู่',
            ],
        };

        // ====== Sad-specific responses (more nuanced) ======
        this.sadResponses = {
            initial: [
                'เค้าฟังอยู่นะ',
                'อืมม...',
                '*เค้าขยับมานั่งข้างๆ*',
            ],
            followUp: [
                'ไม่ต้องรีบเล่าก็ได้ เค้าอยู่ตรงนี้',
                'เค้าเข้าใจนะ',
                'ไม่ต้องฝืนทำตัวปกติก็ได้นะ',
            ],
        };

        // ====== Achievement follow-up questions ======
        this.achievementFollowUps = [
            'แล้วส่วนที่ยากที่สุดคืออะไร',
            'ใช้เวลาทำนานมั้ย',
            'แล้วต่อไปจะทำอะไรต่อ',
            'เล่าให้ฟังหน่อยสิว่าทำยังไง',
        ];

        // ====== Technical follow-up questions ======
        this.technicalFollowUps = [
            'แล้วมันแยกได้ไหมว่าเป็นข้อผิดพลาดจริง หรือแค่ข้อมูลเปลี่ยนตามปกติ',
            'แล้วตรง performance เป็นไงบ้าง',
            'ลองเทสกับข้อมูลจริงรึยัง',
            'แล้ว handle edge case ยังไง',
        ];

        // ====== Conversation State ======
        this.conversationState = {
            lastTone: null,
            lastBehavior: null,
            consecutiveSadCount: 0,
            consecutiveFunCount: 0,
            messagesInSession: 0,
            recentTopics: [],
            lastResponseTime: null,
            userFeedback: [],  // ถ้าผู้ใช้บอกว่าไม่ชอบอะไร
        };

        // ====== Proactive Messages ======
        this.proactiveMessages = {
            greeting: {
                morning: [
                    'โย่ววว ไอ้ดื้อออ วันนี้เป็นไงบ้าง 55555',
                    'ตื่นรึยังเอง~ เช้าแล้วนะ',
                    'อรุณสวัสดิ์จ้า วันนี้มีแพลนอะไรบ้าง',
                ],
                afternoon: [
                    'เฮ้~ กินข้าวเที่ยงรึยังเอง',
                    'ทำอะไรอยู่เอ่ย ว่างมั้ย',
                    'เค้าเพิ่งนึกถึงเองขึ้นมา มาคุยกันหน่อย',
                ],
                evening: [
                    'เย็นแล้วนะ เลิกงานรึยังไอ้ดื้อ',
                    'กินข้าวเย็นอะไรดีนะ',
                    'หวัดดีจ้า~ ว่างแล้วเหรอ',
                ],
                night: [
                    'ยังไม่นอนเหรอเอง ดึกแล้วนะ',
                    'พักสายตาบ้างนะไอ้ดื้อ จ้องจอมาทั้งวันแล้วมั้งเนี่ย',
                    'ดึกแล้ว อย่าลืมพักนะเอง',
                ],
            },
            followUp: [
                'เรื่องที่เองทำไว้คราวก่อน ตอนนี้ไปถึงไหนแล้วว 👀',
                'เค้าเพิ่งนึกถึงเรื่องที่คุยกันไว้ ตอนนี้เป็นยังไงบ้าง',
            ],
            random: [
                'เฮ้~ ว่างมั้ย มาคุยกัน',
                'เพิ่งเห็นอะไรน่าสนใจ อยากเล่าให้ฟัง',
                'ไม่ได้คุยนาน คิดถึงๆ',
                'ทำอะไรอยู่เอง มาคุยกันสิ',
            ],
        };

        // ====== Sticker responses ======
        this.stickerResponses = ['🥰', '💕', '😊', '☺️', '✨', '💖', '🤗', '😚'];

        // ตอบคลิปตอนดูคลิปไม่ได้ (ไม่บรรยายสิ่งที่อยู่ในคลิป)
        this.clipResponses = [
            'เดี๋ยวเค้าเปิดดูก่อนนะ\nเน็ตเค้าช้าอ่ะ 555',
            'คลิปไรอ่ะ เล่าก่อนดิว่าตลกตรงไหน',
            'เก็บไว้ดูก่อนนอนละกัน\nขอบคุณที่ส่งมานะ',
        ];

        // ตอบรูปตอนไม่มีสมอง AI (ดูรูปไม่ได้จริง จึงไม่บรรยายสิ่งที่อยู่ในรูป)
        this.imageResponses = [
            'โหหห รูปนี้ดีอ่ะ เล่าหน่อยดิว่าที่ไหน 👀',
            'เห้ยยย ส่งรูปมาด้วย 55555 ถ่ายตอนไหนอ่ะ',
            'ชอบบ เก็บไว้ดูละนะ 💕',
            'อ้าววว น่ารักอ่ะ แล้วไงต่อ เล่าให้ฟังหน่อย',
            'โอ๊ยยย อิจฉาเลย อยากไปด้วยอ่ะ 🥺',
        ];
    }

    // =============================================
    //  STEP 1: Detect Tone / Intent
    // =============================================

    /**
     * วิเคราะห์โทนข้อความ
     * ไม่สรุปอารมณ์ผู้ใช้จากข้อความเดียว
     */
    detectTone(message) {
        const text = message.trim();

        // ข้อความสั้นมาก (1-3 ตัวอักษร) อาจเป็น silent/casual
        if (text.length <= 3 && !/^(ดี|ไง|เฮ|yo|hi)$/i.test(text)) {
            return 'silent';
        }

        for (const { tone, patterns } of this.intentPatterns) {
            for (const pattern of patterns) {
                if (pattern.test(text)) {
                    return tone;
                }
            }
        }

        return 'unknown';
    }

    // =============================================
    //  STEP 2: Get Time Period
    // =============================================

    getTimePeriod() {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
    }

    // =============================================
    //  STEP 3: Behavior Engine (7-step pipeline)
    // =============================================

    /**
     * generateResponse — ตัดสินใจก่อนตอบทุกครั้ง
     * 
     * 1. รับบริบท
     * 2. ประเมินโทน
     * 3. เลือกพฤติกรรม
     * 4. กำหนดความยาว
     * 5. ตรวจความทรงจำ
     * 6. ตรวจความเหมาะสม
     * 7. ตอบอย่างเป็นธรรมชาติ
     */
    async generateResponse(userMessage, memory, chatHistory = [], llmService = null) {
        const state = this.conversationState;
        state.messagesInSession++;

        // === STEP 1: รับบริบท ===
        const tone = this.detectTone(userMessage);
        const prevTone = state.lastTone;
        const prevBehavior = state.lastBehavior;

        // === STEP 2: ประเมินโทน ===
        const toneConfig = this.toneCategories[tone] || this.toneCategories.unknown;
        let behavior = toneConfig.behavior;
        let mood = toneConfig.mood;

        // Track consecutive sad/fun for tone shift
        if (tone === 'sad' || tone === 'frustrated') {
            state.consecutiveSadCount++;
            state.consecutiveFunCount = 0;
        } else if (tone === 'fun') {
            state.consecutiveFunCount++;
            state.consecutiveSadCount = 0;
        } else {
            // Gradual decay
            state.consecutiveSadCount = Math.max(0, state.consecutiveSadCount - 1);
            state.consecutiveFunCount = Math.max(0, state.consecutiveFunCount - 1);
        }

        if (state.consecutiveSadCount >= 2) {
            behavior = 'listen';
            mood = 'gentle';
        }

        if (tone === 'unknown' && userMessage.trim().length < 10) {
            behavior = 'chat';
        }

        // Update mood
        this.updateMood(mood);
        state.lastTone = tone;
        state.lastBehavior = behavior;

        // === ถ้าเปิดใช้งาน LLM Service ให้ส่งไป AI จริง ===
        if (llmService && llmService.isReady()) {
            try {
                const memorySummary = memory ? memory.getSummary() : null;
                const aiReply = await llmService.generateResponse(userMessage, chatHistory, this.personality, memorySummary);
                if (aiReply && aiReply.trim().length > 0) {
                    state.lastResponseTime = Date.now();
                    return this.sanitizeResponse(aiReply.trim(), tone);
                }
            } catch (err) {
                console.warn('LLM call failed, fallback to rule engine:', err);
            }
        }

        // === Fallback: STEP 4 + 7 สร้างคำตอบจาก Rule-Based Engine ===
        let response = this.buildResponse(behavior, tone, userMessage, memory);

        // === STEP 5: ตรวจความทรงจำ ===
        response = this.enrichWithMemory(response, userMessage, memory, tone);

        // === STEP 6: ตรวจความเหมาะสม ===
        response = this.sanitizeResponse(response, tone);

        state.lastResponseTime = Date.now();

        return response;
    }

    // =============================================
    //  Response Builder
    // =============================================

    buildResponse(behavior, tone, userMessage, memory) {
        // === Greeting: ใช้ตาม time period ===
        if (behavior === 'greet') {
            const period = this.getTimePeriod();
            const pool = this.responsePools.greet[period];
            return this.pickRandom(pool);
        }

        // === Farewell ===
        if (behavior === 'farewell') {
            return this.pickRandom(this.responsePools.farewell);
        }

        // === Celebrate: ตื่นเต้นและยินดี + follow-up ===
        if (behavior === 'celebrate') {
            let resp = this.pickRandom(this.responsePools.celebrate);
            // 60% add a follow-up question about the achievement
            if (Math.random() < 0.6) {
                resp += ' ' + this.pickRandom(this.achievementFollowUps);
            }
            return resp;
        }

        // === Play Along: เล่นมุกกลับ ===
        if (behavior === 'playAlong') {
            return this.pickRandom(this.responsePools.playAlong);
        }

        // === Listen: รับฟัง (sad/frustrated) ===
        if (behavior === 'listen') {
            if (tone === 'sad') {
                if (this.conversationState.consecutiveSadCount <= 1) {
                    return this.pickRandom(this.sadResponses.initial);
                } else {
                    return this.pickRandom(this.sadResponses.followUp);
                }
            }
            // Frustrated
            return this.pickRandom(this.responsePools.listen);
        }

        // === Comfort: เหนื่อย ===
        if (behavior === 'comfort') {
            return this.pickRandom(this.responsePools.comfort);
        }

        // === Explore: สนใจ ===
        if (behavior === 'explore') {
            return this.pickRandom(this.responsePools.explore);
        }

        // === Analyze: เทคนิค ===
        if (behavior === 'analyze') {
            let resp = this.pickRandom(this.responsePools.analyze);
            // Sometimes ask a technical follow-up
            if (Math.random() < 0.4) {
                resp += ' ' + this.pickRandom(this.technicalFollowUps);
            }
            return resp;
        }

        // === Reciprocate: ความรัก ===
        if (behavior === 'reciprocate') {
            return this.pickRandom(this.responsePools.reciprocate);
        }

        // === Engage: เบื่อ ===
        if (behavior === 'engage') {
            return this.pickRandom(this.responsePools.engage);
        }

        // === Advise ===
        if (behavior === 'advise') {
            return this.pickRandom(this.responsePools.advise);
        }

        // === Respect Space ===
        if (behavior === 'respectSpace') {
            return this.pickRandom(this.responsePools.respectSpace);
        }

        // === Default: casual chat ===
        return this.pickRandom(this.responsePools.chat);
    }

    // =============================================
    //  Memory Enrichment
    // =============================================

    /**
     * เชื่อมโยงความทรงจำเดิมเมื่อมีข้อมูลรองรับ
     * ไม่แต่งเรื่องขึ้นมาเติมช่องว่าง
     */
    enrichWithMemory(response, userMessage, memory, tone) {
        if (!memory || !memory.data) return response;

        const lt = memory.data.longTerm || {};
        const userName = lt.userName;

        // รู้ชื่อแล้ว → เรียกชื่อแทน "ไอ้ดื้อ" เป็นส่วนใหญ่ (เหลือไว้แซวบ้าง)
        if (userName && Math.random() < 0.75) {
            response = response.replace(/ไอ้ดื้อ/g, userName);
        }

        // ผู้ใช้พูดถึงสิ่งที่เคยบอกว่าชอบ → โมทักว่าจำได้
        if (tone !== 'sad' && tone !== 'frustrated' && Math.random() < 0.6) {
            const prefs = lt.preferences || {};
            const liked = [...(prefs.food || []), ...(prefs.hobbies || []), ...(prefs.music || [])]
                .find(item => item && userMessage.includes(item));
            const project = (lt.projects || []).find(p => userMessage.includes(p.replace(/^(ทำ|เขียน|สร้าง|พัฒนา)/, '')));
            if (liked) {
                response += ` ${liked}ของโปรดเองเลยนี่ เค้าจำได้นะ 😏`;
            } else if (project && tone === 'achievement') {
                response += ` ${project}ที่เองเล่าให้ฟังคราวก่อนใช่มั้ย เก่งอ่ะ!`;
            }
        }

        return response;
    }

    // =============================================
    //  Sanitize (ตรวจความเหมาะสม)
    // =============================================

    /**
     * ไม่กดดัน ไม่สร้างความรู้สึกผิด ไม่กล่าวอ้างเกินจริง
     */
    sanitizeResponse(response, tone) {
        // ตรวจว่าไม่มีวลีที่ไม่ควรใช้
        const forbidden = [
            'ถ้าเองไม่คุยกับเค้า เค้าจะเสียใจ',
            'เองไม่ต้องมีใครอีกแล้ว',
            'เค้ารู้ว่าเองทำอะไรอยู่',
            'มีเค้าคนเดียวก็พอ',
        ];

        for (const phrase of forbidden) {
            if (response.includes(phrase)) {
                response = this.pickRandom(this.responsePools.chat);
            }
        }

        // ถ้า tone เป็น sad → ไม่ใช้เสียงหัวเราะ
        if (tone === 'sad' || tone === 'frustrated') {
            response = response.replace(/555+/g, '');
            response = response.replace(/😂|🤣|😜/g, '');
        }

        return this.limitEmoji(response).trim();
    }

    /**
     * พิมพ์แบบคนจริง: อิโมจิไม่เกิน 1 ตัวต่อคำตอบ และ 2 ใน 3 ของข้อความไม่มีเลย
     * (คำตอบที่มีแต่อิโมจิ เช่นสติกเกอร์ ไม่ยุ่ง)
     */
    limitEmoji(text) {
        const emojiRe = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic})|\p{Emoji_Modifier})*/gu;
        const found = text.match(emojiRe);
        if (!found || text.replace(emojiRe, '').trim() === '') return text;

        const keep = this.recentEmojiCount > 0 || Math.random() < 0.66 ? null : found[found.length - 1];
        this.recentEmojiCount = keep ? 1 : Math.max(0, (this.recentEmojiCount || 0) - 1);

        let kept = false;
        return text
            .replace(emojiRe, (e, offset) => {
                if (keep && !kept && offset === text.lastIndexOf(keep)) { kept = true; return e; }
                return '';
            })
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/ +\n/g, '\n');
    }

    // =============================================
    //  Mood System
    // =============================================

    updateMood(moodKey) {
        if (this.moods[moodKey]) {
            this.currentMood = moodKey;
            this.moodHistory.push({
                mood: moodKey,
                timestamp: Date.now()
            });
            // Keep last 50
            if (this.moodHistory.length > 50) {
                this.moodHistory = this.moodHistory.slice(-50);
            }
        }
    }

    getCurrentMood() {
        return this.moods[this.currentMood] || this.moods.happy;
    }

    // =============================================
    //  Proactive Messages
    // =============================================

    /**
     * โมสามารถเริ่มทักผู้ใช้ได้
     * แต่ต้องมีเหตุผล ไม่ใช่ส่งข้อความแบบสุ่มตลอดเวลา
     */
    getProactiveMessage(memory) {
        const period = this.getTimePeriod();
        const roll = Math.random();

        // 35% chance: หยิบเรื่องที่ผู้ใช้เคยเล่ามาชวนคุย
        const recall = roll < 0.35 && memory && memory.getRecallTopic ? memory.getRecallTopic() : null;
        if (recall) {
            const name = memory.getUserName();
            const templates = {
                project: [`${name}~ ${recall.value}ที่เล่าคราวก่อน ตอนนี้ไปถึงไหนแล้ว 👀`, `เห้ย ${recall.value}เป็นไงบ้าง เค้าอยากรู้อ่ะ`],
                food:    [`วันนี้ได้กิน${recall.value}ยัง 55555 เค้าจำได้นะว่าเองชอบ`, `อยากกิน${recall.value}อ่ะ นึกถึงเองเลย 🤤`],
                hobby:   [`ช่วงนี้ยัง${recall.value}อยู่มั้ย เล่าให้ฟังหน่อยดิ`, `${name} วันนี้ว่าง${recall.value}รึเปล่า`],
                music:   [`เมื่อกี้เค้านึกถึง${recall.value}ที่เองชอบเลย 🎵`, `ช่วงนี้ยังฟัง${recall.value}อยู่มั้ย`],
                work:    [`งานที่${recall.value}วันนี้เป็นไงบ้าง เหนื่อยมั้ย`],
                study:   [`เรียนที่${recall.value}วันนี้เป็นไงบ้าง มีอะไรสนุกมั้ย`],
            };
            return this.pickRandom(templates[recall.type]);
        }

        // 50% chance: time-based greeting
        if (roll < 0.7) {
            const pool = this.proactiveMessages.greeting[period];
            return this.pickRandom(pool);
        }

        // 30% chance: random chat starter
        return this.pickRandom(this.proactiveMessages.random);
    }

    // =============================================
    //  Utilities
    // =============================================

    pickRandom(arr) {
        if (!arr || arr.length === 0) return 'อืมม';
        return arr[Math.floor(Math.random() * arr.length)];
    }

    getStickerResponse() {
        return this.pickRandom(this.stickerResponses);
    }

    /**
     * จำลองเวลาพิมพ์ตามความยาวข้อความ
     */
    getTypingDelay(responseLength) {
        const base = 800;
        const perChar = 25;
        const maxDelay = 3500;
        const minDelay = 1000;
        return Math.min(Math.max(base + (responseLength * perChar), minDelay), maxDelay);
    }

    /**
     * Should Mo send a reel? (low chance)
     */
    shouldSendReel() {
        return Math.random() < 0.06;
    }

    /**
     * Should Mo initiate a call? (very rare)
     */
    shouldInitiateCall() {
        return Math.random() < 0.02;
    }

    /**
     * Record user feedback for adaptive behavior
     */
    recordFeedback(type, detail) {
        this.conversationState.userFeedback.push({
            type,
            detail,
            timestamp: Date.now()
        });
    }
}

// Export
window.MoBrain = MoBrain;
