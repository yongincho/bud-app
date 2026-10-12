/* The link between the app and a Bud.
 *
 * One small protocol, several transports:
 *   app -> Bud   { v: 1, type: 'show', state, caption, progress, look: { pack, shell }, mic, seq }
 *   Bud -> app   { v: 1, type: 'input', input: 'tap' | 'hold' | 'flip' }
 *                { v: 1, type: 'hello', device: { name, kind } }   (when a Bud connects)
 *
 * Transports: a Bud on the same page (the emulator beside the app), other tabs of
 * this browser (BroadcastChannel), other devices on a claude.ai preview (the room),
 * and Bluetooth for real hardware (GATT layout in docs/software.md; no hardware yet).
 */
(function (root) {
  'use strict';

  const BLE = {
    service: '6b65626a-0001-4b75-6400-62756464790a',
    show: '6b65626a-0002-4b75-6400-62756464790a', // write: state packet
    input: '6b65626a-0003-4b75-6400-62756464790a', // notify: tap, hold, flip
    audio: '6b65626a-0004-4b75-6400-62756464790a', // notify: Opus 16 kHz frames from Bud's mic
  };

  class Link {
    constructor(role) {
      this.role = role; // 'app' or 'device'
      this.handlers = new Set();
      this.transports = [];
      this.peers = 0;
      this.seq = 0;
      this.gen = 0;
    }
    /** Drop every transport (used when a screen switches between being the app and being Bud). */
    close() {
      this.gen++;
      this.transports.forEach((t) => t.close && t.close());
      this.transports = [];
    }
    on(fn) {
      this.handlers.add(fn);
      return () => this.handlers.delete(fn);
    }
    emit(msg) {
      msg = Object.assign({ v: 1, seq: ++this.seq, from: this.role }, msg);
      this.transports.forEach((t) => t.send(msg));
      return msg;
    }
    deliver(msg) {
      if (!msg || msg.v !== 1 || msg.from === this.role) return;
      this.handlers.forEach((fn) => fn(msg));
    }

    /** Same page: app and emulator side by side. */
    local(other) {
      const t = { name: 'local', send: (m) => setTimeout(() => other.deliver(m), 0) };
      this.transports.push(t);
      return t;
    }

    /** Other tabs and windows of this browser. */
    channel() {
      if (!('BroadcastChannel' in root)) return null;
      const bc = new BroadcastChannel('bud-link-v1');
      bc.onmessage = (e) => this.deliver(e.data);
      const t = { name: 'tabs', send: (m) => bc.postMessage(m), close: () => bc.close() };
      this.transports.push(t);
      return t;
    }

    /** Other devices with the same claude.ai preview open. */
    async room() {
      if (!(root.claude && root.claude.use)) return null;
      const gen = this.gen;
      const room = await root.claude.use('room').catch(() => null);
      if (!room || gen !== this.gen) return null;
      const off = room.on('bud.link', (m) => {
        if (!m.sameTab) this.deliver(m.data);
      });
      const t = { name: 'room', send: (m) => room.emit('bud.link', m).catch(() => {}), close: () => off && off() };
      this.transports.push(t);
      return t;
    }

    /** A real Bud over Bluetooth (Chrome on Android and desktop; not Safari). */
    async bluetooth() {
      if (!(root.navigator && navigator.bluetooth)) throw new Error('This browser has no Bluetooth access. Try Chrome on Android or a computer.');
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE.service] }] });
      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService(BLE.service);
      const show = await svc.getCharacteristic(BLE.show);
      const input = await svc.getCharacteristic(BLE.input);
      await input.startNotifications();
      const INPUTS = ['tap', 'hold', 'flip'];
      input.addEventListener('characteristicvaluechanged', (e) => this.deliver({ v: 1, from: 'device', type: 'input', input: INPUTS[e.target.value.getUint8(0)] || 'tap' }));
      const enc = new TextEncoder();
      const t = {
        name: 'bluetooth',
        // compact packet: state id, progress (0 to 255), caption (UTF-8, truncated)
        send: (m) => {
          if (m.type !== 'show') return;
          const ids = root.Bud ? root.Bud.STATES.map((s) => s.id) : [];
          const cap = enc.encode(String(m.caption || '').slice(0, 40));
          const buf = new Uint8Array(2 + cap.length);
          buf[0] = Math.max(0, ids.indexOf(m.state));
          buf[1] = Math.round((m.progress || 0) * 255);
          buf.set(cap, 2);
          show.writeValueWithoutResponse(buf).catch(() => {});
        },
      };
      this.transports.push(t);
      return { name: device.name || 'Bud', transport: t };
    }
  }

  root.BudLink = { Link, BLE };
})(window);
