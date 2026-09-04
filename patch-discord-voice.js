#!/usr/bin/env node
// Patches Discord's discord_voice/index.js so screen-share video min bitrate is forced up.
// Usage: node patch-discord-voice.js [--min 4000] [--undo]   (min is kbps)
// Quit Discord fully before running. Re-run after Discord updates its modules.
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const undo = args.includes('--undo');
const minKbps = Number(args[args.indexOf('--min') + 1]) || 4000;
const MARK = '/*scfix*/';
const ORIG_LINE = 'setTransportOptions: (options) => instance.setTransportOptions(options),';
const PATCHED_LINE = `setTransportOptions: (options) => instance.setTransportOptions(__scfix(options)), ${MARK}`;

const hook = `${MARK}
const __SCFIX_MIN_BPS = ${minKbps * 1000};
const __scfixLog = path.join(os.homedir(), 'Library/Logs/scfix.log');
function __scfix(o) {
    try {
        if (!o || typeof o !== 'object') return o;
        const before = JSON.stringify(o);
        let touched = false;
        if (Array.isArray(o.streamParameters)) {
            for (const s of o.streamParameters) {
                if (s && typeof s === 'object' && ('maxBitrate' in s || 'minBitrate' in s)) {
                    s.minBitrate = __SCFIX_MIN_BPS;
                    s.maxBitrate = Math.max(Number(s.maxBitrate) || 0, __SCFIX_MIN_BPS);
                    touched = true;
                }
            }
        }
        if ('encodingVideoMinBitRate' in o || 'encodingVideoBitRate' in o || 'encodingVideoMaxBitRate' in o) {
            o.encodingVideoMinBitRate = __SCFIX_MIN_BPS;
            o.encodingVideoBitRate = Math.max(Number(o.encodingVideoBitRate) || 0, __SCFIX_MIN_BPS);
            o.encodingVideoMaxBitRate = Math.max(Number(o.encodingVideoMaxBitRate) || 0, __SCFIX_MIN_BPS);
            touched = true;
        }
        if (touched) fs.appendFileSync(__scfixLog, new Date().toISOString() + '\\nBEFORE ' + before + '\\nAFTER  ' + JSON.stringify(o) + '\\n');
    } catch (e) {
        try { fs.appendFileSync(__scfixLog, 'scfix error: ' + e + '\\n'); } catch (_) {}
    }
    return o;
}
`;

const roots = ['discordcanary', 'discord', 'discordptb']
    .map(d => path.join(os.homedir(), 'Library/Application Support', d))
    .filter(fs.existsSync);

let done = 0;
for (const root of roots) {
    const apps = fs.readdirSync(root).filter(n => n.startsWith('app-')).sort();
    if (!apps.length) continue;
    const modules = path.join(root, apps[apps.length - 1], 'modules');
    if (!fs.existsSync(modules)) continue;
    for (const m of fs.readdirSync(modules).filter(n => n.startsWith('discord_voice-'))) {
        const file = path.join(modules, m, 'discord_voice', 'index.js');
        if (!fs.existsSync(file)) continue;
        const bak = file + '.orig';
        let src = fs.readFileSync(file, 'utf8');
        if (undo) {
            if (fs.existsSync(bak)) { fs.copyFileSync(bak, file); console.log('restored', file); done++; }
            continue;
        }
        if (src.includes(MARK)) { src = fs.readFileSync(bak, 'utf8'); }  // re-patch from clean copy
        else fs.copyFileSync(file, bak);
        if (!src.includes(ORIG_LINE)) { console.error('pattern not found, Discord changed index.js:', file); continue; }
        src = src.replace(ORIG_LINE, PATCHED_LINE).replace("const path = require('path');\n", "const path = require('path');\n" + hook);
        if (!src.includes('function __scfix')) { console.error('hook insert failed:', file); continue; }
        fs.writeFileSync(file, src);
        console.log(`patched ${file} (min ${minKbps} kbps)`);
        done++;
    }
}
if (!done) { console.error('nothing patched'); process.exit(1); }
