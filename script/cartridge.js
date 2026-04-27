export class Cartridge {
    constructor() {
        this.romBuffer = null;
        this.rom = null;
        this.romView = null;
        this.header = {
            gameName: null,
            mapperType: null,
            cartridgeType: null,
            bankNumber: null,
            ramSize: null,
            logoBytes: null,
            hasRam: false,
            hasBattery: false,
            hasRumble: false,
            hasTimer: false,

        }

        this.sram = null;
        this.mapperState = null;
        this.saveKey = null;
        this.saveDirty = false;
        this.saveFlushTimer = null;
    }
    createMapperState() {
        return {
            ramEnabled: false,
            romBankLow: 0x01,
            romBankHigh: 0x00,
            ramBank: 0x00,
            bankingMode: 0x00,
            rtcLatch: 0x00,
            rtcRegister: 0x08,
            rtcValue: 0x00,
            rumbleEnabled: false
        };
    }
    resetMapperState() {
        this.mapperState = this.createMapperState();
    }
    getCartridgeTypeCode() {
        return this.rom?.[0x0147] ?? 0x00;
    }
    getMapperConfig(cartridgeType = this.getCartridgeTypeCode()) {
        switch (cartridgeType) {
            case 0x00:
                return {
                    mapperType: 'romOnly',
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: false,
                    isMBC5: false
                };
            case 0x01:
                return {
                    mapperType: 'MBC1',
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: true,
                    isMBC3: false,
                    isMBC5: false
                };
            case 0x02:
                return {
                    mapperType: 'MBC1RAM',
                    hasRam: true,
                    hasBattery: false,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: true,
                    isMBC3: false,
                    isMBC5: false
                };
            case 0x03:
                return {
                    mapperType: 'MBC1RAMBattery',
                    hasRam: true,
                    hasBattery: true,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: true,
                    isMBC3: false,
                    isMBC5: false
                };
            case 0x0F:
                return {
                    mapperType: 'MBC3TimerBattery',
                    hasRam: false,
                    hasBattery: true,
                    hasRumble: false,
                    hasTimer: true,
                    isMBC1: false,
                    isMBC3: true,
                    isMBC5: false
                };
            case 0x10:
                return {
                    mapperType: 'MBC3TimerRAMBattery',
                    hasRam: true,
                    hasBattery: true,
                    hasRumble: false,
                    hasTimer: true,
                    isMBC1: false,
                    isMBC3: true,
                    isMBC5: false
                };
            case 0x11:
                return {
                    mapperType: 'MBC3',
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: true,
                    isMBC5: false
                };
            case 0x12:
                return {
                    mapperType: 'MBC3RAM',
                    hasRam: true,
                    hasBattery: false,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: true,
                    isMBC5: false
                };
            case 0x13:
                return {
                    mapperType: 'MBC3RAMBattery',
                    hasRam: true,
                    hasBattery: true,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: true,
                    isMBC5: false
                };
            case 0x19:
                return {
                    mapperType: 'MBC5',
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: false,
                    isMBC5: true
                };
            case 0x1A:
                return {
                    mapperType: 'MBC5RAM',
                    hasRam: true,
                    hasBattery: false,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: false,
                    isMBC5: true
                };
            case 0x1B:
                return {
                    mapperType: 'MBC5RAMBattery',
                    hasRam: true,
                    hasBattery: true,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: false,
                    isMBC5: true
                };
            case 0x1C:
                return {
                    mapperType: 'MBC5Rumble',
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: true,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: false,
                    isMBC5: true
                };
            case 0x1D:
                return {
                    mapperType: 'MBC5RumbleRAM',
                    hasRam: true,
                    hasBattery: false,
                    hasRumble: true,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: false,
                    isMBC5: true
                };
            case 0x1E:
                return {
                    mapperType: 'MBC5RumbleRAMBattery',
                    hasRam: true,
                    hasBattery: true,
                    hasRumble: true,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: false,
                    isMBC5: true
                };
            default:
                return {
                    mapperType: `unsupportedMapper:0x${cartridgeType.toString(16).padStart(2, '0')}`,
                    hasRam: false,
                    hasBattery: false,
                    hasRumble: false,
                    hasTimer: false,
                    isMBC1: false,
                    isMBC3: false,
                    isMBC5: false
                };
        }
    }
    isMBC1() {
        return this.getMapperConfig().isMBC1;
    }
    isMBC3() {
        return this.getMapperConfig().isMBC3;
    }
    isMBC5() {
        return this.getMapperConfig().isMBC5;
    }
    getRomBankCount() {
        if (Number.isInteger(this.header.bankNumber) && this.header.bankNumber > 0) {
            return this.header.bankNumber;
        }
        return Math.max(1, Math.ceil((this.rom?.length ?? 0) / 0x4000));
    }
    getRamBankCount() {
        if (!this.sram) {
            return 0;
        }
        return Math.max(1, Math.ceil(this.sram.length / 0x2000));
    }
    getCurrentROMBank() {
        const bank = ((this.mapperState.romBankHigh & 0x01) << 8) | this.mapperState.romBankLow;
        return bank % this.getRomBankCount();
    }
    getCurrentRAMBank() {
        const bankCount = this.getRamBankCount();
        if (bankCount === 0) {
            return 0;
        }
        return this.mapperState.ramBank % bankCount;
    }
    getBankedRAMOffset(addr) {
        return (this.getCurrentRAMBank() * 0x2000) + (addr - 0xA000);
    }
    hasBatteryBackedRAM() {
        return !!(this.sram && this.header.hasRam && this.header.hasBattery);
    }
    canUseLocalStorage() {
        try {
            return typeof localStorage !== 'undefined';
        } catch (err) {
            return false;
        }
    }
    createBatterySaveKey(saveName = null) {
        const title = this.header.gameName || 'unknown';
        const cartType = this.header.cartridgeType?.toString(16).padStart(2, '0') ?? '00';
        const romSize = this.rom?.length ?? 0;
        const ramSize = this.sram?.length ?? 0;
        const source = saveName || title;
        return `gbemu:sram:${source}:${title}:${cartType}:${romSize}:${ramSize}`;
    }
    bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }
    base64ToBytes(data, length) {
        const binary = atob(data);
        const bytes = new Uint8Array(length);
        const copyLength = Math.min(binary.length, length);
        for (let i = 0; i < copyLength; i++) {
            bytes[i] = binary.charCodeAt(i) & 0xFF;
        }
        return bytes;
    }
    restoreBatterySave(saveName = null) {
        this.saveKey = null;
        this.saveDirty = false;
        if (!this.hasBatteryBackedRAM() || !this.canUseLocalStorage()) {
            return;
        }

        this.saveKey = this.createBatterySaveKey(saveName);
        let saved = null;
        try {
            saved = localStorage.getItem(this.saveKey);
        } catch (err) {
            console.warn('SRAM 存檔讀取失敗:', err);
            return;
        }
        if (!saved) {
            return;
        }

        try {
            this.sram.set(this.base64ToBytes(saved, this.sram.length));
        } catch (err) {
            console.warn('SRAM 存檔讀取失敗:', err);
        }
    }
    scheduleBatterySave() {
        if (!this.hasBatteryBackedRAM() || !this.saveKey || !this.canUseLocalStorage()) {
            return;
        }

        this.saveDirty = true;
        if (this.saveFlushTimer !== null) {
            return;
        }

        this.saveFlushTimer = setTimeout(() => this.flushBatterySave(), 250);
    }
    flushBatterySave() {
        if (this.saveFlushTimer !== null) {
            clearTimeout(this.saveFlushTimer);
            this.saveFlushTimer = null;
        }

        if (!this.saveDirty || !this.hasBatteryBackedRAM() || !this.saveKey || !this.canUseLocalStorage()) {
            return;
        }

        try {
            localStorage.setItem(this.saveKey, this.bytesToBase64(this.sram));
            this.saveDirty = false;
        } catch (err) {
            console.warn('SRAM 存檔寫入失敗:', err);
        }
    }
    writeSRAMOffset(offset, value) {
        if (!this.sram || offset < 0 || offset >= this.sram.length) {
            return;
        }

        this.sram[offset] = value;
        this.scheduleBatterySave();
    }
    getMBC1UpperBankBits() {
        return (this.mapperState.romBankHigh & 0x03) << 5;
    }
    getMBC1LowerROMBankBits() {
        const bank = this.mapperState.romBankLow & 0x1F;
        return bank === 0 ? 1 : bank;
    }
    getCurrentMBC1FixedROMBank() {
        const bankCount = this.getRomBankCount();
        if (this.mapperState.bankingMode === 0 || bankCount === 0) {
            return 0;
        }
        return this.getMBC1UpperBankBits() % bankCount;
    }
    getCurrentMBC1SwitchableROMBank() {
        const bank = this.getMBC1UpperBankBits() | this.getMBC1LowerROMBankBits();
        return bank % this.getRomBankCount();
    }
    getCurrentMBC1RAMBank() {
        const bankCount = this.getRamBankCount();
        if (bankCount === 0 || this.mapperState.bankingMode === 0) {
            return 0;
        }
        return (this.mapperState.romBankHigh & 0x03) % bankCount;
    }
    getMBC1BankedRAMOffset(addr) {
        return (this.getCurrentMBC1RAMBank() * 0x2000) + (addr - 0xA000);
    }
    readMBC1Byte(addr) {
        if (addr < 0x4000) {
            const offset = (this.getCurrentMBC1FixedROMBank() * 0x4000) + addr;
            return this.rom?.[offset] ?? 0;
        }
        if (addr < 0x8000) {
            const offset = (this.getCurrentMBC1SwitchableROMBank() * 0x4000) + (addr - 0x4000);
            return this.rom?.[offset] ?? 0;
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            if (!this.sram || !this.mapperState.ramEnabled) {
                return 0xFF;
            }
            return this.sram[this.getMBC1BankedRAMOffset(addr)] ?? 0xFF;
        }
        throw new Error(`卡帶位置read錯誤: 0x${addr.toString(16).padStart(4, '0')}`);
    }
    writeMBC1(addr, value) {
        if (addr < 0x2000) {
            this.mapperState.ramEnabled = (value & 0x0F) === 0x0A;
            return;
        }
        if (addr < 0x4000) {
            this.mapperState.romBankLow = value & 0x1F;
            return;
        }
        if (addr < 0x6000) {
            const bank = value & 0x03;
            this.mapperState.romBankHigh = bank;
            this.mapperState.ramBank = bank;
            return;
        }
        if (addr < 0x8000) {
            this.mapperState.bankingMode = value & 0x01;
        }
    }
    getCurrentMBC3ROMBank() {
        const bank = this.mapperState.romBankLow & 0x7F;
        return (bank === 0 ? 1 : bank) % this.getRomBankCount();
    }
    getCurrentMBC3RAMBank() {
        return this.mapperState.ramBank & 0x0F;
    }
    getMBC3BankedRAMOffset(addr) {
        return (this.getCurrentMBC3RAMBank() * 0x2000) + (addr - 0xA000);
    }
    getMBC3RTCRegisters() {
        const totalSeconds = Math.floor(Date.now() / 1000);
        const seconds = totalSeconds % 60;
        const minutes = Math.floor(totalSeconds / 60) % 60;
        const hours = Math.floor(totalSeconds / 3600) % 24;
        const days = Math.floor(totalSeconds / 86400) & 0x1FF;

        return {
            0x08: seconds,
            0x09: minutes,
            0x0A: hours,
            0x0B: days & 0xFF,
            0x0C: (days >>> 8) & 0x01
        };
    }
    readMBC3RTCRegister(register) {
        const { hasTimer } = this.getMapperConfig();
        if (!hasTimer || register < 0x08 || register > 0x0C) {
            return 0xFF;
        }

        return this.getMBC3RTCRegisters()[register] ?? 0xFF;
    }
    writeMBC3RTCRegister(register, value) {
        const { hasTimer } = this.getMapperConfig();
        if (!hasTimer || register < 0x08 || register > 0x0C) {
            return;
        }

        // 先提供可讀 RTC，寫入 halt/carry 等狀態暫時忽略，避免 RTC 遊戲卡死在未支援暫存器。
        this.mapperState.rtcRegister = register;
        this.mapperState.rtcValue = value & 0xFF;
    }
    readMBC3Byte(addr) {
        if (addr < 0x4000) {
            return this.rom?.[addr] ?? 0;
        }
        if (addr < 0x8000) {
            const offset = (this.getCurrentMBC3ROMBank() * 0x4000) + (addr - 0x4000);
            return this.rom?.[offset] ?? 0;
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            if (!this.mapperState.ramEnabled) {
                return 0xFF;
            }

            const ramBank = this.getCurrentMBC3RAMBank();
            if (ramBank <= 0x03) {
                if (!this.sram) {
                    return 0xFF;
                }
                return this.sram[this.getMBC3BankedRAMOffset(addr)] ?? 0xFF;
            }

            return this.readMBC3RTCRegister(ramBank);
        }
        throw new Error(`卡帶位置read錯誤: 0x${addr.toString(16).padStart(4, '0')}`);
    }
    writeMBC3(addr, value) {
        if (addr < 0x2000) {
            this.mapperState.ramEnabled = (value & 0x0F) === 0x0A;
            return;
        }
        if (addr < 0x4000) {
            this.mapperState.romBankLow = value & 0x7F;
            return;
        }
        if (addr < 0x6000) {
            this.mapperState.ramBank = value & 0x0F;
            return;
        }
        if (addr < 0x8000) {
            this.mapperState.rtcLatch = value & 0x01;
        }
    }
    readMBC5Byte(addr) {
        if (addr < 0x4000) {
            return this.rom?.[addr] ?? 0;
        }
        if (addr < 0x8000) {
            const offset = (this.getCurrentROMBank() * 0x4000) + (addr - 0x4000);
            return this.rom?.[offset] ?? 0;
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            if (!this.sram || !this.mapperState.ramEnabled) {
                return 0xFF;
            }
            return this.sram[this.getBankedRAMOffset(addr)] ?? 0xFF;
        }
        throw new Error(`卡帶位置read錯誤: 0x${addr.toString(16).padStart(4, '0')}`);
    }
    writeMBC5(addr, value) {
        if (addr < 0x2000) {
            this.mapperState.ramEnabled = (value & 0x0F) === 0x0A;
            return;
        }
        if (addr < 0x3000) {
            this.mapperState.romBankLow = value;
            return;
        }
        if (addr < 0x4000) {
            this.mapperState.romBankHigh = value & 0x01;
            return;
        }
        if (addr < 0x6000) {
            const { hasRumble } = this.getMapperConfig();
            if (hasRumble) {
                this.mapperState.rumbleEnabled = (value & 0x08) !== 0;
                this.mapperState.ramBank = value & 0x07;
            } else {
                this.mapperState.ramBank = value & 0x0F;
            }
            return;
        }
    }
    writeBankedRAM(addr, value) {
        if (!this.sram) {
            return;
        }
        this.writeSRAMOffset(this.getBankedRAMOffset(addr), value);
    }
    readByte(addr) {
        addr &= 0xFFFF;
        if (this.isMBC1()) {
            return this.readMBC1Byte(addr);
        }
        if (this.isMBC3()) {
            return this.readMBC3Byte(addr);
        }
        if (this.isMBC5()) {
            return this.readMBC5Byte(addr);
        }
        if (addr < 0x8000) {
            return this.rom?.[addr] ?? 0;
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            addr -= 0xA000;
            return this.sram?.[addr] ?? 0;
        }
        throw new Error(`卡帶位置read錯誤: 0x${addr.toString(16).padStart(4, '0')}`);

    }
    writeByte(addr, value) {
        addr &= 0xFFFF;
        value &= 0xFF;
        if (this.isMBC1()) {
            if (addr < 0x8000) {
                this.writeMBC1(addr, value);
                return;
            }
            if (addr >= 0xA000 && addr < 0xC000) {
                if (this.sram && this.mapperState.ramEnabled) {
                    this.writeSRAMOffset(this.getMBC1BankedRAMOffset(addr), value);
                }
                return;
            }
        }
        if (this.isMBC3()) {
            if (addr < 0x8000) {
                this.writeMBC3(addr, value);
                return;
            }
            if (addr >= 0xA000 && addr < 0xC000) {
                if (this.mapperState.ramEnabled) {
                    const ramBank = this.getCurrentMBC3RAMBank();
                    if (ramBank <= 0x03) {
                        this.writeSRAMOffset(this.getMBC3BankedRAMOffset(addr), value);
                    } else {
                        this.writeMBC3RTCRegister(ramBank, value);
                    }
                }
                return;
            }
        }
        if (this.isMBC5()) {
            if (addr < 0x8000) {
                this.writeMBC5(addr, value);
                return;
            }
            if (addr >= 0xA000 && addr < 0xC000) {
                if (this.mapperState.ramEnabled) {
                    this.writeBankedRAM(addr, value);
                }
                return;
            }
        }
        if (addr >= 0xA000 && addr < 0xC000) {
            addr -= 0xA000;
            if (this.sram) {
                this.writeSRAMOffset(addr, value);
            }
        }
    }
    readWord(addr, littleEndian = true) {
        addr &= 0xFFFF;
        const b0 = this.readByte(addr);
        const b1 = this.readByte((addr + 1) & 0xFFFF);

        return littleEndian ? ((b1 << 8) | b0) & 0xFFFF : ((b0 << 8) | b1) & 0xFFFF;

    }
    parseGameName() {
        const bytes = [];
        for (let i = 0x0134; i < 0x0144; i++) {
            const b = this.readByte(i);
            if (b === 0) break;
            bytes.push(b);
        }
        const gameName = new TextDecoder('ascii').decode(new Uint8Array(bytes));
        return gameName;
    }
    parseBankNumber() {
        switch (this.readByte(0x0148)) {
            case 0x00: return 2;
            case 0x01: return 4;
            case 0x02: return 8;
            case 0x03: return 16;
            case 0x04: return 32;
            case 0x05: return 64;
            case 0x06: return 128;
            case 0x07: return 256;
            case 0x08: return 512;
            case 0x52: return 72;
            case 0x53: return 80;
            case 0x54: return 96;
            default:
                return Math.max(1, Math.ceil((this.rom?.length ?? 0) / 0x4000));
        }
    }
    parseRamSize() {
        switch (this.readByte(0x0149)) {
            case 0x00:
                this.sram = null;
                return 0;
            case 0x01:
                this.sram = new Uint8Array(2048);
                return this.sram.length;
            case 0x02:
                this.sram = new Uint8Array(8192);
                return this.sram.length;
            case 0x03:
                this.sram = new Uint8Array(32768);
                return this.sram.length;
            case 0x04:
                this.sram = new Uint8Array(131072);
                return this.sram.length;
            case 0x05:
                this.sram = new Uint8Array(65536);
                return this.sram.length;
            default:
                this.sram = null;
                return -1;

        }


    }
    parseLogoBytes() {
        if (!this.rom) {
            return null;
        }
        return this.rom.slice(0x0104, 0x0134);
    }

    setHeaderDetail() {
        const mapperConfig = this.getMapperConfig();
        this.header = {
            gameName: this.parseGameName(),
            mapperType: mapperConfig.mapperType,
            cartridgeType: this.getCartridgeTypeCode(),
            bankNumber: this.parseBankNumber(),
            ramSize: this.parseRamSize(),
            logoBytes: this.parseLogoBytes(),
            hasRam: mapperConfig.hasRam,
            hasBattery: mapperConfig.hasBattery,
            hasRumble: mapperConfig.hasRumble,
            hasTimer: mapperConfig.hasTimer
        }


    }
    async loadROM(romFile, { saveName = null } = {}) {
        try {
            const res = await fetch(romFile);
            if (!res.ok) {
                throw new Error(`讀取 ROM 失敗: HTTP ${res.status} ${res.statusText}`);
            }
            this.romBuffer = await res.arrayBuffer();
            this.rom = new Uint8Array(this.romBuffer);
            this.romView = new DataView(this.romBuffer);
            this.resetMapperState();
            this.setHeaderDetail();
            this.restoreBatterySave(saveName);

        } catch (err) {
            throw new Error(`載入失敗： ${err.message}`);
        }

    }
}
