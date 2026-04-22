export class APU {
    constructor() {
        this.regs = new Uint8Array(0x30); // FF10-FF3F
        this.masterEnabled = false;

        this.audioCtx = null;
        this.masterGain = null;

        this.ch1 = { osc: null, gain: null, active: false };
        this.ch2 = { osc: null, gain: null, active: false };
    }

    ensureAudio() {
        if (this.audioCtx) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;

        this.audioCtx = new Ctx();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 0;
        this.masterGain.connect(this.audioCtx.destination);

        this.ch1.gain = this.audioCtx.createGain();
        this.ch2.gain = this.audioCtx.createGain();
        this.ch1.gain.gain.value = 0;
        this.ch2.gain.gain.value = 0;
        this.ch1.gain.connect(this.masterGain);
        this.ch2.gain.connect(this.masterGain);
    }

    async resume() {
        this.ensureAudio();
        if (!this.audioCtx) return;
        if (this.audioCtx.state !== "running") {
            await this.audioCtx.resume();
        }
    }

    regIndex(addr) {
        return (addr & 0xFFFF) - 0xFF10;
    }

    readReg(addr) {
        addr &= 0xFFFF;
        if (addr < 0xFF10 || addr > 0xFF3F) return 0xFF;

        if (addr === 0xFF26) {
            let status = this.masterEnabled ? 0x80 : 0x00;
            if (this.ch1.active) status |= 0x01;
            if (this.ch2.active) status |= 0x02;
            return status | 0x70; // bits 4-6 read as 1
        }

        return this.regs[this.regIndex(addr)];
    }

    writeReg(addr, value) {
        addr &= 0xFFFF;
        value &= 0xFF;
        if (addr < 0xFF10 || addr > 0xFF3F) return;

        const i = this.regIndex(addr);

        if (addr === 0xFF26) {
            const enabled = (value & 0x80) !== 0;
            this.masterEnabled = enabled;
            this.regs[i] = value & 0x80;
            if (!enabled) {
                this.stopChannel(this.ch1);
                this.stopChannel(this.ch2);
            }
            this.updateMix();
            return;
        }

        this.regs[i] = value;

        // NR50/NR51
        if (addr === 0xFF24 || addr === 0xFF25) {
            this.updateMix();
            return;
        }

        // CH1 control/frequency
        if (addr >= 0xFF11 && addr <= 0xFF14) {
            if (addr === 0xFF14 && (value & 0x80)) {
                this.triggerChannel(1);
            } else {
                this.updateChannelParams(1);
            }
            return;
        }

        // CH2 control/frequency
        if (addr >= 0xFF16 && addr <= 0xFF19) {
            if (addr === 0xFF19 && (value & 0x80)) {
                this.triggerChannel(2);
            } else {
                this.updateChannelParams(2);
            }
        }
    }

    stopChannel(ch) {
        if (ch.osc) {
            try { ch.osc.stop(); } catch (_) { }
            try { ch.osc.disconnect(); } catch (_) { }
            ch.osc = null;
        }
        ch.active = false;
        if (ch.gain) ch.gain.gain.value = 0;
    }

    triggerChannel(which) {
        if (!this.masterEnabled) return;
        this.ensureAudio();
        const ch = which === 1 ? this.ch1 : this.ch2;
        if (!this.audioCtx || !ch.gain) return;

        if (!this.channelDacEnabled(which)) {
            this.stopChannel(ch);
            return;
        }

        this.stopChannel(ch);

        const hz = this.channelFrequency(which);
        if (hz <= 0) return;

        const osc = this.audioCtx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(hz, this.audioCtx.currentTime);
        osc.connect(ch.gain);
        osc.start();
        ch.osc = osc;
        ch.active = true;

        this.updateMix();
        this.updateChannelParams(which);
    }

    updateMix() {
        if (!this.masterGain || !this.audioCtx) return;

        const nr50 = this.regs[this.regIndex(0xFF24)];
        const right = (nr50 & 0x07) / 7;
        const left = ((nr50 >>> 4) & 0x07) / 7;
        const master = this.masterEnabled ? ((left + right) * 0.5) : 0;
        this.masterGain.gain.setTargetAtTime(master * 0.4, this.audioCtx.currentTime, 0.01);

        this.updateChannelParams(1);
        this.updateChannelParams(2);
    }

    channelPanEnabled(which) {
        const nr51 = this.regs[this.regIndex(0xFF25)];
        if (which === 1) return (nr51 & 0x11) !== 0;
        return (nr51 & 0x22) !== 0;
    }

    channelDacEnabled(which) {
        if (which === 1) {
            const nr12 = this.regs[this.regIndex(0xFF12)];
            return (nr12 & 0xF8) !== 0;
        }
        const nr22 = this.regs[this.regIndex(0xFF17)];
        return (nr22 & 0xF8) !== 0;
    }

    channelVolume(which) {
        if (which === 1) {
            const nr12 = this.regs[this.regIndex(0xFF12)];
            return ((nr12 >>> 4) & 0x0F) / 15;
        }
        const nr22 = this.regs[this.regIndex(0xFF17)];
        return ((nr22 >>> 4) & 0x0F) / 15;
    }

    channelFrequency(which) {
        let lo = 0;
        let hi = 0;
        if (which === 1) {
            lo = this.regs[this.regIndex(0xFF13)];
            hi = this.regs[this.regIndex(0xFF14)];
        } else {
            lo = this.regs[this.regIndex(0xFF18)];
            hi = this.regs[this.regIndex(0xFF19)];
        }

        const n = ((hi & 0x07) << 8) | lo;
        if (n >= 2048) return 0;
        return 131072 / (2048 - n);
    }

    updateChannelParams(which) {
        const ch = which === 1 ? this.ch1 : this.ch2;
        if (!ch.gain || !this.audioCtx) return;

        const enabled = this.masterEnabled && this.channelPanEnabled(which) && this.channelDacEnabled(which) && ch.active;
        const vol = enabled ? this.channelVolume(which) : 0;
        ch.gain.gain.setTargetAtTime(vol * 0.25, this.audioCtx.currentTime, 0.01);

        if (ch.osc) {
            const hz = this.channelFrequency(which);
            if (hz > 0) {
                ch.osc.frequency.setTargetAtTime(hz, this.audioCtx.currentTime, 0.005);
            }
        }
    }
}
