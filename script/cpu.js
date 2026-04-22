export  class CPU {
    constructor(gb) {
        // gb = 整台 Game Boy 主機物件
        // CPU 不會自己直接管理所有硬體，
        // 而是透過 gb 去讀寫記憶體、驅動其他元件。
        this.gb = gb;

        // =========================
        // DMG（初代 Game Boy）在跳過 Boot ROM 之後，
        // CPU 暫存器常見的初始值
        // =========================
        // 這些值不是亂填的，是很多模擬器在「不跑 boot rom」時，
        // 直接模擬 boot 結束後的狀態。
        this.a = 0x01;
        this.b = 0x00;
        this.c = 0x13;
        this.d = 0x00;
        this.e = 0xD8;
        this.h = 0x01;
        this.l = 0x4D;
        this.f = 0xB0;   // Flags 暫存器，只會用到高 4 bit

        // 程式計數器 PC
        // 跳過 boot rom 後，正式遊戲程式通常從 0x0100 開始執行
        this.pc = 0x0100;

        // Stack Pointer 堆疊指標
        // Game Boy 常見初始值是 0xFFFE
        this.sp = 0xFFFE;

        // 累積 CPU 已經跑了多少 cycle
        this.cycles = 0;

        // IME = Interrupt Master Enable
        // 是否允許 CPU 真正響應中斷
        // 1 = 開啟中斷，0 = 關閉中斷
        this.ime = 0;

        // EI 指令不會「立刻」開中斷，
        // 而是「下一條指令執行完」後才開啟。
        // 用倒數 2 -> 1 -> 0 的方式表示這個延遲。
        this.imeEnablePending = 0;

        // HALT 狀態
        // CPU 執行 HALT 後會暫停，直到中斷事件發生
        this.halted = false;

        // 開發中先允許未知 opcode 以 NOP 方式跳過，
        // 避免整個流程直接爆炸中止
        // strictMode = true 時，遇到未知 opcode 直接丟錯誤
        this.strictMode = false;

        // 用來記錄哪些未知 opcode 已經警告過，
        // 避免 console 一直重複洗版
        this._warnedUnknown = new Set();

        // =========================
        // Flag 位元常數
        // F 暫存器的高 4 bit 分別代表：
        //
        // bit7 = Z Zero flag
        // bit6 = N Subtract flag
        // bit5 = H Half Carry flag
        // bit4 = C Carry flag
        // =========================
        this.FLAG_Z = 0x80;
        this.FLAG_N = 0x40;
        this.FLAG_H = 0x20;
        this.FLAG_C = 0x10;
    }

    // =========================================================
    // 16-bit 組合暫存器
    // Game Boy CPU 常把兩個 8-bit 暫存器組成一個 16-bit 使用
    // AF, BC, DE, HL
    // =========================================================

    get AF() {
        // A 是高 8 位，F 是低 8 位
        // 但 F 的低 4 bit 本來就沒用，所以用 & 0xF0 保留高 4 bit
        return ((this.a << 8) | (this.f & 0xF0)) & 0xFFFF;
    }

    set AF(value) {
        // 保證只留 16 bit
        value &= 0xFFFF;

        // 高 8 bit 放進 A
        this.a = (value >>> 8) & 0xFF;

        // 低 8 bit 放進 F
        // 但 F 的低 4 bit 無效，所以直接清掉
        this.f = value & 0xF0;
    }

    get BC() {
        return ((this.b << 8) | this.c) & 0xFFFF;
    }

    set BC(value) {
        value &= 0xFFFF;
        this.b = (value >>> 8) & 0xFF;
        this.c = value & 0xFF;
    }

    get DE() {
        return ((this.d << 8) | this.e) & 0xFFFF;
    }

    set DE(value) {
        value &= 0xFFFF;
        this.d = (value >>> 8) & 0xFF;
        this.e = value & 0xFF;
    }

    get HL() {
        return ((this.h << 8) | this.l) & 0xFFFF;
    }

    set HL(value) {
        value &= 0xFFFF;
        this.h = (value >>> 8) & 0xFF;
        this.l = value & 0xFF;
    }

    // =========================================================
    // 基本記憶體讀寫包裝
    // CPU 不直接碰記憶體陣列，而是透過 gb 做匯流排讀寫
    // =========================================================

    readByte(addr) {
        // 從指定記憶體位址讀 1 byte
        return this.gb.readByte(addr);
    }

    writeByte(addr, value) {
        // 往指定記憶體位址寫 1 byte
        this.gb.writeByte(addr, value);
    }

    readPC8() {
        // 從 PC 指向的位置讀 1 byte，
        // 然後 PC 自動往後加 1
        const v = this.readByte(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        return v;
    }

    readPC16() {
        // Game Boy 是 little-endian
        // 低位元組先讀，再讀高位元組
        const lo = this.readPC8();
        const hi = this.readPC8();
        return ((hi << 8) | lo) & 0xFFFF;
    }

    push16(value) {
        // 把 16-bit 值推入堆疊
        // 堆疊是往「低位址方向」長
        value &= 0xFFFF;

        // 先放高位元組
        this.sp = (this.sp - 1) & 0xFFFF;
        this.writeByte(this.sp, (value >>> 8) & 0xFF);

        // 再放低位元組
        this.sp = (this.sp - 1) & 0xFFFF;
        this.writeByte(this.sp, value & 0xFF);
    }

    pop16() {
        // 從堆疊取回 16-bit 值
        // 先讀低位元組，再讀高位元組
        const lo = this.readByte(this.sp);
        this.sp = (this.sp + 1) & 0xFFFF;

        const hi = this.readByte(this.sp);
        this.sp = (this.sp + 1) & 0xFFFF;

        return ((hi << 8) | lo) & 0xFFFF;
    }

    signed8(v) {
        // 把 8-bit 無號數，轉成有號數
        //
        // 例如：
        // 0x05 -> 5
        // 0xFE -> -2
        //
        // JR r8 這種相對跳躍很常用這個轉換
        return v < 0x80 ? v : v - 0x100;
    }

    // =========================================================
    // Flag 操作工具
    // =========================================================

    getFlag(mask) {
        // 判斷某個 flag 是否有被設為 1
        return (this.f & mask) !== 0;
    }

    setFlag(mask, on) {
        // 開或關某個 flag
        if (on) {
            // 設成 1
            this.f = (this.f | mask) & 0xF0;
        } else {
            // 設成 0
            this.f = (this.f & (~mask)) & 0xF0;
        }
    }

    setZNHC(z, n, h, c) {
        // 一次設定 Z / N / H / C 四個旗標
        this.f = 0;
        this.setFlag(this.FLAG_Z, z);
        this.setFlag(this.FLAG_N, n);
        this.setFlag(this.FLAG_H, h);
        this.setFlag(this.FLAG_C, c);
    }

    // =========================================================
    // 依索引讀寫 8-bit 暫存器
    // 這是為了讓很多 opcode 可以共用邏輯
    //
    // 對應表：
    // 0 = B
    // 1 = C
    // 2 = D
    // 3 = E
    // 4 = H
    // 5 = L
    // 6 = (HL)  ← 不是暫存器，是記憶體位址 HL 指向的內容
    // 7 = A
    // =========================================================

    readRegByIndex(index) {
        switch (index & 0x07) {
            case 0: return this.b;
            case 1: return this.c;
            case 2: return this.d;
            case 3: return this.e;
            case 4: return this.h;
            case 5: return this.l;
            case 6: return this.readByte(this.HL); // 讀 HL 指向的記憶體
            case 7: return this.a;
            default: return 0xFF;
        }
    }

    writeRegByIndex(index, value) {
        value &= 0xFF;
        switch (index & 0x07) {
            case 0: this.b = value; break;
            case 1: this.c = value; break;
            case 2: this.d = value; break;
            case 3: this.e = value; break;
            case 4: this.h = value; break;
            case 5: this.l = value; break;
            case 6: this.writeByte(this.HL, value); break; // 寫入 HL 指向的記憶體
            case 7: this.a = value; break;
        }
    }

    // =========================================================
    // 條件判斷（給 JR cc / JP cc / CALL cc / RET cc 用）
    //
    // cond 對應：
    // 0 = NZ  Z=0
    // 1 = Z   Z=1
    // 2 = NC  C=0
    // 3 = C   C=1
    // =========================================================

    // checkCond(cond) { 目前新手向不使用這個，讓指令直接取暫存器即可，比較直接
    //     switch (cond & 0x03) {
    //         case 0: return !this.getFlag(this.FLAG_Z); // NZ
    //         case 1: return this.getFlag(this.FLAG_Z);  // Z
    //         case 2: return !this.getFlag(this.FLAG_C); // NC
    //         case 3: return this.getFlag(this.FLAG_C);  // C
    //         default: return false;
    //     }
    // }

    // =========================================================
    // 8-bit INC / DEC
    // =========================================================

    inc8(value) {
        // 8-bit +1，超過 255 會回到 0
        const r = (value + 1) & 0xFF;

        // Z：結果是否為 0
        this.setFlag(this.FLAG_Z, r === 0);

        // N：INC 不是減法，所以設 0
        this.setFlag(this.FLAG_N, false);

        // H：低 4 bit 是否從 0x0F + 1 產生半進位
        // 例如 0x0F -> 0x10
        this.setFlag(this.FLAG_H, (value & 0x0F) === 0x0F);

        return r;
    }

    dec8(value) {
        // 8-bit -1，低於 0 會回到 255
        const r = (value - 1) & 0xFF;

        // Z：結果是否為 0
        this.setFlag(this.FLAG_Z, r === 0);

        // N：DEC 是減法，所以設 1
        this.setFlag(this.FLAG_N, true);

        // H：低 4 bit 是否需要借位
        // 例如 0x10 -> 0x0F，就發生半借位
        this.setFlag(this.FLAG_H, (value & 0x0F) === 0x00);

        return r;
    }

    addA(value, carryIn = 0) {
        // A = A + value + carryIn
        // carryIn 給 ADC 用，普通 ADD 時 carryIn = 0
        value &= 0xFF;
        carryIn &= 0x01;

        const a = this.a;
        const sum = a + value + carryIn;
        const r = sum & 0xFF;

        // 結果寫回 A
        this.a = r;

        this.setZNHC(
            r === 0, // Z：結果為 0？
            false,   // N：加法，所以為 0
            ((a & 0x0F) + (value & 0x0F) + carryIn) > 0x0F, // H：低 4 bit 是否進位
            sum > 0xFF // C：整體是否超過 8-bit
        );
    }

    subA(value, carryIn = 0) {
        // A = A - value - carryIn
        // carryIn 給 SBC 用
        value &= 0xFF;
        carryIn &= 0x01;

        const a = this.a;
        const diff = a - value - carryIn;
        const r = diff & 0xFF;

        // 結果寫回 A
        this.a = r;

        this.setZNHC(
            r === 0, // Z：結果為 0？
            true,    // N：減法，所以為 1
            ((a & 0x0F) - (value & 0x0F) - carryIn) < 0, // H：低 4 bit 是否借位
            diff < 0 // C：整體是否借位
        );
    }

    andA(value) {
        // A = A AND value
        this.a = (this.a & value) & 0xFF;

        // AND 指令的 flag 規則：
        // Z 看結果
        // N = 0
        // H = 1
        // C = 0
        this.setZNHC(this.a === 0, false, true, false);
    }

    xorA(value) {
        // A = A XOR value
        this.a = (this.a ^ value) & 0xFF;
        this.setZNHC(this.a === 0, false, false, false);
    }

    orA(value) {
        // A = A OR value
        this.a = (this.a | value) & 0xFF;
        this.setZNHC(this.a === 0, false, false, false);
    }

    cpA(value) {
        // CP = Compare
        // 表面上像做 A - value
        // 但不會真的把結果寫回 A
        value &= 0xFF;

        const a = this.a;
        const diff = a - value;
        const r = diff & 0xFF;

        this.setZNHC(
            r === 0, // Z：如果相等，減完結果是 0
            true,    // N：這是減法概念
            (a & 0x0F) < (value & 0x0F), // H：低 4 bit 借位
            a < value // C：整體借位
        );
    }

    // =========================================================
    // 16-bit HL 加法
    // =========================================================

    addHL(value) {
        value &= 0xFFFF;

        const hl = this.HL;
        const sum = hl + value;

        // ADD HL,rr 的 flag 規則：
        // N = 0
        this.setFlag(this.FLAG_N, false);

        // H：看低 12 bit 是否進位
        this.setFlag(this.FLAG_H, ((hl & 0x0FFF) + (value & 0x0FFF)) > 0x0FFF);

        // C：看 16 bit 是否溢位
        this.setFlag(this.FLAG_C, sum > 0xFFFF);

        // 寫回 HL
        this.HL = sum & 0xFFFF;
    }

    // =========================================================
    // DAA：十進位調整
    // 這是 Game Boy / Z80 類 CPU 中讓 BCD 運算正確的重要指令
    // 新手最容易看不懂，但測試 ROM 常會用到
    // =========================================================

    daa() {
        let a = this.a;
        let adjust = 0;

        // 先記住目前 Carry 狀態
        let carry = this.getFlag(this.FLAG_C);

        // 如果上一個運算不是減法（N=0），代表剛剛是加法類指令
        if (!this.getFlag(this.FLAG_N)) {
            // 如果低位 BCD 不合法，就補 0x06
            if (this.getFlag(this.FLAG_H) || (a & 0x0F) > 0x09) {
                adjust |= 0x06;
            }

            // 如果高位 BCD 不合法，就補 0x60
            if (carry || a > 0x99) {
                adjust |= 0x60;
                carry = true;
            }

            a = (a + adjust) & 0xFF;
        } else {
            // 如果上一個是減法（N=1），那調整方式相反，要減回去
            if (this.getFlag(this.FLAG_H)) {
                adjust |= 0x06;
            }
            if (carry) {
                adjust |= 0x60;
            }

            a = (a - adjust) & 0xFF;
        }

        this.a = a;

        // DAA 執行後：
        // Z 依結果決定
        // H 一定清掉
        // C 保留調整後結果
        this.setFlag(this.FLAG_Z, this.a === 0);
        this.setFlag(this.FLAG_H, false);
        this.setFlag(this.FLAG_C, carry);
    }

    // =========================================================
    // 中斷處理
    // =========================================================

    serviceInterrupts() {
        // IE = Interrupt Enable，位址 0xFFFF
        // IF = Interrupt Flag，位址 0xFF0F
        //
        // 只取低 5 bit，因為 Game Boy 只有 5 種主要中斷
        const ie = this.readByte(0xFFFF) & 0x1F;
        const iflag = this.readByte(0xFF0F) & 0x1F;

        // pending = 已請求而且也有開啟的中斷
        const pending = ie & iflag;

        // 沒有待處理中斷
        if (pending === 0) return 0;

        // 有中斷，但 IME 沒開
        // 若 CPU 正在 HALT，則要解除 halted
        // 但不真的跳去中斷向量
        if (!this.ime) {
            this.halted = false;
            return 0;
        }

        // 有中斷，而且 IME 開啟
        // 開始正式服務中斷
        this.halted = false;
        this.ime = 0; // 進入中斷後先自動關中斷

        let bit = 0;
        let vector = 0x40;

        // Game Boy 中斷優先順序：
        // bit0 VBlank  -> 0x40
        // bit1 LCD STAT-> 0x48
        // bit2 Timer   -> 0x50
        // bit3 Serial  -> 0x58
        // bit4 Joypad  -> 0x60
        if (pending & 0x01) {
            bit = 0;
            vector = 0x40;
        } else if (pending & 0x02) {
            bit = 1;
            vector = 0x48;
        } else if (pending & 0x04) {
            bit = 2;
            vector = 0x50;
        } else if (pending & 0x08) {
            bit = 3;
            vector = 0x58;
        } else if (pending & 0x10) {
            bit = 4;
            vector = 0x60;
        }

        // 把對應 IF bit 清掉，表示這個中斷已經開始處理
        const newIF = iflag & (~(1 << bit));
        this.writeByte(0xFF0F, newIF);

        // 像 CALL 一樣，先把目前 PC 壓入堆疊
        this.push16(this.pc);

        // 再跳到中斷向量位址
        this.pc = vector;

        // 一般 Game Boy 中斷服務消耗 20 cycles
        return 20;
    }

    // =========================================================
    // CB 前綴指令處理
    // 這群指令大多是位元操作、旋轉、移位
    // =========================================================

    execCB(cb) {
        // 把 8-bit opcode 拆成 x / y / z 三段
        const x = (cb >>> 6) & 0x03;
        const y = (cb >>> 3) & 0x07;
        const z = cb & 0x07;

        // z === 6 代表操作對象是 (HL) 記憶體，不是一般暫存器
        const isMem = z === 6;

        // 先讀出要操作的值
        let value = this.readRegByIndex(z);
        let result = value;

        // x = 0：旋轉 / 移位 / SWAP
        if (x === 0) {
            let carryOut = 0;

            switch (y) {
                case 0: // RLC：循環左轉，最高 bit 轉到最低 bit，也進 Carry
                    carryOut = (value >>> 7) & 1;
                    result = ((value << 1) | carryOut) & 0xFF;
                    break;

                case 1: // RRC：循環右轉，最低 bit 轉到最高 bit，也進 Carry
                    carryOut = value & 1;
                    result = ((carryOut << 7) | (value >>> 1)) & 0xFF;
                    break;

                case 2: { // RL：透過 Carry 左轉
                    const carryIn = this.getFlag(this.FLAG_C) ? 1 : 0;
                    carryOut = (value >>> 7) & 1;
                    result = ((value << 1) | carryIn) & 0xFF;
                    break;
                }

                case 3: { // RR：透過 Carry 右轉
                    const carryIn = this.getFlag(this.FLAG_C) ? 1 : 0;
                    carryOut = value & 1;
                    result = ((carryIn << 7) | (value >>> 1)) & 0xFF;
                    break;
                }

                case 4: // SLA：算術左移，最低位補 0，最高位丟進 Carry
                    carryOut = (value >>> 7) & 1;
                    result = (value << 1) & 0xFF;
                    break;

                case 5: // SRA：算術右移，保留原本最高位（符號位概念）
                    carryOut = value & 1;
                    result = ((value & 0x80) | (value >>> 1)) & 0xFF;
                    break;

                case 6: // SWAP：高低 4 bit 交換
                    carryOut = 0;
                    result = (((value & 0x0F) << 4) | ((value & 0xF0) >>> 4)) & 0xFF;
                    break;

                case 7: // SRL：邏輯右移，最高位補 0
                    carryOut = value & 1;
                    result = (value >>> 1) & 0xFF;
                    break;
            }

            // 寫回目標
            this.writeRegByIndex(z, result);

            // 這群指令的 flag 規則：
            // Z 看結果
            // N = 0
            // H = 0
            // C 看被移出去的 bit
            this.setZNHC(result === 0, false, false, carryOut === 1);

            return isMem ? 16 : 8;
        }

        // x = 1：BIT y,r
        // 測試某個 bit 是否為 0，不改變原值
        if (x === 1) {
            const bitIsZero = ((value >>> y) & 1) === 0;
            this.setFlag(this.FLAG_Z, bitIsZero);
            this.setFlag(this.FLAG_N, false);
            this.setFlag(this.FLAG_H, true);
            return isMem ? 12 : 8;
        }

        // x = 2：RES y,r
        // 把某個 bit 清成 0
        if (x === 2) {
            result = value & (~(1 << y));
            this.writeRegByIndex(z, result);
            return isMem ? 16 : 8;
        }

        // x = 3：SET y,r
        // 把某個 bit 設成 1
        result = value | (1 << y);
        this.writeRegByIndex(z, result);
        return isMem ? 16 : 8;
    }

    // =========================================================
    // 遇到未實作 opcode 的處理
    // =========================================================

    unknownOpcode(opcode) {
        const hex = opcode.toString(16).padStart(2, "0");

        // 嚴格模式：直接報錯
        if (this.strictMode) {
            throw new Error(`未實作 opcode: 0x${hex}`);
        }

        // 非嚴格模式：第一次看到就警告一次，之後當作 NOP 跳過
        if (!this._warnedUnknown.has(opcode)) {
            this._warnedUnknown.add(opcode);
            console.warn(`未實作 opcode，暫以 NOP 跳過: 0x${hex}`);
        }

        // NOP = 4 cycles
        return 4;
    }

    executeOpcode(opcode) {
        // opcode 是 Operation Code（操作碼）
        // 中文可以理解成：CPU 目前讀到的「指令編號」
        // 這裡先把它限制在 8-bit 範圍內，避免意外超出 0x00 ~ 0xFF
        opcode &= 0xFF;

        // switch 是依照不同的 opcode，執行不同的指令
        switch (opcode) {
            // =====================================================
            // 1. CPU 狀態控制
            // =====================================================

            case 0x00:
                // NOP = No Operation（不做任何事）
                // 這條指令執行後，CPU 不改資料、不改旗標，只是單純花時間前進
                return 4;

            case 0x10:
                // STOP 是讓 CPU / 主機進入停止狀態的指令
                // 真正硬體行為比較複雜，這裡先做簡化
                // STOP 後面通常還會跟一個 0x00，所以這裡多讀一個 byte 跳過它
                this.readPC8();
                return 4;

            case 0x76:
                // HALT = 暫停 CPU，直到中斷發生才繼續
                // 這裡把 halted 狀態設成 true，表示 CPU 先停下來
                this.halted = true;
                return 4;

            case 0xF3:
                // DI = Disable Interrupts（關閉中斷）
                // ime = Interrupt Master Enable（中斷總開關）
                // 設為 0，表示 CPU 目前不接受中斷
                this.ime = 0;

                // imeEnablePending 是「延後開啟中斷」的等待旗標
                // 既然現在執行的是 DI，要把這個等待也取消掉
                this.imeEnablePending = 0;
                return 4;

            case 0xFB:
                // EI = Enable Interrupts（開啟中斷）
                // 但 Game Boy 的 EI 不會立刻生效
                // 而是「下一條指令執行完後」才真的把 ime 打開
                // 所以這裡先把延遲倒數設成 2：
                // 這一條 EI 結束後會變成 1，
                // 下一條指令結束後才會真正啟用 IME。
                this.imeEnablePending = 2;
                return 4;


            // =====================================================
            // 2. 8-bit 載入指令（立即值、暫存器、記憶體）
            // =====================================================

            // -----------------------------------------------------
            // LD r,d8 / LD (HL),d8
            // LD = Load（載入）
            // r  = register（暫存器）
            // d8 = 8-bit immediate data（8位元立即值）
            // -----------------------------------------------------

            case 0x06:
                // 讀取 PC（Program Counter，程式計數器）後面的 1 byte
                // 並存到 B 暫存器
                this.b = this.readPC8();
                return 8; // LD B,d8

            case 0x0E:
                // 把下一個 8-bit 數值放進 C
                this.c = this.readPC8();
                return 8; // LD C,d8

            case 0x16:
                // 把下一個 8-bit 數值放進 D
                this.d = this.readPC8();
                return 8; // LD D,d8

            case 0x1E:
                // 把下一個 8-bit 數值放進 E
                this.e = this.readPC8();
                return 8; // LD E,d8

            case 0x26:
                // 把下一個 8-bit 數值放進 H
                this.h = this.readPC8();
                return 8; // LD H,d8

            case 0x2E:
                // 把下一個 8-bit 數值放進 L
                this.l = this.readPC8();
                return 8; // LD L,d8

            case 0x36:
                // HL 是 H 與 L 組成的 16-bit 位址
                // 這條指令的意思是：
                // 把下一個 8-bit 數值，寫到記憶體位址 HL
                this.writeByte(this.HL, this.readPC8());
                return 12; // LD (HL),d8

            case 0x3E:
                // 把下一個 8-bit 數值放進 A
                // A = Accumulator（累加器），是最常用的主要暫存器
                this.a = this.readPC8();
                return 8; // LD A,d8


            // -----------------------------------------------------
            // LD (BC/DE/HL),A 與 LD A,(BC/DE/HL)
            // 把 A 寫到某個位址，或從某個位址讀回 A
            // -----------------------------------------------------

            case 0x02:
                // BC 是 B 與 C 組成的 16-bit 位址
                // 把 A 的值，寫到記憶體位址 BC
                this.writeByte(this.BC, this.a);
                return 8; // LD (BC),A

            case 0x12:
                // 把 A 的值，寫到記憶體位址 DE
                this.writeByte(this.DE, this.a);
                return 8; // LD (DE),A

            case 0x22:
                // 先把 A 寫到記憶體位址 HL
                this.writeByte(this.HL, this.a);

                // 然後 HL 自動 +1
                // 這種寫法常用在連續寫資料時
                this.HL = (this.HL + 1) & 0xFFFF;
                return 8; // LDI (HL),A

            case 0x32:
                // 先把 A 寫到記憶體位址 HL
                this.writeByte(this.HL, this.a);

                // 然後 HL 自動 -1
                // 常用在反方向處理資料
                this.HL = (this.HL - 1) & 0xFFFF;
                return 8; // LDD (HL),A

            case 0x0A:
                // 從記憶體位址 BC 讀 1 byte，放進 A
                this.a = this.readByte(this.BC);
                return 8; // LD A,(BC)

            case 0x1A:
                // 從記憶體位址 DE 讀 1 byte，放進 A
                this.a = this.readByte(this.DE);
                return 8; // LD A,(DE)

            case 0x2A:
                // 先從 HL 指向的位址讀值到 A
                this.a = this.readByte(this.HL);

                // 再把 HL 加 1
                this.HL = (this.HL + 1) & 0xFFFF;
                return 8; // LDI A,(HL)

            case 0x3A:
                // 先從 HL 指向的位址讀值到 A
                this.a = this.readByte(this.HL);

                // 再把 HL 減 1
                this.HL = (this.HL - 1) & 0xFFFF;
                return 8; // LDD A,(HL)


            // -----------------------------------------------------
            // LD r,r
            // 把某個暫存器的值，複製到另一個暫存器
            // -----------------------------------------------------

            case 0x40:
                // B ← B
                // 看起來沒變化，但這個 opcode 確實存在
                this.b = this.b;
                return 4; // LD B,B

            case 0x41:
                // B ← C
                this.b = this.c;
                return 4; // LD B,C

            case 0x42:
                // B ← D
                this.b = this.d;
                return 4; // LD B,D

            case 0x43:
                // B ← E
                this.b = this.e;
                return 4; // LD B,E

            case 0x44:
                // B ← H
                this.b = this.h;
                return 4; // LD B,H

            case 0x45:
                // B ← L
                this.b = this.l;
                return 4; // LD B,L

            case 0x46:
                // B ← (HL)
                // 也就是從 HL 指向的記憶體讀值到 B
                this.b = this.readByte(this.HL);
                return 8; // LD B,(HL)

            case 0x47:
                // B ← A
                this.b = this.a;
                return 4; // LD B,A


            case 0x48:
                // C ← B
                this.c = this.b;
                return 4; // LD C,B

            case 0x49:
                // C ← C
                this.c = this.c;
                return 4; // LD C,C

            case 0x4A:
                // C ← D
                this.c = this.d;
                return 4; // LD C,D

            case 0x4B:
                // C ← E
                this.c = this.e;
                return 4; // LD C,E

            case 0x4C:
                // C ← H
                this.c = this.h;
                return 4; // LD C,H

            case 0x4D:
                // C ← L
                this.c = this.l;
                return 4; // LD C,L

            case 0x4E:
                // C ← (HL)
                this.c = this.readByte(this.HL);
                return 8; // LD C,(HL)

            case 0x4F:
                // C ← A
                this.c = this.a;
                return 4; // LD C,A


            case 0x50:
                // D ← B
                this.d = this.b;
                return 4; // LD D,B

            case 0x51:
                // D ← C
                this.d = this.c;
                return 4; // LD D,C

            case 0x52:
                // D ← D
                this.d = this.d;
                return 4; // LD D,D

            case 0x53:
                // D ← E
                this.d = this.e;
                return 4; // LD D,E

            case 0x54:
                // D ← H
                this.d = this.h;
                return 4; // LD D,H

            case 0x55:
                // D ← L
                this.d = this.l;
                return 4; // LD D,L

            case 0x56:
                // D ← (HL)
                this.d = this.readByte(this.HL);
                return 8; // LD D,(HL)

            case 0x57:
                // D ← A
                this.d = this.a;
                return 4; // LD D,A


            case 0x58:
                // E ← B
                this.e = this.b;
                return 4; // LD E,B

            case 0x59:
                // E ← C
                this.e = this.c;
                return 4; // LD E,C

            case 0x5A:
                // E ← D
                this.e = this.d;
                return 4; // LD E,D

            case 0x5B:
                // E ← E
                this.e = this.e;
                return 4; // LD E,E

            case 0x5C:
                // E ← H
                this.e = this.h;
                return 4; // LD E,H

            case 0x5D:
                // E ← L
                this.e = this.l;
                return 4; // LD E,L

            case 0x5E:
                // E ← (HL)
                this.e = this.readByte(this.HL);
                return 8; // LD E,(HL)

            case 0x5F:
                // E ← A
                this.e = this.a;
                return 4; // LD E,A


            case 0x60:
                // H ← B
                this.h = this.b;
                return 4; // LD H,B

            case 0x61:
                // H ← C
                this.h = this.c;
                return 4; // LD H,C

            case 0x62:
                // H ← D
                this.h = this.d;
                return 4; // LD H,D

            case 0x63:
                // H ← E
                this.h = this.e;
                return 4; // LD H,E

            case 0x64:
                // H ← H
                this.h = this.h;
                return 4; // LD H,H

            case 0x65:
                // H ← L
                this.h = this.l;
                return 4; // LD H,L

            case 0x66:
                // H ← (HL)
                this.h = this.readByte(this.HL);
                return 8; // LD H,(HL)

            case 0x67:
                // H ← A
                this.h = this.a;
                return 4; // LD H,A


            case 0x68:
                // L ← B
                this.l = this.b;
                return 4; // LD L,B

            case 0x69:
                // L ← C
                this.l = this.c;
                return 4; // LD L,C

            case 0x6A:
                // L ← D
                this.l = this.d;
                return 4; // LD L,D

            case 0x6B:
                // L ← E
                this.l = this.e;
                return 4; // LD L,E

            case 0x6C:
                // L ← H
                this.l = this.h;
                return 4; // LD L,H

            case 0x6D:
                // L ← L
                this.l = this.l;
                return 4; // LD L,L

            case 0x6E:
                // L ← (HL)
                this.l = this.readByte(this.HL);
                return 8; // LD L,(HL)

            case 0x6F:
                // L ← A
                this.l = this.a;
                return 4; // LD L,A


            case 0x70:
                // (HL) ← B
                // 把 B 寫進 HL 指向的記憶體
                this.writeByte(this.HL, this.b);
                return 8; // LD (HL),B

            case 0x71:
                // (HL) ← C
                this.writeByte(this.HL, this.c);
                return 8; // LD (HL),C

            case 0x72:
                // (HL) ← D
                this.writeByte(this.HL, this.d);
                return 8; // LD (HL),D

            case 0x73:
                // (HL) ← E
                this.writeByte(this.HL, this.e);
                return 8; // LD (HL),E

            case 0x74:
                // (HL) ← H
                this.writeByte(this.HL, this.h);
                return 8; // LD (HL),H

            case 0x75:
                // (HL) ← L
                this.writeByte(this.HL, this.l);
                return 8; // LD (HL),L

            case 0x77:
                // (HL) ← A
                this.writeByte(this.HL, this.a);
                return 8; // LD (HL),A


            case 0x78:
                // A ← B
                this.a = this.b;
                return 4; // LD A,B

            case 0x79:
                // A ← C
                this.a = this.c;
                return 4; // LD A,C

            case 0x7A:
                // A ← D
                this.a = this.d;
                return 4; // LD A,D

            case 0x7B:
                // A ← E
                this.a = this.e;
                return 4; // LD A,E

            case 0x7C:
                // A ← H
                this.a = this.h;
                return 4; // LD A,H

            case 0x7D:
                // A ← L
                this.a = this.l;
                return 4; // LD A,L

            case 0x7E:
                // A ← (HL)
                this.a = this.readByte(this.HL);
                return 8; // LD A,(HL)

            case 0x7F:
                // A ← A
                this.a = this.a;
                return 4; // LD A,A


            // =====================================================
            // 3. 16-bit 載入指令
            // =====================================================

            case 0x01:
                // 讀取接下來的 2 byte（16-bit）
                // 並放進 BC
                this.BC = this.readPC16();
                return 12; // LD BC,d16

            case 0x11:
                // 讀取 16-bit 值放進 DE
                this.DE = this.readPC16();
                return 12; // LD DE,d16

            case 0x21:
                // 讀取 16-bit 值放進 HL
                this.HL = this.readPC16();
                return 12; // LD HL,d16

            case 0x31:
                // 讀取 16-bit 值放進 SP
                // SP = Stack Pointer（堆疊指標）
                this.sp = this.readPC16();
                return 12; // LD SP,d16

            case 0x08: {
                // 先讀出一個 16-bit 記憶體位址
                const addr = this.readPC16();

                // 把 SP 的低位元組（low byte）寫到 addr
                this.writeByte(addr, this.sp & 0xFF);

                // 把 SP 的高位元組（high byte）寫到 addr + 1
                this.writeByte((addr + 1) & 0xFFFF, (this.sp >>> 8) & 0xFF);

                return 20; // LD (a16),SP
            }

            case 0xF8: {
                // 讀取 8-bit 數值
                const n = this.readPC8();

                // signed8 = 把 8-bit 解讀成有正負號的數值
                // 例如 0xFE 會被看成 -2
                const e = this.signed8(n);

                // 先暫存舊的 SP
                const sp = this.sp;

                // 計算 SP + e，結果放到 r
                const r = (sp + e) & 0xFFFF;

                // 這條指令會影響旗標：
                // Z = 0
                // N = 0
                // H / C 依低位元加法是否進位而定
                this.setZNHC(
                    false,
                    false,
                    ((sp & 0x0F) + (n & 0x0F)) > 0x0F,
                    ((sp & 0xFF) + (n & 0xFF)) > 0xFF
                );

                // 把計算結果放到 HL
                this.HL = r;
                return 12; // LD HL,SP+r8
            }

            case 0xF9:
                // 把 HL 的值複製給 SP
                this.sp = this.HL;
                return 8; // LD SP,HL


            // =====================================================
            // 4. 8-bit 加減與邏輯運算
            // =====================================================

            // -----------------------------------------------------
            // INC / DEC
            // INC = Increment（加 1）
            // DEC = Decrement（減 1）
            // -----------------------------------------------------

            case 0x04:
                // B = B + 1
                // inc8() 會幫你處理旗標
                this.b = this.inc8(this.b);
                return 4; // INC B

            case 0x0C:
                // C = C + 1
                this.c = this.inc8(this.c);
                return 4; // INC C

            case 0x14:
                // D = D + 1
                this.d = this.inc8(this.d);
                return 4; // INC D

            case 0x1C:
                // E = E + 1
                this.e = this.inc8(this.e);
                return 4; // INC E

            case 0x24:
                // H = H + 1
                this.h = this.inc8(this.h);
                return 4; // INC H

            case 0x2C:
                // L = L + 1
                this.l = this.inc8(this.l);
                return 4; // INC L

            case 0x34: {
                // 先讀出 HL 指向的記憶體值
                const v = this.readByte(this.HL);

                // 對該值做 +1，並寫回原本位置
                this.writeByte(this.HL, this.inc8(v));
                return 12; // INC (HL)
            }

            case 0x3C:
                // A = A + 1
                this.a = this.inc8(this.a);
                return 4; // INC A


            case 0x05:
                // B = B - 1
                this.b = this.dec8(this.b);
                return 4; // DEC B

            case 0x0D:
                // C = C - 1
                this.c = this.dec8(this.c);
                return 4; // DEC C

            case 0x15:
                // D = D - 1
                this.d = this.dec8(this.d);
                return 4; // DEC D

            case 0x1D:
                // E = E - 1
                this.e = this.dec8(this.e);
                return 4; // DEC E

            case 0x25:
                // H = H - 1
                this.h = this.dec8(this.h);
                return 4; // DEC H

            case 0x2D:
                // L = L - 1
                this.l = this.dec8(this.l);
                return 4; // DEC L

            case 0x35: {
                // 先讀出 HL 指向的記憶體值
                const v = this.readByte(this.HL);

                // 對該值做 -1，並寫回原本位置
                this.writeByte(this.HL, this.dec8(v));
                return 12; // DEC (HL)
            }

            case 0x3D:
                // A = A - 1
                this.a = this.dec8(this.a);
                return 4; // DEC A


            // -----------------------------------------------------
            // ALU A,d8
            // ALU = Arithmetic Logic Unit（算術邏輯單元）
            // 這類指令是 A 與 立即值 d8 做運算
            // -----------------------------------------------------

            case 0xC6:
                // A = A + d8
                this.addA(this.readPC8(), 0);
                return 8; // ADD A,d8

            case 0xCE:
                // ADC = Add with Carry（帶進位加法）
                // 除了加 d8，還會再加上 C flag（進位旗標）
                this.addA(this.readPC8(), this.getFlag(this.FLAG_C) ? 1 : 0);
                return 8; // ADC A,d8

            case 0xD6:
                // SUB = Subtract（減法）
                this.subA(this.readPC8(), 0);
                return 8; // SUB d8

            case 0xDE:
                // SBC = Subtract with Carry（帶借位減法）
                this.subA(this.readPC8(), this.getFlag(this.FLAG_C) ? 1 : 0);
                return 8; // SBC A,d8

            case 0xE6:
                // AND = 位元 AND
                this.andA(this.readPC8());
                return 8; // AND d8

            case 0xEE:
                // XOR = 位元 XOR（互斥或）
                this.xorA(this.readPC8());
                return 8; // XOR d8

            case 0xF6:
                // OR = 位元 OR
                this.orA(this.readPC8());
                return 8; // OR d8

            case 0xFE:
                // CP = Compare（比較）
                // 本質上像做 A - d8，但不改 A，只改旗標
                this.cpA(this.readPC8());
                return 8; // CP d8


            // -----------------------------------------------------
            // ALU A,r
            // A 與某個暫存器 / (HL) 做運算
            // -----------------------------------------------------

            case 0x80:
                this.addA(this.b, 0);
                return 4; // ADD A,B

            case 0x81:
                this.addA(this.c, 0);
                return 4; // ADD A,C

            case 0x82:
                this.addA(this.d, 0);
                return 4; // ADD A,D

            case 0x83:
                this.addA(this.e, 0);
                return 4; // ADD A,E

            case 0x84:
                this.addA(this.h, 0);
                return 4; // ADD A,H

            case 0x85:
                this.addA(this.l, 0);
                return 4; // ADD A,L

            case 0x86:
                // 從 (HL) 取值後與 A 相加
                this.addA(this.readByte(this.HL), 0);
                return 8; // ADD A,(HL)

            case 0x87:
                this.addA(this.a, 0);
                return 4; // ADD A,A


            case 0x88:
                this.addA(this.b, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // ADC A,B

            case 0x89:
                this.addA(this.c, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // ADC A,C

            case 0x8A:
                this.addA(this.d, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // ADC A,D

            case 0x8B:
                this.addA(this.e, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // ADC A,E

            case 0x8C:
                this.addA(this.h, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // ADC A,H

            case 0x8D:
                this.addA(this.l, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // ADC A,L

            case 0x8E:
                this.addA(this.readByte(this.HL), this.getFlag(this.FLAG_C) ? 1 : 0);
                return 8; // ADC A,(HL)

            case 0x8F:
                this.addA(this.a, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // ADC A,A


            case 0x90:
                this.subA(this.b, 0);
                return 4; // SUB B

            case 0x91:
                this.subA(this.c, 0);
                return 4; // SUB C

            case 0x92:
                this.subA(this.d, 0);
                return 4; // SUB D

            case 0x93:
                this.subA(this.e, 0);
                return 4; // SUB E

            case 0x94:
                this.subA(this.h, 0);
                return 4; // SUB H

            case 0x95:
                this.subA(this.l, 0);
                return 4; // SUB L

            case 0x96:
                this.subA(this.readByte(this.HL), 0);
                return 8; // SUB (HL)

            case 0x97:
                this.subA(this.a, 0);
                return 4; // SUB A


            case 0x98:
                this.subA(this.b, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // SBC A,B

            case 0x99:
                this.subA(this.c, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // SBC A,C

            case 0x9A:
                this.subA(this.d, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // SBC A,D

            case 0x9B:
                this.subA(this.e, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // SBC A,E

            case 0x9C:
                this.subA(this.h, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // SBC A,H

            case 0x9D:
                this.subA(this.l, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // SBC A,L

            case 0x9E:
                this.subA(this.readByte(this.HL), this.getFlag(this.FLAG_C) ? 1 : 0);
                return 8; // SBC A,(HL)

            case 0x9F:
                this.subA(this.a, this.getFlag(this.FLAG_C) ? 1 : 0);
                return 4; // SBC A,A


            case 0xA0:
                this.andA(this.b);
                return 4; // AND B

            case 0xA1:
                this.andA(this.c);
                return 4; // AND C

            case 0xA2:
                this.andA(this.d);
                return 4; // AND D

            case 0xA3:
                this.andA(this.e);
                return 4; // AND E

            case 0xA4:
                this.andA(this.h);
                return 4; // AND H

            case 0xA5:
                this.andA(this.l);
                return 4; // AND L

            case 0xA6:
                this.andA(this.readByte(this.HL));
                return 8; // AND (HL)

            case 0xA7:
                this.andA(this.a);
                return 4; // AND A


            case 0xA8:
                this.xorA(this.b);
                return 4; // XOR B

            case 0xA9:
                this.xorA(this.c);
                return 4; // XOR C

            case 0xAA:
                this.xorA(this.d);
                return 4; // XOR D

            case 0xAB:
                this.xorA(this.e);
                return 4; // XOR E

            case 0xAC:
                this.xorA(this.h);
                return 4; // XOR H

            case 0xAD:
                this.xorA(this.l);
                return 4; // XOR L

            case 0xAE:
                this.xorA(this.readByte(this.HL));
                return 8; // XOR (HL)

            case 0xAF:
                // A XOR A 一定會得到 0
                // 這是很常見的清空 A 的技巧
                this.xorA(this.a);
                return 4; // XOR A


            case 0xB0:
                this.orA(this.b);
                return 4; // OR B

            case 0xB1:
                this.orA(this.c);
                return 4; // OR C

            case 0xB2:
                this.orA(this.d);
                return 4; // OR D

            case 0xB3:
                this.orA(this.e);
                return 4; // OR E

            case 0xB4:
                this.orA(this.h);
                return 4; // OR H

            case 0xB5:
                this.orA(this.l);
                return 4; // OR L

            case 0xB6:
                this.orA(this.readByte(this.HL));
                return 8; // OR (HL)

            case 0xB7:
                this.orA(this.a);
                return 4; // OR A


            case 0xB8:
                this.cpA(this.b);
                return 4; // CP B

            case 0xB9:
                this.cpA(this.c);
                return 4; // CP C

            case 0xBA:
                this.cpA(this.d);
                return 4; // CP D

            case 0xBB:
                this.cpA(this.e);
                return 4; // CP E

            case 0xBC:
                this.cpA(this.h);
                return 4; // CP H

            case 0xBD:
                this.cpA(this.l);
                return 4; // CP L

            case 0xBE:
                this.cpA(this.readByte(this.HL));
                return 8; // CP (HL)

            case 0xBF:
                this.cpA(this.a);
                return 4; // CP A


            // =====================================================
            // 5. 16-bit 加減
            // =====================================================

            case 0x03:
                // BC = BC + 1
                this.BC = (this.BC + 1) & 0xFFFF;
                return 8; // INC BC

            case 0x13:
                // DE = DE + 1
                this.DE = (this.DE + 1) & 0xFFFF;
                return 8; // INC DE

            case 0x23:
                // HL = HL + 1
                this.HL = (this.HL + 1) & 0xFFFF;
                return 8; // INC HL

            case 0x33:
                // SP = SP + 1
                this.sp = (this.sp + 1) & 0xFFFF;
                return 8; // INC SP


            case 0x0B:
                // BC = BC - 1
                this.BC = (this.BC - 1) & 0xFFFF;
                return 8; // DEC BC

            case 0x1B:
                // DE = DE - 1
                this.DE = (this.DE - 1) & 0xFFFF;
                return 8; // DEC DE

            case 0x2B:
                // HL = HL - 1
                this.HL = (this.HL - 1) & 0xFFFF;
                return 8; // DEC HL

            case 0x3B:
                // SP = SP - 1
                this.sp = (this.sp - 1) & 0xFFFF;
                return 8; // DEC SP


            case 0x09:
                // HL = HL + BC
                // addHL() 會幫忙處理 16-bit 加法與旗標
                this.addHL(this.BC);
                return 8; // ADD HL,BC

            case 0x19:
                // HL = HL + DE
                this.addHL(this.DE);
                return 8; // ADD HL,DE

            case 0x29:
                // HL = HL + HL
                this.addHL(this.HL);
                return 8; // ADD HL,HL

            case 0x39:
                // HL = HL + SP
                this.addHL(this.sp);
                return 8; // ADD HL,SP


            case 0xE8: {
                // 讀取一個 8-bit 有號數值
                const n = this.readPC8();
                const e = this.signed8(n);

                // 暫存舊的 SP
                const sp = this.sp;

                // 做 SP + e
                const r = (sp + e) & 0xFFFF;

                // 設定旗標：
                // Z = 0
                // N = 0
                // H / C 看低位加法是否進位
                this.setZNHC(
                    false,
                    false,
                    ((sp & 0x0F) + (n & 0x0F)) > 0x0F,
                    ((sp & 0xFF) + (n & 0xFF)) > 0xFF
                );

                // 把結果寫回 SP
                this.sp = r;
                return 16; // ADD SP,r8
            }


            // =====================================================
            // 6. 旋轉、旗標與特殊 A 操作
            // =====================================================

            case 0x07: {
                // RLCA = Rotate Left Circular Accumulator
                // 中文可理解成：A 向左循環旋轉 1 bit

                // 先取出最高 bit（bit 7），之後它會變成新的 Carry
                const c = (this.a >>> 7) & 1;

                // A 左移 1 位，原本的 bit 7 轉到 bit 0
                this.a = ((this.a << 1) | c) & 0xFF;

                // 設定旗標：
                // Z=0, N=0, H=0, C=原本 bit7
                this.setZNHC(false, false, false, c === 1);
                return 4;
            }

            case 0x0F: {
                // RRCA = Rotate Right Circular Accumulator
                // A 向右循環旋轉 1 bit

                // 取出最低 bit（bit 0）
                const c = this.a & 1;

                // A 右移 1 位，原本的 bit 0 轉到 bit 7
                this.a = ((c << 7) | (this.a >>> 1)) & 0xFF;

                // 更新旗標
                this.setZNHC(false, false, false, c === 1);
                return 4;
            }

            case 0x17: {
                // RLA = Rotate Left through Carry
                // 經過 Carry 的左旋轉

                // 先取目前 Carry flag，等一下會塞到 bit 0
                const cIn = this.getFlag(this.FLAG_C) ? 1 : 0;

                // 先記住原本 bit 7，因為它會變成新的 Carry
                const cOut = (this.a >>> 7) & 1;

                // 左移後，把舊 Carry 放進 bit 0
                this.a = ((this.a << 1) | cIn) & 0xFF;

                // 更新旗標
                this.setZNHC(false, false, false, cOut === 1);
                return 4;
            }

            case 0x1F: {
                // RRA = Rotate Right through Carry
                // 經過 Carry 的右旋轉

                // 舊 Carry 等一下會放進 bit 7
                const cIn = this.getFlag(this.FLAG_C) ? 1 : 0;

                // 原本 bit 0 會變成新的 Carry
                const cOut = this.a & 1;

                // 右移後，把舊 Carry 放進 bit 7
                this.a = ((cIn << 7) | (this.a >>> 1)) & 0xFF;

                // 更新旗標
                this.setZNHC(false, false, false, cOut === 1);
                return 4;
            }

            case 0x27:
                // DAA = Decimal Adjust Accumulator
                // 中文常翻成：十進位校正
                // 主要用在 BCD（Binary-Coded Decimal，二進位編碼十進位）
                // 對新手來說可先理解成：
                // 前一個加減法做完後，把 A 調整成合法的 BCD 結果
                this.daa();
                return 4;

            case 0x2F:
                // CPL = Complement A（A 取反）
                // 把 A 每一個 bit 顛倒，0 變 1，1 變 0
                this.a ^= 0xFF;

                // 這條指令會把 N 與 H 設成 1
                this.setFlag(this.FLAG_N, true);
                this.setFlag(this.FLAG_H, true);
                return 4;

            case 0x37:
                // SCF = Set Carry Flag（把 Carry 設為 1）
                this.setFlag(this.FLAG_N, false);
                this.setFlag(this.FLAG_H, false);
                this.setFlag(this.FLAG_C, true);
                return 4;

            case 0x3F:
                // CCF = Complement Carry Flag（Carry 取反）
                // 如果原本 C=1，就變 0；原本 C=0，就變 1
                this.setFlag(this.FLAG_N, false);
                this.setFlag(this.FLAG_H, false);
                this.setFlag(this.FLAG_C, !this.getFlag(this.FLAG_C));
                return 4;


            // =====================================================
            // 7. 跳躍、呼叫、返回、重啟
            // =====================================================

            case 0x18: {
                // JR = Jump Relative（相對跳躍）
                // 不是直接跳到絕對位址，而是 PC 再加上一個正負偏移量
                const e = this.signed8(this.readPC8());

                // 把 PC 加上偏移量
                this.pc = (this.pc + e) & 0xFFFF;
                return 12;
            }

            case 0x20: {
                // JR NZ,r8
                // NZ = Not Zero（Z flag 為 0）
                const e = this.signed8(this.readPC8());

                // 只有當 Z flag 沒有被設為 1 時才跳
                if (!this.getFlag(this.FLAG_Z)) {
                    this.pc = (this.pc + e) & 0xFFFF;
                    return 12;
                }

                // 條件不成立就不跳，只消耗較少 cycle
                return 8;
            }

            case 0x28: {
                // JR Z,r8
                // 當 Z flag = 1 時才跳
                const e = this.signed8(this.readPC8());
                if (this.getFlag(this.FLAG_Z)) {
                    this.pc = (this.pc + e) & 0xFFFF;
                    return 12;
                }
                return 8;
            }

            case 0x30: {
                // JR NC,r8
                // NC = Not Carry（C flag = 0）
                const e = this.signed8(this.readPC8());
                if (!this.getFlag(this.FLAG_C)) {
                    this.pc = (this.pc + e) & 0xFFFF;
                    return 12;
                }
                return 8;
            }

            case 0x38: {
                // JR C,r8
                // 當 Carry flag = 1 時才跳
                const e = this.signed8(this.readPC8());
                if (this.getFlag(this.FLAG_C)) {
                    this.pc = (this.pc + e) & 0xFFFF;
                    return 12;
                }
                return 8;
            }

            case 0xC3:
                // JP = Jump（絕對跳躍）
                // 直接把 PC 改成新的 16-bit 位址
                this.pc = this.readPC16();
                return 16; // JP a16

            case 0xC2: {
                // JP NZ,a16
                const addr = this.readPC16();
                if (!this.getFlag(this.FLAG_Z)) {
                    this.pc = addr;
                    return 16;
                }
                return 12;
            }

            case 0xCA: {
                // JP Z,a16
                const addr = this.readPC16();
                if (this.getFlag(this.FLAG_Z)) {
                    this.pc = addr;
                    return 16;
                }
                return 12;
            }

            case 0xD2: {
                // JP NC,a16
                const addr = this.readPC16();
                if (!this.getFlag(this.FLAG_C)) {
                    this.pc = addr;
                    return 16;
                }
                return 12;
            }

            case 0xDA: {
                // JP C,a16
                const addr = this.readPC16();
                if (this.getFlag(this.FLAG_C)) {
                    this.pc = addr;
                    return 16;
                }
                return 12;
            }

            case 0xE9:
                // JP (HL)
                // 不是讀記憶體內容，而是直接把 HL 當成新的 PC
                this.pc = this.HL;
                return 4;

            case 0xCD: {
                // CALL = 呼叫副程式 / 函式
                // 做兩件事：
                // 1. 先把「回來的位置」壓進 stack（堆疊）
                // 2. 再跳到新的位址
                const addr = this.readPC16();

                // 此時 PC 已經指向 CALL 後面的下一條指令
                // 這個位置就是之後 RET 要回來的地方
                this.push16(this.pc);

                // 跳到目標位址
                this.pc = addr;
                return 24;
            }

            case 0xC4: {
                // CALL NZ,a16
                const addr = this.readPC16();
                if (!this.getFlag(this.FLAG_Z)) {
                    this.push16(this.pc);
                    this.pc = addr;
                    return 24;
                }
                return 12;
            }

            case 0xCC: {
                // CALL Z,a16
                const addr = this.readPC16();
                if (this.getFlag(this.FLAG_Z)) {
                    this.push16(this.pc);
                    this.pc = addr;
                    return 24;
                }
                return 12;
            }

            case 0xD4: {
                // CALL NC,a16
                const addr = this.readPC16();
                if (!this.getFlag(this.FLAG_C)) {
                    this.push16(this.pc);
                    this.pc = addr;
                    return 24;
                }
                return 12;
            }

            case 0xDC: {
                // CALL C,a16
                const addr = this.readPC16();
                if (this.getFlag(this.FLAG_C)) {
                    this.push16(this.pc);
                    this.pc = addr;
                    return 24;
                }
                return 12;
            }

            case 0xC9:
                // RET = Return（返回）
                // 從 stack 彈出先前 CALL 存的位址，回到原本流程
                this.pc = this.pop16();
                return 16;

            case 0xC0:
                // RET NZ
                if (!this.getFlag(this.FLAG_Z)) {
                    this.pc = this.pop16();
                    return 20;
                }
                return 8;

            case 0xC8:
                // RET Z
                if (this.getFlag(this.FLAG_Z)) {
                    this.pc = this.pop16();
                    return 20;
                }
                return 8;

            case 0xD0:
                // RET NC
                if (!this.getFlag(this.FLAG_C)) {
                    this.pc = this.pop16();
                    return 20;
                }
                return 8;

            case 0xD8:
                // RET C
                if (this.getFlag(this.FLAG_C)) {
                    this.pc = this.pop16();
                    return 20;
                }
                return 8;

            case 0xD9:
                // RETI = Return and Enable Interrupts
                // 返回後，同時把中斷打開
                this.pc = this.pop16();
                this.ime = 1;
                return 16;

            case 0xC7:
                // RST = Restart
                // 可理解成「快速 CALL 到固定地址」
                this.push16(this.pc);
                this.pc = 0x00;
                return 16; // RST 00H

            case 0xCF:
                this.push16(this.pc);
                this.pc = 0x08;
                return 16; // RST 08H

            case 0xD7:
                this.push16(this.pc);
                this.pc = 0x10;
                return 16; // RST 10H

            case 0xDF:
                this.push16(this.pc);
                this.pc = 0x18;
                return 16; // RST 18H

            case 0xE7:
                this.push16(this.pc);
                this.pc = 0x20;
                return 16; // RST 20H

            case 0xEF:
                this.push16(this.pc);
                this.pc = 0x28;
                return 16; // RST 28H

            case 0xF7:
                this.push16(this.pc);
                this.pc = 0x30;
                return 16; // RST 30H

            case 0xFF:
                this.push16(this.pc);
                this.pc = 0x38;
                return 16; // RST 38H


            // =====================================================
            // 8. 堆疊操作
            // =====================================================

            case 0xC1:
                // POP = 從 stack 取出 16-bit 值
                // 取出後放到 BC
                this.BC = this.pop16();
                return 12; // POP BC

            case 0xD1:
                // 從 stack 取出值放到 DE
                this.DE = this.pop16();
                return 12; // POP DE

            case 0xE1:
                // 從 stack 取出值放到 HL
                this.HL = this.pop16();
                return 12; // POP HL

            case 0xF1:
                // 從 stack 取出值放到 AF
                // AF = A + F（Flags Register，旗標暫存器）
                this.AF = this.pop16();
                return 12; // POP AF


            case 0xC5:
                // PUSH = 把 16-bit 值壓進 stack
                this.push16(this.BC);
                return 16; // PUSH BC

            case 0xD5:
                // 把 DE 壓進 stack
                this.push16(this.DE);
                return 16; // PUSH DE

            case 0xE5:
                // 把 HL 壓進 stack
                this.push16(this.HL);
                return 16; // PUSH HL

            case 0xF5:
                // 把 AF 壓進 stack
                this.push16(this.AF);
                return 16; // PUSH AF


            // =====================================================
            // 9. 高位址 I/O 與特殊記憶體載入
            // =====================================================

            case 0xE0: {
                // LDH = Load High
                // 專門用在 0xFF00 ~ 0xFFFF 這種高位址 I/O 區
                const a8 = this.readPC8();

                // 0xFF00 + a8 就是 I/O Registers（I/O 暫存器）區域
                this.writeByte(0xFF00 + a8, this.a);
                return 12; // LDH (a8),A
            }

            case 0xF0: {
                // 從高位址 I/O 區讀值回 A
                const a8 = this.readPC8();
                this.a = this.readByte(0xFF00 + a8);
                return 12; // LDH A,(a8)
            }

            case 0xE2:
                // 使用 C 作為偏移量
                // 等於寫到 0xFF00 + C
                this.writeByte(0xFF00 + this.c, this.a);
                return 8; // LD (C),A

            case 0xF2:
                // 從 0xFF00 + C 讀值回 A
                this.a = this.readByte(0xFF00 + this.c);
                return 8; // LD A,(C)

            case 0xEA: {
                // 把 A 寫到一個 16-bit 絕對位址
                const addr = this.readPC16();
                this.writeByte(addr, this.a);
                return 16; // LD (a16),A
            }

            case 0xFA: {
                // 從一個 16-bit 絕對位址讀值到 A
                const addr = this.readPC16();
                this.a = this.readByte(addr);
                return 16; // LD A,(a16)
            }


            // =====================================================
            // 10. CB 前綴
            // =====================================================

            case 0xCB:
                // 0xCB 不是單一完整指令
                // 它代表「接下來還要再讀 1 個 opcode」
                // 然後進入另一張 CB opcode 表處理
                return this.execCB(this.readPC8());


            // =====================================================
            // 11. 未實作 / 未知 opcode
            // =====================================================

            default:
                // 如果跑到這裡，代表這個 opcode 目前還沒有實作
                // 交給 unknownOpcode() 統一處理
                return this.unknownOpcode(opcode);
        }
    }

    // =========================================================
    // CPU 每一步（step）
    // 一次執行一個 instruction 或一次中斷處理
    // =========================================================

    step() {
        // 先看是否要處理中斷
        const intCycles = this.serviceInterrupts();
        if (intCycles > 0) {
            // 記錄 cycles
            this.cycles += intCycles;

            // 通知整台主機，其他硬體也要跟著跑這些 cycles
            this.gb.tick(intCycles);

            return intCycles;
        }

        // 如果 CPU 在 HALT 狀態
        if (this.halted) {
            // HALT 狀態下，CPU 不取新指令，只是空轉
            const idle = 4;
            this.cycles += idle;
            this.gb.tick(idle);
            return idle;
        }

        // 讀 opcode
        const opcode = this.readPC8();

        // 執行 opcode，拿到這條指令用了多少 cycle
        const used = this.executeOpcode(opcode);

        // 累積 cycle
        this.cycles += used;

        // 讓其他硬體同步前進
        this.gb.tick(used);

        if (this.imeEnablePending > 0) {
            this.imeEnablePending--;
            if (this.imeEnablePending === 0) {
                this.ime = 1;
            }
        }

        return used;
    }
}
