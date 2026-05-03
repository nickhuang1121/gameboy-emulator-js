import { GB } from './gb.js';

const canvas = document.querySelector('#bootLogo');
const ctx = canvas.getContext('2d');
const joypad = document.querySelector('#joypad');

const CYCLES_PER_FRAME = 70224;
const SCREEN_W = 160;
const SCREEN_H = 144;
const SCREEN_SCALE = 2;

const DEFAULT_ROM = 'book_demo.gb';

const INPUT_CONTROLS = [
    { button: 'up', action: '方向上', key: 'ArrowUp', code: 'ArrowUp' },
    { button: 'down', action: '方向下', key: 'ArrowDown', code: 'ArrowDown' },
    { button: 'left', action: '方向左', key: 'ArrowLeft', code: 'ArrowLeft' },
    { button: 'right', action: '方向右', key: 'ArrowRight', code: 'ArrowRight' },
    { button: 'a', action: 'A / 決定', key: 'Z', code: 'KeyZ' },
    { button: 'b', action: 'B / 取消', key: 'X', code: 'KeyX' },
    { button: 'start', action: 'Start / 選單', key: 'Enter', code: 'Enter' },
    { button: 'select', action: 'Select / 選擇', key: 'Shift', code: 'ShiftLeft' },
];

const r8Names = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const r16Names = ['BC', 'DE', 'HL', 'SP'];
const conditions = ['NZ', 'Z', 'NC', 'C'];
const aluNames = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const cbRotateNames = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SWAP', 'SRL'];

const SIMPLE_OPS = new Map([
    [0x00, 'NOP'],
    [0x02, 'LD (BC),A'],
    [0x07, 'RLCA'],
    [0x0A, 'LD A,(BC)'],
    [0x0F, 'RRCA'],
    [0x10, 'STOP 0'],
    [0x12, 'LD (DE),A'],
    [0x17, 'RLA'],
    [0x1A, 'LD A,(DE)'],
    [0x1F, 'RRA'],
    [0x22, 'LD (HL+),A'],
    [0x27, 'DAA'],
    [0x2A, 'LD A,(HL+)'],
    [0x2F, 'CPL'],
    [0x32, 'LD (HL-),A'],
    [0x37, 'SCF'],
    [0x3A, 'LD A,(HL-)'],
    [0x3F, 'CCF'],
    [0x76, 'HALT'],
    [0xC9, 'RET'],
    [0xD9, 'RETI'],
    [0xE0, 'LDH (a8),A'],
    [0xE2, 'LD (C),A'],
    [0xE9, 'JP HL'],
    [0xF0, 'LDH A,(a8)'],
    [0xF2, 'LD A,(C)'],
    [0xF3, 'DI'],
    [0xF9, 'LD SP,HL'],
    [0xFB, 'EI'],
]);

const IMM8_OPS = new Set([
    0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E,
    0x18, 0x20, 0x28, 0x30, 0x38,
    0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE,
    0xE0, 0xF0, 0xE8, 0xF8,
]);

const IMM16_OPS = new Set([
    0x01, 0x08, 0x11, 0x21, 0x31,
    0xC2, 0xC3, 0xCA, 0xCD, 0xD2, 0xDA,
    0xC4, 0xCC, 0xD4, 0xDC,
    0xEA, 0xFA,
]);

function hex(value, width = 2) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return '--';
    }
    return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
    return value < 0x80 ? value : value - 0x100;
}

function byteAt(gb, addr) {
    try {
        return gb.readByte(addr & 0xFFFF) & 0xFF;
    } catch (err) {
        return null;
    }
}

function wordFrom(lo, hi) {
    if (lo === null || hi === null) return null;
    return ((hi << 8) | lo) & 0xFFFF;
}

function instructionLength(opcode) {
    if (opcode === 0xCB) return 2;
    if (IMM16_OPS.has(opcode)) return 3;
    if (IMM8_OPS.has(opcode)) return 2;
    return 1;
}

function decodeCB(cb) {
    if (cb === null || cb === undefined) return 'CB --';

    const x = (cb >>> 6) & 0x03;
    const y = (cb >>> 3) & 0x07;
    const z = cb & 0x07;
    const target = r8Names[z];

    if (x === 0) return `${cbRotateNames[y]} ${target}`;
    if (x === 1) return `BIT ${y},${target}`;
    if (x === 2) return `RES ${y},${target}`;
    return `SET ${y},${target}`;
}

function disassemble(opcode, b1, b2, cbOpcode) {
    if (opcode === null || opcode === undefined) return 'CPU idle';
    if (opcode === 0xCB) return decodeCB(cbOpcode);

    const d16 = wordFrom(b1, b2);
    const x = (opcode >>> 6) & 0x03;
    const y = (opcode >>> 3) & 0x07;
    const z = opcode & 0x07;
    const p = y >>> 1;
    const q = y & 0x01;

    if (SIMPLE_OPS.has(opcode)) {
        if (opcode === 0xE0 || opcode === 0xF0) {
            const addr = b1 === null ? '--' : hex(0xFF00 + b1, 4);
            return `${SIMPLE_OPS.get(opcode)} [${addr}]`;
        }
        return SIMPLE_OPS.get(opcode);
    }

    if (x === 1 && opcode !== 0x76) {
        return `LD ${r8Names[y]},${r8Names[z]}`;
    }

    if (x === 2) {
        return `${aluNames[y]} ${r8Names[z]}`;
    }

    if (x === 0) {
        if (z === 0) {
            if (y === 0) return 'NOP';
            if (y === 1) return `LD (${hex(d16, 4)}),SP`;
            if (y === 2) return `STOP ${hex(b1)}`;
            if (y === 3) return `JR ${signed8(b1 ?? 0)}`;
            if (y >= 4 && y <= 7) return `JR ${conditions[y - 4]},${signed8(b1 ?? 0)}`;
        }

        if (z === 1) {
            if (q === 0) return `LD ${r16Names[p]},${hex(d16, 4)}`;
            return `ADD HL,${r16Names[p]}`;
        }

        if (z === 2) {
            const loadOps = ['LD (BC),A', 'LD (DE),A', 'LD (HL+),A', 'LD (HL-),A', 'LD A,(BC)', 'LD A,(DE)', 'LD A,(HL+)', 'LD A,(HL-)'];
            return loadOps[y] ?? `OP ${hex(opcode)}`;
        }

        if (z === 3) {
            return `${q === 0 ? 'INC' : 'DEC'} ${r16Names[p]}`;
        }

        if (z === 4) return `INC ${r8Names[y]}`;
        if (z === 5) return `DEC ${r8Names[y]}`;
        if (z === 6) return `LD ${r8Names[y]},${hex(b1)}`;

        if (z === 7) {
            const rotateOps = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'];
            return rotateOps[y] ?? `OP ${hex(opcode)}`;
        }
    }

    switch (opcode) {
        case 0xC0: return 'RET NZ';
        case 0xC8: return 'RET Z';
        case 0xD0: return 'RET NC';
        case 0xD8: return 'RET C';
        case 0xC2: return `JP NZ,${hex(d16, 4)}`;
        case 0xCA: return `JP Z,${hex(d16, 4)}`;
        case 0xD2: return `JP NC,${hex(d16, 4)}`;
        case 0xDA: return `JP C,${hex(d16, 4)}`;
        case 0xC3: return `JP ${hex(d16, 4)}`;
        case 0xCD: return `CALL ${hex(d16, 4)}`;
        case 0xC4: return `CALL NZ,${hex(d16, 4)}`;
        case 0xCC: return `CALL Z,${hex(d16, 4)}`;
        case 0xD4: return `CALL NC,${hex(d16, 4)}`;
        case 0xDC: return `CALL C,${hex(d16, 4)}`;
        case 0xE8: return `ADD SP,${signed8(b1 ?? 0)}`;
        case 0xF8: return `LD HL,SP+${signed8(b1 ?? 0)}`;
        case 0xEA: return `LD (${hex(d16, 4)}),A`;
        case 0xFA: return `LD A,(${hex(d16, 4)})`;
        default:
            if ((opcode & 0xC7) === 0xC7) {
                return `RST ${hex(opcode & 0x38)}`;
            }
            if ((opcode & 0xCF) === 0xC1) {
                return `POP ${['BC', 'DE', 'HL', 'AF'][(opcode >>> 4) & 0x03]}`;
            }
            if ((opcode & 0xCF) === 0xC5) {
                return `PUSH ${['BC', 'DE', 'HL', 'AF'][(opcode >>> 4) & 0x03]}`;
            }
            if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(opcode)) {
                const index = [0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].indexOf(opcode);
                return `${aluNames[index]} ${hex(b1)}`;
            }
            return `OP ${hex(opcode)}`;
    }
}

function bytesFor(entry) {
    if (!entry || entry.opcode === null || entry.opcode === undefined) return '--';

    const bytes = [entry.opcode];
    const len = instructionLength(entry.opcode);
    if (len >= 2 && entry.b1 !== null) bytes.push(entry.b1);
    if (len >= 3 && entry.b2 !== null) bytes.push(entry.b2);
    return bytes.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatTraceEntry(entry) {
    if (!entry) return '';

    if (entry.kind === 'interrupt') {
        return `${hex(entry.pc, 4)}  IRQ      ${entry.cycles}c -> ${hex(entry.postPc, 4)}`;
    }

    if (entry.kind === 'halt') {
        return `${hex(entry.pc, 4)}  HALT     ${entry.cycles}c`;
    }

    const mnemonic = disassemble(entry.opcode, entry.b1, entry.b2, entry.cbOpcode);
    return `${hex(entry.pc, 4)}  ${bytesFor(entry).padEnd(8, ' ')} ${mnemonic.padEnd(18, ' ')} ${String(entry.cycles).padStart(2, ' ')}c -> ${hex(entry.postPc, 4)}`;
}

function createMetric(parent, label) {
    const item = document.createElement('div');
    const name = document.createElement('span');
    const value = document.createElement('span');

    item.className = 'metric';
    name.className = 'metric-label';
    value.className = 'metric-value';
    name.textContent = label;
    value.textContent = '--';

    item.append(name, value);
    parent.append(item);
    return value;
}

class DebugProbe {
    constructor() {
        this.reset();
    }

    reset() {
        this.last = null;
        this.history = new Array(120);
        this.historyIndex = 0;
        this.historyCount = 0;
        this.instructionCount = 0;
    }

    attach(gb) {
        const originalStep = gb.cpu.step.bind(gb.cpu);

        gb.cpu.step = () => {
            const cpu = gb.cpu;
            const pc = cpu.pc & 0xFFFF;
            const ie = byteAt(gb, 0xFFFF) ?? 0;
            const iflag = byteAt(gb, 0xFF0F) ?? 0;
            const pending = (ie & iflag & 0x1F) !== 0;
            const isInterrupt = pending && !!cpu.ime;
            const isHaltIdle = cpu.halted && !pending;
            const opcode = isInterrupt || isHaltIdle ? null : byteAt(gb, pc);
            const b1 = opcode === null ? null : byteAt(gb, pc + 1);
            const b2 = opcode === null ? null : byteAt(gb, pc + 2);
            const cbOpcode = opcode === 0xCB ? b1 : null;
            const cycles = originalStep();
            const entry = {
                kind: isInterrupt ? 'interrupt' : isHaltIdle ? 'halt' : 'opcode',
                pc,
                opcode,
                b1,
                b2,
                cbOpcode,
                cycles,
                postPc: cpu.pc & 0xFFFF,
            };

            this.record(entry);
            return cycles;
        };
    }

    record(entry) {
        this.last = entry;
        this.instructionCount++;

        this.history[this.historyIndex] = entry;
        this.historyIndex = (this.historyIndex + 1) % this.history.length;
        this.historyCount = Math.min(this.historyCount + 1, this.history.length);
    }

    recentEntries() {
        const entries = [];
        for (let i = 0; i < this.historyCount; i++) {
            const index = (this.historyIndex - 1 - i + this.history.length) % this.history.length;
            entries.push(this.history[index]);
        }
        return entries;
    }
}

class DebugPanel {
    constructor(probe) {
        this.probe = probe;
        this.logOpen = false;
        this.lastOpcodeEntry = null;
        this.els = {
            runState: document.querySelector('#run-state'),
            romTitle: document.querySelector('#rom-title'),
            opcodeValue: document.querySelector('#opcode-value'),
            opcodeMnemonic: document.querySelector('#opcode-mnemonic'),
            opcodePc: document.querySelector('#opcode-pc'),
            opcodeCycles: document.querySelector('#opcode-cycles'),
            opcodeLog: document.querySelector('#opcode-log'),
            opcodeLogToggle: document.querySelector('#opcode-log-toggle'),
            registerGrid: document.querySelector('#register-grid'),
            cpuGrid: document.querySelector('#cpu-grid'),
            flagGrid: document.querySelector('#flag-grid'),
            ioGrid: document.querySelector('#io-grid'),
            mapperGrid: document.querySelector('#mapper-grid'),
            inputMap: document.querySelector('#input-map'),
        };

        this.regEls = {};
        this.cpuEls = {};
        this.ioEls = {};
        this.mapperEls = {};
        this.flagEls = {};
        this.inputEls = {};

        this.buildMetrics();
        this.bindLogToggle();
    }

    bindLogToggle() {
        this.els.opcodeLogToggle.addEventListener('click', () => {
            this.logOpen = !this.logOpen;
            this.els.opcodeLog.classList.toggle('is-open', this.logOpen);
            this.els.opcodeLogToggle.setAttribute('aria-expanded', String(this.logOpen));
            if (this.logOpen) {
                this.renderTrace();
            }
        });
    }

    buildMetrics() {
        ['A', 'F', 'B', 'C', 'D', 'E', 'H', 'L'].forEach((label) => {
            this.regEls[label.toLowerCase()] = createMetric(this.els.registerGrid, label);
        });

        ['AF', 'BC', 'DE', 'HL', 'PC', 'SP', 'IME', 'HALT', 'CYCLES'].forEach((label) => {
            this.cpuEls[label.toLowerCase()] = createMetric(this.els.cpuGrid, label);
        });

        ['Z', 'N', 'H', 'C'].forEach((label) => {
            const flag = document.createElement('div');
            flag.className = 'flag';
            flag.textContent = label;
            this.els.flagGrid.append(flag);
            this.flagEls[label.toLowerCase()] = flag;
        });

        ['IE', 'IF', 'JOYP', 'DIV', 'TIMA', 'TMA', 'TAC', 'LCDC', 'STAT', 'LY', 'LYC', 'SCX', 'SCY'].forEach((label) => {
            this.ioEls[label.toLowerCase()] = createMetric(this.els.ioGrid, label);
        });

        ['TITLE', 'MAPPER', 'ROM BANKS', 'RAM SIZE', 'ROM0', 'ROMX', 'RAM BANK', 'RAM ENABLE', 'MODE'].forEach((label) => {
            this.mapperEls[label.toLowerCase().replaceAll(' ', '')] = createMetric(this.els.mapperGrid, label);
        });

        INPUT_CONTROLS.forEach((control) => {
            const item = document.createElement('div');
            const action = document.createElement('span');
            const key = document.createElement('span');
            const state = document.createElement('span');

            item.className = 'input-map-item';
            action.className = 'input-action';
            key.className = 'input-key';
            state.className = 'input-state';

            action.textContent = control.action;
            key.textContent = control.key;
            state.textContent = 'UP';

            item.append(action, key, state);
            this.els.inputMap.append(item);
            this.inputEls[control.button] = { item, state };
        });
    }

    setRunState(state, label) {
        this.els.runState.dataset.state = state;
        this.els.runState.textContent = label;
    }

    render(gb, paused) {
        if (!gb) {
            this.setRunState('stopped', 'NO ROM');
            return;
        }

        this.setRunState(paused ? 'paused' : 'running', paused ? 'PAUSED' : 'RUNNING');
        this.renderOpcode();
        this.renderRegisters(gb);
        this.renderIO(gb);
        this.renderMapper(gb);
        this.renderInput(gb);

        if (this.logOpen) {
            this.renderTrace();
        }
    }

    renderOpcode() {
        const entry = this.probe.last;
        if (!entry) {
            this.els.opcodeMnemonic.textContent = 'Waiting for CPU';
            this.els.opcodePc.textContent = 'PC --';
            this.els.opcodeCycles.textContent = '-- cycles';
            return;
        }

        if (entry.kind === 'opcode') {
            this.lastOpcodeEntry = entry;
        }

        const opcodeEntry = this.lastOpcodeEntry ?? entry;
        this.els.opcodeValue.textContent = bytesFor(opcodeEntry);
        this.els.opcodeMnemonic.textContent = disassemble(opcodeEntry.opcode, opcodeEntry.b1, opcodeEntry.b2, opcodeEntry.cbOpcode);
        this.els.opcodePc.textContent = entry.kind === 'opcode'
            ? `PC ${hex(entry.pc, 4)} -> ${hex(entry.postPc, 4)}`
            : `${entry.kind.toUpperCase()} @ ${hex(entry.pc, 4)}`;
        this.els.opcodeCycles.textContent = `${entry.cycles} cycles`;
    }

    renderTrace() {
        this.els.opcodeLog.value = this.probe.recentEntries().map(formatTraceEntry).join('\n');
    }

    renderRegisters(gb) {
        const cpu = gb.cpu;
        const regs = {
            a: cpu.a,
            f: cpu.f & 0xF0,
            b: cpu.b,
            c: cpu.c,
            d: cpu.d,
            e: cpu.e,
            h: cpu.h,
            l: cpu.l,
        };

        Object.entries(regs).forEach(([name, value]) => {
            this.regEls[name].textContent = hex(value);
        });

        this.cpuEls.af.textContent = hex(cpu.AF, 4);
        this.cpuEls.bc.textContent = hex(cpu.BC, 4);
        this.cpuEls.de.textContent = hex(cpu.DE, 4);
        this.cpuEls.hl.textContent = hex(cpu.HL, 4);
        this.cpuEls.pc.textContent = hex(cpu.pc, 4);
        this.cpuEls.sp.textContent = hex(cpu.sp, 4);
        this.cpuEls.ime.textContent = cpu.ime ? 'ON' : 'OFF';
        this.cpuEls.halt.textContent = cpu.halted ? 'YES' : 'NO';
        this.cpuEls.cycles.textContent = String(cpu.cycles);

        this.flagEls.z.classList.toggle('is-active', (cpu.f & cpu.FLAG_Z) !== 0);
        this.flagEls.n.classList.toggle('is-active', (cpu.f & cpu.FLAG_N) !== 0);
        this.flagEls.h.classList.toggle('is-active', (cpu.f & cpu.FLAG_H) !== 0);
        this.flagEls.c.classList.toggle('is-active', (cpu.f & cpu.FLAG_C) !== 0);
    }

    renderIO(gb) {
        const reads = {
            ie: byteAt(gb, 0xFFFF),
            if: byteAt(gb, 0xFF0F),
            joyp: byteAt(gb, 0xFF00),
            div: byteAt(gb, 0xFF04),
            tima: byteAt(gb, 0xFF05),
            tma: byteAt(gb, 0xFF06),
            tac: byteAt(gb, 0xFF07),
            lcdc: byteAt(gb, 0xFF40),
            stat: byteAt(gb, 0xFF41),
            ly: byteAt(gb, 0xFF44),
            lyc: byteAt(gb, 0xFF45),
            scx: byteAt(gb, 0xFF43),
            scy: byteAt(gb, 0xFF42),
        };

        Object.entries(reads).forEach(([name, value]) => {
            this.ioEls[name].textContent = hex(value);
        });
    }

    renderMapper(gb) {
        const cart = gb.cartridge;
        const state = cart.mapperState ?? {};
        const mapper = cart.header?.mapperType ?? '--';
        const rom0 = this.safeValue(() => cart.isMBC1() ? cart.getCurrentMBC1FixedROMBank() : 0);
        const romx = this.safeValue(() => {
            if (cart.isMBC1()) return cart.getCurrentMBC1SwitchableROMBank();
            if (cart.isMBC3()) return cart.getCurrentMBC3ROMBank();
            return cart.getCurrentROMBank();
        });
        const ramBank = this.safeValue(() => {
            if (cart.isMBC1()) return cart.getCurrentMBC1RAMBank();
            if (cart.isMBC3()) return cart.getCurrentMBC3RAMBank();
            return cart.getCurrentRAMBank();
        });

        this.mapperEls.title.textContent = cart.header?.gameName || '--';
        this.mapperEls.mapper.textContent = mapper;
        this.mapperEls.rombanks.textContent = String(cart.getRomBankCount?.() ?? '--');
        this.mapperEls.ramsize.textContent = `${cart.header?.ramSize ?? 0} B`;
        this.mapperEls.rom0.textContent = String(rom0);
        this.mapperEls.romx.textContent = String(romx);
        this.mapperEls.rambank.textContent = String(ramBank);
        this.mapperEls.ramenable.textContent = state.ramEnabled ? 'ON' : 'OFF';
        this.mapperEls.mode.textContent = `ROM ${hex(state.romBankLow)} / RAM ${hex(state.ramBank)} / M ${state.bankingMode ?? 0}`;
        this.els.romTitle.textContent = cart.header?.gameName || gb.romFile || 'ROM';
    }

    renderInput(gb) {
        const buttons = gb.joypad?.buttons ?? {};
        INPUT_CONTROLS.forEach((control) => {
            const view = this.inputEls[control.button];
            const active = !!buttons[control.button];
            view.item.classList.toggle('is-active', active);
            view.state.textContent = active ? 'DOWN' : 'UP';
        });
    }

    safeValue(fn) {
        try {
            return fn();
        } catch (err) {
            return '--';
        }
    }
}

class Start {
    constructor(debugPanel, debugProbe) {
        this.gb = null;
        this.frameId = null;
        this.loadId = 0;
        this.paused = false;
        this.debugPanel = debugPanel;
        this.debugProbe = debugProbe;
        this.keyMap = {
            ArrowRight: 'right',
            ArrowLeft: 'left',
            ArrowUp: 'up',
            ArrowDown: 'down',
            KeyZ: 'a',
            KeyX: 'b',
            Enter: 'start',
            ShiftLeft: 'select',
            ShiftRight: 'select',
        };

        joypad.addEventListener('pointerdown', this.handlePadDown);
        joypad.addEventListener('pointerup', this.handlePadUp);
        joypad.addEventListener('pointercancel', this.handlePadCancel);
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', this.handleBlur);
        window.addEventListener('pointerdown', this.unlockAudio);
        window.addEventListener('keydown', this.unlockAudio);
        window.addEventListener('pagehide', this.flushSave);
    }

    flushSave = () => {
        this.gb?.cartridge?.flushBatterySave();
    };

    unlockAudio = async () => {
        if (!this.gb) return;

        try {
            await this.gb.apu.resume();
        } catch (err) {
            console.warn('音訊啟用失敗:', err);
        }
    };

    handlePadDown = (e) => {
        const btn = this.keyMap[e.target.dataset.key];
        if (!btn || !this.gb) return;

        e.preventDefault();
        this.gb.setButtonState(btn, true);
        this.debugPanel.render(this.gb, this.paused);
    };

    handlePadUp = (e) => {
        const btn = this.keyMap[e.target.dataset.key];
        if (!btn || !this.gb) return;

        e.preventDefault();
        this.gb.setButtonState(btn, false);
        this.debugPanel.render(this.gb, this.paused);
    };

    handlePadCancel = () => {
        this.gb?.releaseAllButtons();
        this.debugPanel.render(this.gb, this.paused);
    };

    handleKeyDown = (e) => {
        const btn = this.keyMap[e.code];
        if (!btn || !this.gb) return;

        e.preventDefault();
        this.gb.setButtonState(btn, true);
        this.debugPanel.render(this.gb, this.paused);
    };

    handleKeyUp = (e) => {
        const btn = this.keyMap[e.code];
        if (!btn || !this.gb) return;

        e.preventDefault();
        this.gb.setButtonState(btn, false);
        this.debugPanel.render(this.gb, this.paused);
    };

    handleBlur = () => {
        this.gb?.releaseAllButtons();
        this.debugPanel.render(this.gb, this.paused);
    };

    setupCanvas() {
        canvas.width = SCREEN_W;
        canvas.height = SCREEN_H;
        canvas.style.width = `${SCREEN_W * SCREEN_SCALE}px`;
        canvas.style.height = `${SCREEN_H * SCREEN_SCALE}px`;
        ctx.imageSmoothingEnabled = false;
    }

    reloadAfterAlert(message) {
        alert(message);
        window.location.reload();
    }

    async stop() {
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }

        if (!this.gb) {
            return;
        }

        this.gb.releaseAllButtons();
        this.gb.cartridge?.flushBatterySave();

        const audioCtx = this.gb.apu?.audioCtx;
        this.gb = null;

        if (audioCtx && audioCtx.state !== 'closed') {
            try {
                await audioCtx.close();
            } catch (err) {
                console.warn('音訊關閉失敗:', err);
            }
        }
    }

    async init(file) {
        const loadId = ++this.loadId;
        const romOptions = typeof file === 'string' ? { romFile: file, saveName: file } : file;

        await this.stop();

        const gb = new GB();
        this.gb = gb;
        this.paused = false;

        try {
            const header = await gb.init(romOptions);
            if (
                header.mapperType !== 'romOnly' &&
                !header.mapperType.startsWith('MBC1') &&
                !header.mapperType.startsWith('MBC3') &&
                !header.mapperType.startsWith('MBC5')
            ) {
                this.reloadAfterAlert(`目前只支援 ROM ONLY / MBC1 / MBC3 / MBC5，這個 ROM 是 ${header.mapperType}`);
                return;
            }
            if (this.loadId !== loadId || this.gb !== gb) {
                return;
            }

            this.debugProbe.reset();
            this.debugProbe.attach(gb);
            this.setupCanvas();
            this.debugPanel.render(gb, this.paused);

            const runFrame = () => {
                if (this.loadId !== loadId || this.gb !== gb) {
                    return;
                }

                if (!this.paused) {
                    let budget = CYCLES_PER_FRAME;

                    try {
                        while (budget > 0) {
                            budget -= gb.cpu.step();
                        }
                        gb.ppu.renderFrame(ctx);
                    } catch (err) {
                        console.error('CPU 執行中斷：', err);
                        if (this.gb === gb) {
                            this.gb.releaseAllButtons();
                            this.gb = null;
                        }
                        this.frameId = null;
                        this.debugPanel.render(null, false);
                        return;
                    }
                }

                this.debugPanel.render(gb, this.paused);
                this.frameId = requestAnimationFrame(runFrame);
            };

            this.frameId = requestAnimationFrame(runFrame);
        } catch (err) {
            if (this.gb === gb) {
                this.gb = null;
            }
            this.reloadAfterAlert(err.message ?? 'ROM 載入失敗');
            console.error(err);
        }
    }

    togglePause() {
        if (!this.gb) return;
        this.paused = !this.paused;
        this.debugPanel.render(this.gb, this.paused);
    }

    stepInstruction() {
        if (!this.gb) return;

        this.paused = true;

        try {
            this.gb.cpu.step();
            this.gb.ppu.renderFrame(ctx);
            this.debugPanel.render(this.gb, this.paused);
        } catch (err) {
            console.error('CPU 單步執行中斷：', err);
            this.gb.releaseAllButtons();
            this.gb = null;
            this.debugPanel.render(null, false);
        }
    }
}

const probe = new DebugProbe();
const debugPanel = new DebugPanel(probe);
const start = new Start(debugPanel, probe);
const romInput = document.querySelector('#rom-input');
const pauseToggle = document.querySelector('#pause-toggle');
const stepButton = document.querySelector('#step-button');

function syncPauseButton() {
    pauseToggle.textContent = start.paused ? 'Resume' : 'Pause';
}

start.init({ romFile: DEFAULT_ROM, saveName: DEFAULT_ROM }).then(syncPauseButton);

romInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const romUrl = URL.createObjectURL(file);

    try {
        await start.init({ romFile: romUrl, saveName: file.name });
        syncPauseButton();
    } catch (err) {
        console.error('ROM 載入失敗：', err);
    } finally {
        URL.revokeObjectURL(romUrl);
        e.target.value = '';
    }
});

pauseToggle.addEventListener('click', () => {
    start.togglePause();
    pauseToggle.textContent = start.paused ? 'Resume' : 'Pause';
});

stepButton.addEventListener('click', () => {
    start.stepInstruction();
    pauseToggle.textContent = 'Resume';
});
